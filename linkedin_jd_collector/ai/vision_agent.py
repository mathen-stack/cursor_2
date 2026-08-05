"""
Vision agent: send LinkedIn screenshots to OpenRouter and return JSON actions.

AI scope only: understanding, detection, planning — not OS actuation.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .openrouter_client import OpenRouterClient, OpenRouterError
from .prompt_templates import SYSTEM_PROMPT, USER_INSTRUCTION, build_user_prompt

logger = logging.getLogger(__name__)

ALLOWED_ACTIONS = frozenset(
    {"click", "scroll", "wait", "copy", "next_page", "finish", "need_user"}
)
DEFAULT_MIN_CONFIDENCE = 0.45
ALLOWED_TARGETS = frozenset(
    {
        "linkedin_page",
        "job_list",
        "job_card",
        "selected_job",
        "about_the_job",
        "next_button",
        "previous_button",
        "show_more",
        "other",
    }
)

DETECTION_KEYS = (
    "linkedin_page",
    "job_list",
    "job_cards",
    "selected_job",
    "about_the_job",
    "next_button",
    "previous_button",
)


class VisionAgentError(Exception):
    """Base vision-agent error."""


class VisionJSONError(VisionAgentError):
    """Raised when the model output is not valid action JSON."""


@dataclass
class Coordinates:
    x: int
    y: int

    def to_dict(self) -> dict[str, int]:
        return {"x": self.x, "y": self.y}


@dataclass
class ScrollDelta:
    dx: int = 0
    dy: int = 0

    def to_dict(self) -> dict[str, int]:
        return {"dx": self.dx, "dy": self.dy}


@dataclass
class VisionAction:
    """Structured computer-use command returned by the vision model."""

    action: str
    target: str | None = None
    coordinates: Coordinates | None = None
    scroll: ScrollDelta | None = None
    wait_ms: int | None = None
    confidence: float | None = None
    observation: str | None = None
    detections: dict[str, bool] = field(default_factory=dict)
    raw: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "action": self.action,
            "target": self.target,
            "coordinates": self.coordinates.to_dict() if self.coordinates else None,
        }
        if self.scroll is not None:
            payload["scroll"] = self.scroll.to_dict()
        if self.wait_ms is not None:
            payload["wait_ms"] = self.wait_ms
        if self.confidence is not None:
            payload["confidence"] = self.confidence
        if self.observation is not None:
            payload["observation"] = self.observation
        if self.detections:
            payload["detections"] = self.detections
        return payload


def extract_json_object(text: str) -> dict[str, Any]:
    """
    Parse a JSON object from model text.

    Accepts pure JSON or fenced/markdown-wrapped JSON as a fallback.
    """
    cleaned = text.strip()
    if not cleaned:
        raise VisionJSONError("Model returned empty content")

    # Strip ```json ... ``` fences if present
    fence = re.search(r"```(?:json)?\s*(\{.*\})\s*```", cleaned, flags=re.DOTALL)
    if fence:
        cleaned = fence.group(1).strip()

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        # Fallback: first {...} block
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise VisionJSONError(f"Model output is not JSON: {text[:400]!r}") from None
        try:
            data = json.loads(cleaned[start : end + 1])
        except json.JSONDecodeError as exc:
            raise VisionJSONError(
                f"Failed to parse JSON from model output: {exc}"
            ) from exc

    if not isinstance(data, dict):
        raise VisionJSONError("JSON root must be an object")
    return data


def validate_action_payload(data: dict[str, Any]) -> VisionAction:
    """Validate and normalize a model JSON object into VisionAction."""
    action = str(data.get("action", "")).strip().lower()
    if action not in ALLOWED_ACTIONS:
        raise VisionJSONError(
            f"Invalid action {action!r}. Allowed: {sorted(ALLOWED_ACTIONS)}"
        )

    target_raw = data.get("target")
    target = str(target_raw).strip().lower() if target_raw not in (None, "") else None
    if target is not None and target not in ALLOWED_TARGETS:
        raise VisionJSONError(
            f"Invalid target {target!r}. Allowed: {sorted(ALLOWED_TARGETS)}"
        )

    coordinates = _parse_coordinates(data.get("coordinates"))
    scroll = _parse_scroll(data.get("scroll"))
    wait_ms = _parse_optional_int(data.get("wait_ms"), field_name="wait_ms")
    confidence = _parse_optional_float(data.get("confidence"), field_name="confidence")
    observation = data.get("observation")
    if observation is not None:
        observation = str(observation)

    detections = _parse_detections(data.get("detections"))

    # Action-specific requirements
    if action == "click":
        if coordinates is None:
            raise VisionJSONError("action=click requires coordinates {x,y}")
        if target is None:
            target = "other"
    elif action == "scroll":
        if scroll is None:
            # default modest downward scroll if model omitted deltas
            scroll = ScrollDelta(dx=0, dy=-400)
        if coordinates is None:
            # scroll can still work with a default focal point; keep None allowed
            pass
    elif action == "wait":
        if wait_ms is None:
            wait_ms = 800
        if wait_ms < 0:
            raise VisionJSONError("wait_ms must be >= 0")
    elif action == "copy":
        if target is None:
            target = "about_the_job"
    elif action == "next_page":
        if target is None:
            target = "next_button"
    elif action == "finish":
        pass
    elif action == "need_user":
        if not observation:
            observation = "Human intervention required"

    return VisionAction(
        action=action,
        target=target,
        coordinates=coordinates,
        scroll=scroll,
        wait_ms=wait_ms,
        confidence=confidence,
        observation=observation,
        detections=detections,
        raw=data,
    )


def _parse_coordinates(value: Any) -> Coordinates | None:
    if value is None:
        return None
    if not isinstance(value, dict):
        raise VisionJSONError("coordinates must be an object with x,y")
    try:
        x = int(round(float(value["x"])))
        y = int(round(float(value["y"])))
    except (KeyError, TypeError, ValueError) as exc:
        raise VisionJSONError("coordinates must include numeric x and y") from exc
    return Coordinates(x=x, y=y)


def _parse_scroll(value: Any) -> ScrollDelta | None:
    if value is None:
        return None
    if not isinstance(value, dict):
        raise VisionJSONError("scroll must be an object with dx,dy")
    try:
        dx = int(round(float(value.get("dx", 0))))
        dy = int(round(float(value.get("dy", 0))))
    except (TypeError, ValueError) as exc:
        raise VisionJSONError("scroll dx/dy must be numeric") from exc
    return ScrollDelta(dx=dx, dy=dy)


def _parse_optional_int(value: Any, *, field_name: str) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(round(float(value)))
    except (TypeError, ValueError) as exc:
        raise VisionJSONError(f"{field_name} must be numeric") from exc


def _parse_optional_float(value: Any, *, field_name: str) -> float | None:
    if value is None or value == "":
        return None
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise VisionJSONError(f"{field_name} must be numeric") from exc
    if number < 0 or number > 1:
        # clamp soft guidance rather than fail hard
        number = max(0.0, min(1.0, number))
    return number


def _parse_detections(value: Any) -> dict[str, bool]:
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise VisionJSONError("detections must be an object of booleans")
    out: dict[str, bool] = {}
    for key in DETECTION_KEYS:
        if key in value:
            out[key] = bool(value[key])
    # Preserve any extra keys as bools for forward compatibility
    for key, raw in value.items():
        if key not in out:
            out[str(key)] = bool(raw)
    return out


class VisionAgent:
    """
    High-level OpenRouter vision planner for LinkedIn JD collection.
    """

    def __init__(
        self,
        client: OpenRouterClient | None = None,
        *,
        parse_retries: int = 2,
        min_confidence: float = DEFAULT_MIN_CONFIDENCE,
    ) -> None:
        self._client = client or OpenRouterClient()
        self._owns_client = client is None
        self.parse_retries = max(1, parse_retries)
        self.min_confidence = min_confidence
        logger.info(
            "VisionAgent initialized parse_retries=%s min_confidence=%.2f",
            self.parse_retries,
            self.min_confidence,
        )

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def __enter__(self) -> VisionAgent:
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()

    @property
    def instruction(self) -> str:
        return USER_INSTRUCTION

    def analyze_screenshot(
        self,
        screenshot: bytes | str | Path,
        *,
        extra_context: str | None = None,
        mime_type: str | None = None,
    ) -> VisionAction:
        """
        Send a screenshot to OpenRouter and return a validated JSON action.

        Input:
            screenshot image (bytes or path)
        Instruction:
            "Analyze this LinkedIn page and decide the next computer action."
        """
        user_prompt = build_user_prompt(extra_context)
        last_error: Exception | None = None

        for attempt in range(1, self.parse_retries + 1):
            try:
                logger.info(
                    "Vision analyze attempt=%s/%s instruction=%r",
                    attempt,
                    self.parse_retries,
                    USER_INSTRUCTION,
                )
                raw_text = self._client.complete_with_image(
                    system_prompt=SYSTEM_PROMPT,
                    user_text=user_prompt,
                    image=screenshot,
                    mime_type=mime_type,
                )
                logger.debug("Vision raw model text: %s", raw_text[:1000])
                payload = extract_json_object(raw_text)
                action = validate_action_payload(payload)
                if (
                    action.confidence is not None
                    and action.confidence < self.min_confidence
                    and action.action in {"click", "next_page", "copy"}
                ):
                    raise VisionJSONError(
                        f"Low confidence {action.confidence:.2f} < {self.min_confidence:.2f} "
                        f"for action={action.action}"
                    )
                logger.info(
                    "Vision action=%s target=%s coords=%s confidence=%s observation=%r",
                    action.action,
                    action.target,
                    action.coordinates.to_dict() if action.coordinates else None,
                    action.confidence,
                    action.observation,
                )
                return action
            except VisionJSONError as exc:
                last_error = exc
                logger.warning(
                    "Invalid vision JSON attempt=%s/%s: %s",
                    attempt,
                    self.parse_retries,
                    exc,
                )
            except OpenRouterError as exc:
                # Network/API failures already retried inside the client.
                logger.error("OpenRouter failure during vision analyze: %s", exc)
                raise VisionAgentError(str(exc)) from exc

        raise VisionJSONError(
            f"Failed to obtain valid JSON action after {self.parse_retries} attempts: "
            f"{last_error}"
        )

    # Convenience alias matching product language
    decide_next_action = analyze_screenshot
