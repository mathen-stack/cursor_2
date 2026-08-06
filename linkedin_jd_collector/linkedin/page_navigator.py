"""
Pagination / page navigation for LinkedIn job results.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Callable

from ai.vision_agent import VisionAction, VisionAgent
from automation.mouse_controller import MouseController

logger = logging.getLogger(__name__)


@dataclass
class PageNavigator:
    """Detect and click Next / Previous; decide when collection is complete."""

    vision: VisionAgent
    mouse: MouseController
    page_load_wait_s: float | None = None
    max_page_wait_attempts: int = 4

    def __post_init__(self) -> None:
        if self.page_load_wait_s is None:
            try:
                from automation.pace import resolve_pace

                self.page_load_wait_s = resolve_pace().page_load_wait_s
            except Exception:  # noqa: BLE001
                self.page_load_wait_s = 3.0

    def detect_pagination(
        self,
        screenshot: bytes,
        *,
        extra_context: str = "",
    ) -> VisionAction:
        context = (
            "HUMAN WORKFLOW: every job on this page was opened and its JD copied. "
            "Now find the pagination Next button (usually bottom of the LEFT list "
            "or under the results). "
            "If Next is visible/enabled, return action=next_page with coordinates "
            "on the Next button. If Next is missing/disabled, return action=finish. "
            f"{extra_context}"
        )
        action = self.vision.analyze_screenshot(screenshot, extra_context=context)
        logger.info(
            "Pagination detect action=%s target=%s next=%s prev=%s",
            action.action,
            action.target,
            action.detections.get("next_button"),
            action.detections.get("previous_button"),
        )
        return action

    def has_next(self, action: VisionAction) -> bool:
        if action.action in {"finish", "need_user"}:
            return False
        if action.action == "next_page":
            return True
        if action.target == "next_button" and action.action == "click":
            return True
        if action.detections.get("next_button") is False:
            return False
        if action.detections.get("next_button") is True and action.coordinates:
            return True
        return False

    def click_next(self, action: VisionAction) -> bool:
        """Click the Next control described by a vision action."""
        if action.coordinates is None:
            logger.error("Cannot click Next: missing coordinates")
            return False
        logger.info(
            "Clicking Next at (%s,%s)", action.coordinates.x, action.coordinates.y
        )
        self.mouse.move(action.coordinates.x, action.coordinates.y)
        self.mouse.click()
        return True

    def go_to_next_page(
        self,
        capture: Callable[[], bytes],
        *,
        extra_context: str = "",
        should_stop: Callable[[], bool] | None = None,
    ) -> bool:
        """
        Detect Next, click it, and wait for the job list to refresh.

        Returns True if navigation happened; False if there is no Next / finish.
        """
        screenshot = capture()
        action = self.detect_pagination(screenshot, extra_context=extra_context)

        if not self.has_next(action):
            logger.info("No Next button / finish signaled — end of results")
            return False

        # Ensure we have coordinates; if next_page without coords, re-ask for click
        if action.coordinates is None:
            action = self.vision.analyze_screenshot(
                screenshot,
                extra_context=(
                    "Click the enabled Next pagination button. "
                    "Return action=click target=next_button with coordinates."
                ),
            )
            if action.coordinates is None:
                logger.warning("Next indicated but no coordinates; stopping pagination")
                return False

        if not self.click_next(action):
            return False

        return self.wait_for_new_jobs(capture, should_stop=should_stop)

    def wait_for_new_jobs(
        self,
        capture: Callable[[], bytes],
        *,
        should_stop: Callable[[], bool] | None = None,
    ) -> bool:
        """Wait until the page appears to show job cards again."""
        logger.info("Waiting %.1fs for next page jobs", self.page_load_wait_s)
        time.sleep(self.page_load_wait_s)

        for attempt in range(1, self.max_page_wait_attempts + 1):
            if should_stop and should_stop():
                logger.info("Stop requested while waiting for new jobs")
                return False
            shot = capture()
            action = self.vision.analyze_screenshot(
                shot,
                extra_context=(
                    "Did the LinkedIn job results page reload with job cards? "
                    "If job cards are visible, return action=wait and detections.job_cards=true. "
                    "If still loading, action=wait. If error/login wall, action=finish."
                ),
            )
            if action.action == "finish":
                logger.warning("Vision signaled finish while waiting for new page")
                return False
            if action.detections.get("job_cards") or action.detections.get("job_list"):
                logger.info("New page jobs detected on attempt=%s", attempt)
                return True
            if action.action == "wait":
                time.sleep((action.wait_ms or 800) / 1000.0)
            else:
                time.sleep(0.8)
        logger.warning("Timed out waiting for new jobs; continuing anyway")
        return True
