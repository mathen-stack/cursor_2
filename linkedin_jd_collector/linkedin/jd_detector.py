"""
Job description panel detection helpers.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Callable

from ai.vision_agent import VisionAction, VisionAgent
from automation.keyboard_controller import KeyboardController
from automation.mouse_controller import MouseController

logger = logging.getLogger(__name__)


@dataclass
class JdDetector:
    """Locate About the job, expand if needed, select and copy raw JD text."""

    vision: VisionAgent
    mouse: MouseController
    keyboard: KeyboardController
    detail_wait_s: float = 1.2
    max_detail_attempts: int = 5

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
                    "If still loading, action=wait."
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
            if last.action == "wait":
                time.sleep((last.wait_ms or 800) / 1000.0)
            else:
                time.sleep(0.6)
        return last

    def find_jd_section(self, screenshot: bytes) -> VisionAction:
        """Ask vision to locate the About the job section."""
        action = self.vision.analyze_screenshot(
            screenshot,
            extra_context=(
                "Find the About the job section in the right detail panel. "
                "If Show more is visible, click it. "
                "Otherwise click/focus about_the_job and prepare for text selection. "
                "Return coordinates for the JD text region when possible."
            ),
        )
        if action.action == "click" and action.coordinates:
            self.mouse.move(action.coordinates.x, action.coordinates.y)
            self.mouse.click()
            if action.target == "show_more":
                time.sleep(0.7)
        return action

    def select_and_copy_jd(
        self,
        screenshot: bytes,
        *,
        select_fallback_region: tuple[int, int, int, int] | None = None,
    ) -> str:
        """
        Select JD text and copy via Ctrl+C. Returns clipboard text.
        """
        action = self.vision.analyze_screenshot(
            screenshot,
            extra_context=(
                "Select the original About the job text. "
                "Prefer action=copy after focusing the JD section. "
                "If a drag selection is needed, return coordinates at the start of "
                "the JD text (app will select a region). Do not invent JD text."
            ),
        )

        # Expand show more if requested
        if action.action == "click" and action.target == "show_more" and action.coordinates:
            self.mouse.move(action.coordinates.x, action.coordinates.y)
            self.mouse.click()
            time.sleep(0.7)
            screenshot = screenshot  # caller may recapture; continue with copy path

        raw = action.raw or {}
        select = raw.get("select") or raw.get("metadata", {}).get("select")
        if isinstance(select, dict) and all(k in select for k in ("x1", "y1", "x2", "y2")):
            self.mouse.select_text(
                int(select["x1"]),
                int(select["y1"]),
                int(select["x2"]),
                int(select["y2"]),
            )
        elif action.coordinates is not None:
            # Click into JD area then select-all in focused panel
            self.mouse.move(action.coordinates.x, action.coordinates.y)
            self.mouse.click()
            self.keyboard.hotkey("ctrl", "a")
        elif select_fallback_region is not None:
            x1, y1, x2, y2 = select_fallback_region
            self.mouse.select_text(x1, y1, x2, y2)
        else:
            # Last resort: copy whatever is focused
            logger.warning("No JD coordinates; attempting Ctrl+A/Ctrl+C on current focus")
            self.keyboard.hotkey("ctrl", "a")

        text = self.keyboard.copy(read_clipboard=True) or ""
        if not text.strip():
            raise RuntimeError("Clipboard empty after JD copy")
        logger.info("Copied JD text chars=%s", len(text))
        return text
