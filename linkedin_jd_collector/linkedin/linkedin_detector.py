"""
LinkedIn page/window detector.

Verifies the current screen shows LinkedIn job results before the agent
starts clicking jobs. Uses vision first; optionally focuses a browser
window via PyWinAuto on Windows.
"""

from __future__ import annotations

import logging
import os
import sys
from dataclasses import dataclass
from typing import Callable

from ai.vision_agent import VisionAction, VisionAgent

logger = logging.getLogger(__name__)


class LinkedInNotFoundError(RuntimeError):
    """Raised when LinkedIn job results UI is not detectable."""


@dataclass
class LinkedInDetector:
    vision: VisionAgent
    max_attempts: int = 3

    def focus_browser_window(self) -> bool:
        """Best-effort focus of a LinkedIn browser window (Windows/pywinauto)."""
        if not sys.platform.startswith("win"):
            return False
        # Off by default — pywinauto/UIA has hard-crashed frozen EXEs for some users.
        enabled = os.getenv("ENABLE_PYWINAUTO", "").strip().lower() in {
            "1",
            "true",
            "yes",
        }
        if not enabled:
            logger.info("Skipping pywinauto focus (set ENABLE_PYWINAUTO=1 to enable)")
            return False
        try:
            from pywinauto import Desktop
        except Exception:  # noqa: BLE001
            logger.debug("pywinauto unavailable for window focus", exc_info=True)
            return False

        # Caller (agent worker thread) must CoInitialize on Windows before this.
        try:
            desktop = Desktop(backend="uia")
            candidates = []
            for w in desktop.windows():
                try:
                    title = w.window_text() or ""
                except Exception:  # noqa: BLE001
                    continue
                low = title.lower()
                if "linkedin" in low and (
                    "chrome" in low
                    or "edge" in low
                    or "firefox" in low
                    or "brave" in low
                    or low.endswith("linkedin")
                    or "jobs" in low
                ):
                    candidates.append(w)
            if not candidates:
                # Broader match: any window with LinkedIn in title
                for w in desktop.windows():
                    try:
                        title = (w.window_text() or "").lower()
                    except Exception:  # noqa: BLE001
                        continue
                    if "linkedin" in title:
                        candidates.append(w)
            if not candidates:
                logger.warning("No LinkedIn browser window title matched")
                return False
            win = candidates[0]
            win.set_focus()
            logger.info("Focused LinkedIn window: %s", win.window_text())
            return True
        except Exception:  # noqa: BLE001
            logger.exception("Failed to focus LinkedIn browser window")
            return False

    def detect(
        self,
        capture: Callable[[], bytes],
        *,
        should_stop: Callable[[], bool] | None = None,
    ) -> VisionAction:
        """
        Confirm LinkedIn job search UI is visible.

        Returns the successful vision action, or raises LinkedInNotFoundError.
        """
        self.focus_browser_window()
        last: VisionAction | None = None
        for attempt in range(1, self.max_attempts + 1):
            if should_stop and should_stop():
                raise LinkedInNotFoundError("Stop requested during LinkedIn detection")
            shot = capture()
            last = self.vision.analyze_screenshot(
                shot,
                extra_context=(
                    "Detect whether this screenshot shows a LinkedIn Jobs search "
                    "results page (left job list + optional right detail panel). "
                    "If yes, return action=wait with detections.linkedin_page=true "
                    "and detections.job_list or job_cards true when visible. "
                    "If login wall, CAPTCHA, messaging overlay, or unrelated page, "
                    "return action=finish with observation explaining the blocker."
                ),
            )
            logger.info(
                "LinkedIn detect attempt=%s action=%s linkedin=%s jobs=%s obs=%r",
                attempt,
                last.action,
                last.detections.get("linkedin_page"),
                last.detections.get("job_cards") or last.detections.get("job_list"),
                last.observation,
            )
            if last.action == "finish":
                raise LinkedInNotFoundError(
                    last.observation
                    or "LinkedIn jobs page not available (login/CAPTCHA/other)"
                )
            linkedin_ok = bool(last.detections.get("linkedin_page"))
            jobs_ok = bool(
                last.detections.get("job_cards") or last.detections.get("job_list")
            )
            # Also accept strong observations if detections omitted
            obs = (last.observation or "").lower()
            if not linkedin_ok and "linkedin" in obs and "job" in obs:
                linkedin_ok = True
            if linkedin_ok and (jobs_ok or attempt == self.max_attempts):
                if not jobs_ok:
                    logger.warning(
                        "LinkedIn page detected but job list not confirmed; continuing"
                    )
                return last
            if last.action == "wait":
                import time

                time.sleep((last.wait_ms or 700) / 1000.0)

        raise LinkedInNotFoundError(
            (last.observation if last else None)
            or "Could not detect LinkedIn job results page. "
            "Open LinkedIn Jobs results in Chrome/Edge, then Start Agent again."
        )
