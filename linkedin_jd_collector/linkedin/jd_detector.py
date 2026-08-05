"""
JD extraction helper.

Matches the human LinkedIn copy stages:
1. Job is open — right panel shows "About the job".
2. Drag-select from the "About the job" heading down through the JD body
   (Role / requirements / offer / …).
3. Ctrl+C copies the highlighted original text (no summarize/rewrite).

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
    "STAGE: locate LinkedIn job description for drag-select copy.\n"
    "The right detail panel should show the heading 'About the job' and the "
    "JD body below it (Role, requirements, offer, etc.).\n"
    "If a 'Show more' control truncates the JD, return action=click "
    "target=show_more with coordinates on that control.\n"
    "Otherwise return action=copy target=about_the_job and include a drag "
    "region covering the JD like the human workflow:\n"
    '  "select": {"x1":..,"y1":..,"x2":..,"y2":..}\n'
    "where (x1,y1) is on/near the 'About the job' heading and (x2,y2) is "
    "near the bottom of the JD text in the RIGHT panel only "
    "(do not include the left job list, Apply/Save buttons, or browser chrome).\n"
    "Also set coordinates to the About the job focus point.\n"
    "Do NOT invent, summarize, or rewrite any job description text."
)

JD_SELECT_PROMPT = (
    "STAGE: prepare drag-select of the original 'About the job' body.\n"
    "Return action=copy target=about_the_job with "
    '"select":{"x1":..,"y1":..,"x2":..,"y2":..} from the About the job '
    "heading down through the full visible JD in the right panel.\n"
    "If a full region is hard, at least return coordinates on the "
    "About the job heading/text so the app can drag downward.\n"
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


def right_panel_jd_region(
    width: int, height: int
) -> tuple[int, int, int, int]:
    """
    Heuristic drag box matching LinkedIn Jobs split view.

    Starts under the Apply/Save / match widgets near 'About the job',
    stays in the right pane, ends near the bottom of the detail panel.
    """
    w = max(1, int(width))
    h = max(1, int(height))
    return (
        max(0, int(w * 0.38)),
        max(0, int(h * 0.42)),
        max(1, int(w * 0.96)),
        max(1, int(h * 0.90)),
    )


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
    Locate About the job → drag-select JD body → Ctrl+C → read clipboard exactly.
    """

    vision: VisionAgent
    mouse: MouseController
    keyboard: KeyboardController
    clipboard: ClipboardService = field(default_factory=ClipboardService)
    detail_wait_s: float = 1.2
    max_detail_attempts: int = 5
    max_extract_attempts: int = 3
    # Longer drag so the highlight can travel the full JD like a human.
    select_drag_duration_s: float = 0.55

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
                    "STAGE: job card was just clicked. Confirm the right detail "
                    "panel loaded with 'About the job' visible. "
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

    # --- step 2: mouse drag-selects text ---------------------------------

    def select_jd_text(
        self,
        action: VisionAction,
        *,
        select_fallback_region: tuple[int, int, int, int] | None = None,
    ) -> str:
        """
        Step 2 — Drag-select JD text from About the job downward.

        Prefer an explicit select region; else expand a focus point into a
        downward drag; else use the right-panel fallback region. Ctrl+A is
        last resort (often grabs the left job list on LinkedIn).
        """
        # Expand truncated JD first if needed
        if action.action == "click" and action.target == "show_more" and action.coordinates:
            self.mouse.move(action.coordinates.x, action.coordinates.y)
            self.mouse.click()
            time.sleep(0.7)

        region = self._extract_select_region(action)
        if region is not None:
            x1, y1, x2, y2 = region
            logger.info(
                "JD stage select: drag region (%s,%s)->(%s,%s)", x1, y1, x2, y2
            )
            self.mouse.select_text(
                x1, y1, x2, y2, duration=self.select_drag_duration_s
            )
            return "drag_region"

        # Focus point on About the job → drag down through the right pane.
        if action.coordinates is not None and select_fallback_region is not None:
            fx, fy = int(action.coordinates.x), int(action.coordinates.y)
            _x1, _y1, x2, y2 = select_fallback_region
            # Keep start near the AI focus (About the job); end at panel bottom.
            x1 = min(fx, x2 - 8)
            y1 = min(fy, y2 - 8)
            logger.info(
                "JD stage select: drag from About focus (%s,%s)->(%s,%s)",
                x1,
                y1,
                x2,
                y2,
            )
            self.mouse.select_text(
                x1, y1, x2, y2, duration=self.select_drag_duration_s
            )
            return "focus_drag"

        if select_fallback_region is not None:
            x1, y1, x2, y2 = select_fallback_region
            logger.info(
                "JD stage select: right-panel fallback drag (%s,%s)->(%s,%s)",
                x1,
                y1,
                x2,
                y2,
            )
            self.mouse.select_text(
                x1, y1, x2, y2, duration=self.select_drag_duration_s
            )
            return "fallback_region"

        if action.coordinates is not None:
            logger.info(
                "JD stage select: click+Ctrl+A fallback at (%s,%s)",
                action.coordinates.x,
                action.coordinates.y,
            )
            self.mouse.move(action.coordinates.x, action.coordinates.y)
            self.mouse.click()
            time.sleep(0.12)
            self.keyboard.hotkey("ctrl", "a")
            return "click_ctrl_a"

        logger.warning("No JD coordinates from AI; Ctrl+A on current focus")
        self.keyboard.hotkey("ctrl", "a")
        return "focus_ctrl_a"

    # --- steps 3-4: Ctrl+C + clipboard read ------------------------------

    def copy_jd_from_selection(self) -> str:
        """
        Steps 3-4 — Send Ctrl+C (same as Copy in the browser menu), then
        read clipboard exactly as copied.
        """
        previous = self.clipboard.clear_with_sentinel()
        logger.info("JD stage copy: sending Ctrl+C")
        self.keyboard.hotkey("ctrl", "c")
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
                # 1. AI identifies JD location / select box
                location = self.identify_jd_location(screenshot)

                # If show_more was clicked, re-capture before select guidance
                if location.target == "show_more":
                    screenshot = capture()
                    location = self.vision.analyze_screenshot(
                        screenshot, extra_context=JD_SELECT_PROMPT
                    )

                # 2. Mouse drag-selects text (About the job → end of JD)
                method = self.select_jd_text(
                    location, select_fallback_region=select_fallback_region
                )

                # Brief settle so the browser finishes the highlight.
                time.sleep(0.15)

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
            x1 = int(round(float(select["x1"])))
            y1 = int(round(float(select["y1"])))
            x2 = int(round(float(select["x2"])))
            y2 = int(round(float(select["y2"])))
        except (KeyError, TypeError, ValueError):
            return None
        # Degenerate / tiny boxes are useless — treat as missing.
        if abs(x2 - x1) < 40 or abs(y2 - y1) < 40:
            return None
        return x1, y1, x2, y2
