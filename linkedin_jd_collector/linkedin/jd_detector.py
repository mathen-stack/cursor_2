"""
JD extraction helper.

Goal: copy the original LinkedIn job description text.

Process:
1. AI identifies JD location ("About the job").
2. Mouse selects the text.
3. Keyboard sends Ctrl+C.
4. Clipboard reader gets the text.
5. Return/save exactly as copied.

Does NOT summarize, modify, or parse JD content.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any, Callable

from ai.vision_agent import VisionAction, VisionAgent
from automation.clipboard import ClipboardError, ClipboardService
from automation.keyboard_controller import KeyboardController
from automation.mouse_controller import MouseController

logger = logging.getLogger(__name__)

JD_LOCATE_PROMPT = (
    "Identify the location of the original LinkedIn job description text "
    "in the right detail panel (the 'About the job' section). "
    "If a 'Show more' control is visible and the JD is truncated, click show_more. "
    "Otherwise return action=click target=about_the_job with coordinates inside "
    "the JD text, and when possible include "
    '"select": {"x1":..,"y1":..,"x2":..,"y2":..} covering the JD body. '
    "Do NOT invent, summarize, or rewrite any job description text."
)

JD_SELECT_PROMPT = (
    "Prepare to copy the original 'About the job' text exactly. "
    "Return coordinates for selecting the JD body. Prefer a select region "
    '{"select":{"x1":..,"y1":..,"x2":..,"y2":..}}. '
    "If only a focus point is known, return action=copy target=about_the_job "
    "with coordinates inside the JD panel. "
    "Do NOT return JD text content yourself."
)


class JdExtractionError(RuntimeError):
    """Raised when JD location/selection/copy fails."""


MIN_JD_CHARS = 80
_REJECT_CLIPBOARD_SNIPPETS = (
    "sign in",
    "join now",
    "are you a robot",
    "security check",
    "verify you are",
)


def validate_raw_jd_text(text: str) -> str:
    """
    Light safety checks only — does not summarize/parse/modify JD content.

    Rejects empty/tiny clipboard payloads and obvious non-JD blockers.
    Returns the original text unchanged when accepted.
    """
    if text is None:
        raise JdExtractionError("Clipboard text is None")
    raw = text  # keep exact content
    stripped = raw.strip()
    if len(stripped) < MIN_JD_CHARS:
        raise JdExtractionError(
            f"Clipboard text too short for a JD ({len(stripped)} chars; min {MIN_JD_CHARS})"
        )
    low = stripped.lower()
    for snippet in _REJECT_CLIPBOARD_SNIPPETS:
        if snippet in low and len(stripped) < 400:
            raise JdExtractionError(
                f"Clipboard looks like a blocker/UI prompt ({snippet!r}), not a JD"
            )
    return raw


@dataclass
class JdExtractionResult:
    """Raw JD payload taken from the clipboard — unmodified."""

    text: str
    location: VisionAction | None = None
    selection_method: str = "unknown"
    chars: int = 0

    def __post_init__(self) -> None:
        self.chars = len(self.text) if self.text is not None else 0


@dataclass
class JdDetector:
    """
    Locate About the job, select it, copy with Ctrl+C, read clipboard exactly.
    """

    vision: VisionAgent
    mouse: MouseController
    keyboard: KeyboardController
    clipboard: ClipboardService = field(default_factory=ClipboardService)
    detail_wait_s: float = 1.2
    max_detail_attempts: int = 5
    max_extract_attempts: int = 3

    # --- panel readiness -------------------------------------------------

    def wait_for_details_panel(
        self,
        capture: Callable[[], bytes],
        *,
        should_stop: Callable[[], bool] | None = None,
    ) -> VisionAction | None:
        """Wait until the right-side detail / About the job area is visible."""
        time.sleep(self.detail_wait_s)
        last: VisionAction | None = None
        for attempt in range(1, self.max_detail_attempts + 1):
            if should_stop and should_stop():
                return None
            shot = capture()
            last = self.vision.analyze_screenshot(
                shot,
                extra_context=(
                    "A job card was just clicked. Confirm the details panel loaded. "
                    "If About the job is visible, return action=wait with "
                    "detections.about_the_job=true and detections.selected_job=true. "
                    "If Show more is needed, click show_more. "
                    "If still loading, action=wait. "
                    "Do not invent JD text."
                ),
            )
            logger.info(
                "Detail wait attempt=%s about=%s selected=%s action=%s",
                attempt,
                last.detections.get("about_the_job"),
                last.detections.get("selected_job"),
                last.action,
            )
            if last.action == "click" and last.coordinates and last.target in {
                "show_more",
                "about_the_job",
                "selected_job",
            }:
                self.mouse.move(last.coordinates.x, last.coordinates.y)
                self.mouse.click()
                time.sleep(0.8)
                continue
            if last.detections.get("about_the_job") or last.detections.get("selected_job"):
                return last
            # Small VL models often omit detections — treat copy/about click as ready.
            if last.action in {"copy", "click"} and last.target in {
                "about_the_job",
                "selected_job",
                "show_more",
                "other",
            }:
                return last
            if last.action == "wait":
                time.sleep((last.wait_ms or 800) / 1000.0)
            else:
                time.sleep(0.6)
        # Proceed optimistically — extract_jd has its own right-panel fallback.
        logger.warning(
            "Details panel not confirmed after %s attempts; continuing to JD extract",
            self.max_detail_attempts,
        )
        return last

    # --- step 1: AI identifies JD location -------------------------------

    def identify_jd_location(self, screenshot: bytes) -> VisionAction:
        """Step 1 — AI identifies where the original JD text is on screen."""
        action = self.vision.analyze_screenshot(
            screenshot,
            extra_context=JD_LOCATE_PROMPT,
        )
        logger.info(
            "JD location action=%s target=%s coords=%s about=%s",
            action.action,
            action.target,
            action.coordinates.to_dict() if action.coordinates else None,
            action.detections.get("about_the_job"),
        )

        # Click Show more / focus JD if AI requested it
        if action.action == "click" and action.coordinates:
            self.mouse.move(action.coordinates.x, action.coordinates.y)
            self.mouse.click()
            if action.target == "show_more":
                time.sleep(0.7)
        return action

    # Backwards-compatible alias used by workflow
    def find_jd_section(self, screenshot: bytes) -> VisionAction:
        return self.identify_jd_location(screenshot)

    # --- step 2: mouse selects text --------------------------------------

    def select_jd_text(
        self,
        action: VisionAction,
        *,
        select_fallback_region: tuple[int, int, int, int] | None = None,
    ) -> str:
        """
        Step 2 — Mouse-select the JD text region described by the AI.

        Returns the selection method name for logging.
        """
        # Expand truncated JD first if needed
        if action.action == "click" and action.target == "show_more" and action.coordinates:
            self.mouse.move(action.coordinates.x, action.coordinates.y)
            self.mouse.click()
            time.sleep(0.7)

        region = self._extract_select_region(action)
        if region is not None:
            x1, y1, x2, y2 = region
            logger.info("Selecting JD via drag region (%s,%s)->(%s,%s)", x1, y1, x2, y2)
            self.mouse.select_text(x1, y1, x2, y2)
            return "drag_region"

        if action.coordinates is not None:
            logger.info(
                "Selecting JD via click+Ctrl+A at (%s,%s)",
                action.coordinates.x,
                action.coordinates.y,
            )
            self.mouse.move(action.coordinates.x, action.coordinates.y)
            self.mouse.click()
            self.keyboard.hotkey("ctrl", "a")
            return "click_ctrl_a"

        if select_fallback_region is not None:
            x1, y1, x2, y2 = select_fallback_region
            logger.info(
                "Selecting JD via fallback region (%s,%s)->(%s,%s)", x1, y1, x2, y2
            )
            self.mouse.select_text(x1, y1, x2, y2)
            return "fallback_region"

        logger.warning("No JD coordinates from AI; Ctrl+A on current focus")
        self.keyboard.hotkey("ctrl", "a")
        return "focus_ctrl_a"

    # --- steps 3-4: Ctrl+C + clipboard read ------------------------------

    def copy_jd_from_selection(self) -> str:
        """
        Steps 3-4 — Send Ctrl+C, then read clipboard exactly as copied.
        """
        previous = self.clipboard.clear_with_sentinel()
        # Step 3
        logger.info("Sending Ctrl+C for JD copy")
        self.keyboard.hotkey("ctrl", "c")
        # Step 4 — exact clipboard contents, no transform
        text = self.clipboard.read_after_copy(previous=previous, require_change=True)
        return text

    # --- full extraction pipeline ----------------------------------------

    def extract_jd(
        self,
        capture: Callable[[], bytes],
        *,
        select_fallback_region: tuple[int, int, int, int] | None = None,
        should_stop: Callable[[], bool] | None = None,
    ) -> JdExtractionResult:
        """
        Run the full JD extraction process and return raw clipboard text.
        """
        last_error: Exception | None = None
        for attempt in range(1, self.max_extract_attempts + 1):
            if should_stop and should_stop():
                raise JdExtractionError("Stop requested during JD extraction")
            try:
                screenshot = capture()
                # 1. AI identifies JD location
                location = self.identify_jd_location(screenshot)

                # If show_more was clicked, re-capture before select guidance
                if location.target == "show_more":
                    screenshot = capture()
                    location = self.vision.analyze_screenshot(
                        screenshot, extra_context=JD_SELECT_PROMPT
                    )

                # 2. Mouse selects text
                method = self.select_jd_text(
                    location, select_fallback_region=select_fallback_region
                )

                # 3-4. Ctrl+C + clipboard read (exact)
                text = self.copy_jd_from_selection()
                text = validate_raw_jd_text(text)

                logger.info(
                    "JD extracted exactly from clipboard chars=%s method=%s attempt=%s",
                    len(text),
                    method,
                    attempt,
                )
                return JdExtractionResult(
                    text=text,
                    location=location,
                    selection_method=method,
                )
            except (ClipboardError, JdExtractionError) as exc:
                last_error = exc
                logger.warning(
                    "JD extraction attempt=%s/%s failed: %s",
                    attempt,
                    self.max_extract_attempts,
                    exc,
                )
            except Exception as exc:  # noqa: BLE001
                last_error = JdExtractionError(str(exc))
                logger.exception(
                    "JD extraction attempt=%s/%s error",
                    attempt,
                    self.max_extract_attempts,
                )
            time.sleep(0.5)

        raise JdExtractionError(
            f"Failed to extract JD after {self.max_extract_attempts} attempts: {last_error}"
        )

    def select_and_copy_jd(
        self,
        screenshot: bytes,
        *,
        select_fallback_region: tuple[int, int, int, int] | None = None,
        capture: Callable[[], bytes] | None = None,
    ) -> str:
        """
        Compatibility helper used by the workflow.

        Returns the original clipboard text exactly as copied.
        """
        if capture is None:
            frozen = screenshot

            def capture() -> bytes:
                return frozen

        result = self.extract_jd(
            capture, select_fallback_region=select_fallback_region
        )
        return result.text

    # --- helpers ---------------------------------------------------------

    @staticmethod
    def _extract_select_region(
        action: VisionAction,
    ) -> tuple[int, int, int, int] | None:
        raw: dict[str, Any] = action.raw or {}
        select = raw.get("select")
        if select is None and isinstance(raw.get("metadata"), dict):
            select = raw["metadata"].get("select")
        if not isinstance(select, dict):
            return None
        try:
            return (
                int(round(float(select["x1"]))),
                int(round(float(select["y1"]))),
                int(round(float(select["x2"]))),
                int(round(float(select["y2"]))),
            )
        except (KeyError, TypeError, ValueError):
            return None
