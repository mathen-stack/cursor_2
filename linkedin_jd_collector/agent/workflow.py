"""
LinkedIn collection workflow (navigation engine).

START
 0. Detect LinkedIn jobs page
 1. Capture screenshot
 2. Send screenshot to AI
 3. AI identifies visible job cards
 4. Click first/next job
 5. Wait for details panel
 6. Find JD section
 7. Select JD text
 8. Copy JD
 9. Save TXT
10. Mark job completed
Repeat for all visible jobs, then paginate via Next until done/stopped/error.
"""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable

from agent.state_manager import StateManager, WorkflowState
from ai.vision_agent import VisionAgent
from automation.keyboard_controller import KeyboardController
from automation.mapped_mouse import MappedMouse
from automation.mouse_controller import MouseController
from automation.safety import AutomationGuard, EmergencyStopError, default_guard
from linkedin.jd_detector import JdDetector
from linkedin.job_detector import JobCard, JobDetector
from linkedin.linkedin_detector import LinkedInDetector, LinkedInNotFoundError
from linkedin.page_navigator import PageNavigator
from screen.screenshot import ScreenshotService
from storage.file_manager import FileManager, default_output_dir
from storage.history import HistoryStore, JobRecord

logger = logging.getLogger(__name__)


class WorkflowError(RuntimeError):
    """Fatal workflow failure."""


class NeedUserError(WorkflowError):
    """Blocked by login/CAPTCHA/other UI requiring a human."""


@dataclass
class WorkflowConfig:
    output_dir: str = ""
    max_jobs: int | None = None
    max_pages: int | None = None
    max_job_attempts: int = 3
    detail_wait_s: float = 1.0
    between_jobs_s: float = 0.35
    idle_rounds_before_page_done: int = 3
    require_linkedin_detection: bool = True

    def __post_init__(self) -> None:
        if not self.output_dir:
            self.output_dir = str(default_output_dir())


class LinkedInWorkflow:
    """
    Orchestrates screenshot → AI → click jobs → copy JD → save → paginate.
    """

    def __init__(
        self,
        *,
        config: WorkflowConfig | None = None,
        state: StateManager | None = None,
        vision: VisionAgent | None = None,
        mouse: MouseController | None = None,
        keyboard: KeyboardController | None = None,
        screenshots: ScreenshotService | None = None,
        guard: AutomationGuard | None = None,
        file_manager: FileManager | None = None,
        history: HistoryStore | None = None,
        on_event: Callable[[str, dict], None] | None = None,
    ) -> None:
        self.config = config or WorkflowConfig(
            output_dir=os.getenv("OUTPUT_DIR") or str(default_output_dir())
        )
        self.state = state or StateManager()
        self.guard = guard or default_guard
        logger.info("Workflow init: creating VisionAgent…")
        self.vision = vision or VisionAgent()
        logger.info("Workflow init: creating ScreenshotService…")
        self.screenshots = screenshots or ScreenshotService()
        try:
            # Do NOT import pyautogui / arm hotkeys here — that has killed the
            # Windows EXE immediately after "VisionAgent initialized".
            logger.info("Workflow init: creating MouseController (lazy)…")
            raw_mouse = mouse or MouseController(guard=self.guard, lazy_backend=True)
            self.mouse = MappedMouse(raw_mouse, self.screenshots)
            logger.info("Workflow init: creating KeyboardController (lazy)…")
            self.keyboard = keyboard or KeyboardController(
                guard=self.guard,
                enable_emergency_hotkey=False,
                lazy_backend=True,
            )
        except Exception as exc:  # noqa: BLE001
            raise WorkflowError(
                f"Could not initialize mouse/keyboard automation: {exc}"
            ) from exc
        self.files = file_manager or FileManager(self.config.output_dir)
        self.history = history or HistoryStore.create(self.files.output_root)
        self.on_event = on_event

        logger.info("Workflow init: wiring detectors…")
        self.jobs = JobDetector(self.vision, completed_signatures=set(self.history.completed))
        self.pages = PageNavigator(self.vision, self.mouse)
        self.linkedin = LinkedInDetector(self.vision)
        self.jd = JdDetector(
            self.vision,
            self.mouse,
            self.keyboard,
            detail_wait_s=self.config.detail_wait_s,
        )
        logger.info("Workflow init complete (pyautogui deferred until first action)")

    def _emit(self, event: str, **payload) -> None:
        logger.info("EVENT %s %s", event, payload)
        if self.on_event:
            try:
                self.on_event(event, payload)
            except Exception:  # noqa: BLE001
                logger.exception("on_event handler failed for %s", event)

    def request_stop(self) -> None:
        self.state.request_stop()
        self.guard.trigger_emergency_stop("user stop")

    def _capture(self) -> bytes:
        self.state.set_state(WorkflowState.CAPTURE)
        logger.info("Capturing screenshot…")
        result = self.screenshots.capture()
        logger.info(
            "Screenshot ok %sx%s bytes=%s",
            result.width,
            result.height,
            len(result.image_bytes),
        )
        return result.image_bytes

    def _stopped(self) -> bool:
        return self.state.should_stop or self.guard.stopped

    def run(self) -> StateManager:
        """Execute the full collection workflow until completion, stop, or error."""
        self.state.set_state(WorkflowState.START)
        self._emit("started", run_dir=str(self.files.output_root))
        # Optional hotkey — off by default because Win32 hooks have crashed
        # some frozen EXE sessions during startup.
        if os.getenv("ENABLE_EMERGENCY_HOTKEY", "").strip() in {"1", "true", "yes"}:
            try:
                logger.info("Arming emergency hotkey listener…")
                self.guard.start_emergency_hotkey_listener()
            except Exception:  # noqa: BLE001
                logger.exception("Emergency hotkey listener skipped")

        try:
            if self.config.require_linkedin_detection:
                self.state.set_state(WorkflowState.ANALYZE)
                self._emit("ai_decision", ai_decision="Detecting LinkedIn jobs page…")
                detection = self.linkedin.detect(
                    self._capture, should_stop=self._stopped
                )
                self._emit(
                    "linkedin_detected",
                    observation=detection.observation,
                    **self.state.snapshot(),
                )

            while not self._stopped():
                self.state.wait_if_paused()
                if self._stopped():
                    break

                if (
                    self.config.max_pages
                    and self.state.stats.page_index > self.config.max_pages
                ):
                    logger.info("Reached max_pages=%s", self.config.max_pages)
                    self.state.set_state(WorkflowState.COMPLETE)
                    self._emit("complete", reason="max_pages", **self.state.snapshot())
                    break

                if (
                    self.config.max_jobs
                    and self.state.stats.jobs_saved >= self.config.max_jobs
                ):
                    logger.info("Reached max_jobs=%s", self.config.max_jobs)
                    self.state.set_state(WorkflowState.COMPLETE)
                    self._emit("complete", reason="max_jobs", **self.state.snapshot())
                    break

                page_done = self._process_current_page()
                if self._stopped():
                    break

                if self.state.state == WorkflowState.ERROR:
                    break

                if (
                    self.config.max_jobs
                    and self.state.stats.jobs_saved >= self.config.max_jobs
                ):
                    self.state.set_state(WorkflowState.COMPLETE)
                    self._emit("complete", reason="max_jobs", **self.state.snapshot())
                    break

                if not page_done:
                    # Unexpected early exit without stop/error — treat as complete
                    self.state.set_state(WorkflowState.COMPLETE)
                    self._emit("complete", **self.state.snapshot())
                    break

                # Paginate only after a fully processed page
                self.state.set_state(WorkflowState.PAGINATE)
                self.jobs.reset_page()

                moved = self.pages.go_to_next_page(
                    self._capture,
                    extra_context=self.state.context_for_ai(),
                    should_stop=self._stopped,
                )
                if not moved:
                    self.state.set_state(WorkflowState.COMPLETE)
                    self._emit("complete", reason="no_next", **self.state.snapshot())
                    break

                self.state.stats.pages_completed += 1
                self.state.stats.page_index += 1
                self._emit("page_changed", page=self.state.stats.page_index)

            if self._stopped() and self.state.state not in {
                WorkflowState.COMPLETE,
                WorkflowState.ERROR,
            }:
                self.state.set_state(WorkflowState.STOPPED)
                self._emit("stopped", **self.state.snapshot())

        except LinkedInNotFoundError as exc:
            logger.error("LinkedIn not detected: %s", exc)
            self.state.stats.last_error = str(exc)
            self.state.set_state(WorkflowState.ERROR)
            self._emit("need_user", error=str(exc), **self.state.snapshot())
            self._emit("error", error=str(exc), **self.state.snapshot())
        except NeedUserError as exc:
            logger.error("Need user intervention: %s", exc)
            self.state.stats.last_error = str(exc)
            self.state.set_state(WorkflowState.ERROR)
            self._emit("need_user", error=str(exc), **self.state.snapshot())
        except EmergencyStopError as exc:
            logger.error("Workflow emergency stop: %s", exc)
            self.state.stats.last_error = str(exc)
            self.state.set_state(WorkflowState.STOPPED)
            self._emit("stopped", reason=str(exc), **self.state.snapshot())
        except Exception as exc:  # noqa: BLE001
            logger.exception("Workflow error")
            self.state.stats.last_error = str(exc)
            self.state.set_state(WorkflowState.ERROR)
            self._emit("error", error=str(exc), **self.state.snapshot())
            raise WorkflowError(str(exc)) from exc
        finally:
            self._shutdown()

        return self.state

    def _image_size(self) -> tuple[int, int] | None:
        last = self.screenshots.last
        if last is None:
            return None
        return int(last.width), int(last.height)

    def _jd_fallback_region(self) -> tuple[int, int, int, int] | None:
        """Right-side detail panel region in screenshot coordinates."""
        size = self._image_size()
        if size is None:
            return None
        w, h = size
        return (
            max(0, int(w * 0.40)),
            max(0, int(h * 0.22)),
            max(1, int(w * 0.97)),
            max(1, int(h * 0.92)),
        )

    def _process_current_page(self) -> bool:
        """
        Process all visible jobs on the current page.
        Returns True when the page is exhausted normally.
        """
        screenshot = self._capture()
        self.state.set_state(WorkflowState.ANALYZE)
        cards = self.jobs.identify_visible_jobs(
            screenshot,
            extra_context=self.state.context_for_ai(),
            image_size=self._image_size(),
        )
        self._emit(
            "ai_decision",
            ai_decision=f"Identified {len(cards)} visible job card(s)",
            **self.state.snapshot(),
        )

        idle_rounds = 0
        while not self._stopped():
            self.state.wait_if_paused()
            if self._stopped():
                return False

            if (
                self.config.max_jobs
                and self.state.stats.jobs_saved >= self.config.max_jobs
            ):
                logger.info("Reached max_jobs=%s", self.config.max_jobs)
                return True

            screenshot = self._capture()
            card, action = self.jobs.choose_next_job_action(
                screenshot,
                extra_context=self.state.context_for_ai(),
                image_size=self._image_size(),
            )
            self._emit(
                "ai_decision",
                ai_decision=(
                    f"action={action.action} target={action.target} "
                    f"conf={action.confidence} obs={action.observation or ''}"
                ),
                action=action.action,
                target=action.target,
                observation=action.observation,
                **self.state.snapshot(),
            )

            if action.action == "need_user":
                raise NeedUserError(
                    action.observation or "AI requested user intervention"
                )

            if card is None:
                # Don't abandon the page on the first finish/next_page if we never
                # successfully opened a job this page — try scroll + heuristics first.
                if action.action in {"next_page", "finish"}:
                    # Only recover when we never even attempted a job click.
                    # If jobs were attempted/failed, respect finish/next_page.
                    if self.state.stats.jobs_seen == 0 and idle_rounds < 3:
                        logger.info(
                            "AI said %s before any job click; scrolling/heuristics first",
                            action.action,
                        )
                        size = self._image_size()
                        if size:
                            self.jobs.seed_heuristic_cards(size[0], size[1])
                        last = self.screenshots.last
                        if last is not None:
                            self.mouse.scroll(
                                dy=-500,
                                x=max(40, last.width // 4),
                                y=max(80, last.height // 2),
                            )
                        idle_rounds += 1
                        continue
                    logger.info("No more jobs on page (AI action=%s)", action.action)
                    return True
                if action.action == "scroll":
                    dy = action.scroll.dy if action.scroll else -400
                    if action.coordinates:
                        self.mouse.scroll(
                            dy=dy, x=action.coordinates.x, y=action.coordinates.y
                        )
                    else:
                        # Scroll job list area heuristically (left third, mid height)
                        last = self.screenshots.last
                        if last is not None:
                            self.mouse.scroll(
                                dy=dy,
                                x=max(40, last.width // 4),
                                y=max(80, last.height // 2),
                            )
                        else:
                            self.mouse.scroll(dy=dy)
                    idle_rounds = 0
                    continue
                if action.action == "wait":
                    time.sleep((action.wait_ms or 800) / 1000.0)
                    idle_rounds += 1
                else:
                    idle_rounds += 1
                if idle_rounds >= self.config.idle_rounds_before_page_done:
                    logger.info("No actionable jobs after idle rounds; page done")
                    return True
                continue

            idle_rounds = 0
            ok = self._process_one_job(card)
            if not ok and self.state.state == WorkflowState.ERROR:
                return False
            time.sleep(self.config.between_jobs_s)

        return False

    def _process_one_job(self, card: JobCard) -> bool:
        """Steps 4-10 for a single job card."""
        self.state.stats.jobs_seen += 1
        self.state.stats.last_job_signature = card.signature
        self._emit(
            "job_started",
            title=card.title,
            company=card.company,
            signature=card.signature,
            page=self.state.stats.page_index,
            url=card.url,
        )

        for attempt in range(1, self.config.max_job_attempts + 1):
            if self._stopped():
                return False
            try:
                # 4. Click job
                self.state.set_state(WorkflowState.OPEN_JOB)
                logger.info(
                    "Clicking job '%s' at img(%s,%s) attempt=%s",
                    card.title,
                    card.x,
                    card.y,
                    attempt,
                )
                self.mouse.move(card.x, card.y)
                self.mouse.click()

                # 5. Wait for details panel
                self.state.set_state(WorkflowState.WAIT_DETAIL)
                detail = self.jd.wait_for_details_panel(
                    self._capture, should_stop=self._stopped
                )
                if detail is None and self._stopped():
                    return False
                if detail and detail.action == "need_user":
                    raise NeedUserError(
                        detail.observation or "Blocked while waiting for job details"
                    )

                # 6-8. Identify JD → select → Ctrl+C → clipboard (exact text)
                self.state.set_state(WorkflowState.FIND_JD)
                self.state.set_state(WorkflowState.SELECT_JD)
                self.state.set_state(WorkflowState.COPY_JD)
                extraction = self.jd.extract_jd(
                    self._capture,
                    should_stop=self._stopped,
                    select_fallback_region=self._jd_fallback_region(),
                )
                text = extraction.text  # exact clipboard contents; do not modify

                # 9. Save TXT exactly as copied
                self.state.set_state(WorkflowState.SAVE_JD)
                saved = self.files.save_jd(
                    text,
                    title=card.title,
                    company=card.company,
                    url=card.url,
                    signature=card.signature,
                    history=self.history,
                )

                # 10. Mark completed / skip duplicates
                self.state.set_state(WorkflowState.MARK_DONE)
                self.jobs.mark_completed(card.signature)
                if saved.skipped_duplicate:
                    self._emit(
                        "job_duplicate_skipped",
                        signature=saved.signature,
                        title=card.title,
                        company=card.company,
                    )
                    self.state.set_state(WorkflowState.NEXT_JOB)
                    return True

                record = JobRecord(
                    signature=saved.signature,
                    title=card.title,
                    company=card.company,
                    page_index=self.state.stats.page_index,
                    path=str(saved.path),
                    saved_at=saved.timestamp,
                    url=card.url,
                    content_hash=saved.content_hash,
                )
                self.history.mark_completed(record)
                self.state.stats.jobs_saved += 1
                self.state.set_state(WorkflowState.NEXT_JOB)
                self._emit(
                    "job_saved",
                    path=str(saved.path),
                    signature=saved.signature,
                    saved=self.state.stats.jobs_saved,
                    url=card.url,
                    chars=len(text),
                )
                return True

            except NeedUserError:
                raise
            except EmergencyStopError:
                raise
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "Job failed attempt=%s/%s sig=%s err=%s",
                    attempt,
                    self.config.max_job_attempts,
                    card.signature,
                    exc,
                )
                self.state.stats.last_error = str(exc)
                if attempt >= self.config.max_job_attempts:
                    self.state.stats.jobs_failed += 1
                    # Prevent infinite retry loops on the same broken card
                    self.jobs.mark_skipped(card.signature)
                    self._emit(
                        "job_failed",
                        signature=card.signature,
                        error=str(exc),
                    )
                    self.state.set_state(WorkflowState.NEXT_JOB)
                    return True
                time.sleep(0.8)
        return True

    def _shutdown(self) -> None:
        try:
            self.keyboard.close()
        except Exception:  # noqa: BLE001
            logger.debug("keyboard close failed", exc_info=True)
        try:
            self.screenshots.close()
        except Exception:  # noqa: BLE001
            logger.debug("screenshot close failed", exc_info=True)
        try:
            self.vision.close()
        except Exception:  # noqa: BLE001
            logger.debug("vision close failed", exc_info=True)


def run_workflow(config: WorkflowConfig | None = None) -> StateManager:
    """Module-level helper to run the default workflow."""
    return LinkedInWorkflow(config=config).run()
