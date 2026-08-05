"""
LinkedIn collection workflow (navigation engine).

START
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
from pathlib import Path
from typing import Callable

from agent.state_manager import StateManager, WorkflowState
from ai.vision_agent import VisionAgent
from automation.keyboard_controller import KeyboardController
from automation.mouse_controller import MouseController
from automation.safety import AutomationGuard, EmergencyStopError, default_guard
from linkedin.jd_detector import JdDetector
from linkedin.job_detector import JobCard, JobDetector
from linkedin.page_navigator import PageNavigator
from screen.screenshot import ScreenshotService
from storage.file_manager import FileManager
from storage.history import HistoryStore, JobRecord

logger = logging.getLogger(__name__)


class WorkflowError(RuntimeError):
    """Fatal workflow failure."""


@dataclass
class WorkflowConfig:
    output_dir: str = "./output"
    max_jobs: int | None = None
    max_pages: int | None = None
    max_job_attempts: int = 3
    detail_wait_s: float = 1.2
    between_jobs_s: float = 0.4


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
            output_dir=os.getenv("OUTPUT_DIR", "./output")
        )
        self.state = state or StateManager()
        self.guard = guard or default_guard
        self.vision = vision or VisionAgent()
        self.mouse = mouse or MouseController(guard=self.guard)
        self.keyboard = keyboard or KeyboardController(
            guard=self.guard, enable_emergency_hotkey=True
        )
        self.screenshots = screenshots or ScreenshotService()
        self.files = file_manager or FileManager(self.config.output_dir)
        self.history = history or HistoryStore.create(self.files.run_dir)
        self.on_event = on_event

        self.jobs = JobDetector(self.vision, completed_signatures=set(self.history.completed))
        self.pages = PageNavigator(self.vision, self.mouse)
        self.jd = JdDetector(
            self.vision,
            self.mouse,
            self.keyboard,
            detail_wait_s=self.config.detail_wait_s,
        )

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
        result = self.screenshots.capture()
        return result.image_bytes

    def _stopped(self) -> bool:
        return self.state.should_stop or self.guard.stopped

    def run(self) -> StateManager:
        """Execute the full collection workflow until completion, stop, or error."""
        # Callers/UI should clear stop/emergency flags before starting a fresh run.
        self.state.set_state(WorkflowState.START)
        self._emit("started", run_dir=str(self.files.run_dir))

        try:
            while not self._stopped():
                self.state.wait_if_paused()
                if self._stopped():
                    break

                if self.config.max_pages and self.state.stats.page_index > self.config.max_pages:
                    logger.info("Reached max_pages=%s", self.config.max_pages)
                    break

                page_done = self._process_current_page()
                if self._stopped():
                    break

                if not page_done:
                    # Fatal error path already set ERROR
                    if self.state.state == WorkflowState.ERROR:
                        break

                # Paginate
                self.state.set_state(WorkflowState.PAGINATE)
                self.state.stats.pages_completed += 1
                self.jobs.reset_page()

                moved = self.pages.go_to_next_page(
                    self._capture,
                    extra_context=self.state.context_for_ai(),
                    should_stop=self._stopped,
                )
                if not moved:
                    self.state.set_state(WorkflowState.COMPLETE)
                    self._emit("complete", **self.state.snapshot())
                    break

                self.state.stats.page_index += 1
                self._emit("page_changed", page=self.state.stats.page_index)

            if self._stopped() and self.state.state not in {
                WorkflowState.COMPLETE,
                WorkflowState.ERROR,
            }:
                self.state.set_state(WorkflowState.STOPPED)
                self._emit("stopped", **self.state.snapshot())

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

    def _process_current_page(self) -> bool:
        """
        Process all visible jobs on the current page.
        Returns True when the page is exhausted normally.
        """
        # 1-3: capture + AI identify job cards
        screenshot = self._capture()
        self.state.set_state(WorkflowState.ANALYZE)
        self.jobs.identify_visible_jobs(
            screenshot, extra_context=self.state.context_for_ai()
        )

        idle_rounds = 0
        while not self._stopped():
            self.state.wait_if_paused()
            if self._stopped():
                return False

            if self.config.max_jobs and self.state.stats.jobs_saved >= self.config.max_jobs:
                logger.info("Reached max_jobs=%s", self.config.max_jobs)
                return True

            screenshot = self._capture()
            card, action = self.jobs.choose_next_job_action(
                screenshot, extra_context=self.state.context_for_ai()
            )

            if card is None:
                if action.action in {"next_page", "finish"}:
                    logger.info("No more jobs on page (AI action=%s)", action.action)
                    return True
                if action.action == "scroll" and action.coordinates:
                    dy = action.scroll.dy if action.scroll else -400
                    self.mouse.scroll(dy=dy, x=action.coordinates.x, y=action.coordinates.y)
                    idle_rounds = 0
                    continue
                if action.action == "wait":
                    time.sleep((action.wait_ms or 800) / 1000.0)
                    idle_rounds += 1
                else:
                    idle_rounds += 1
                if idle_rounds >= 3:
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
        )

        for attempt in range(1, self.config.max_job_attempts + 1):
            if self._stopped():
                return False
            try:
                # 4. Click job
                self.state.set_state(WorkflowState.OPEN_JOB)
                logger.info(
                    "Clicking job '%s' at (%s,%s) attempt=%s",
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

                # 6. Find JD section
                self.state.set_state(WorkflowState.FIND_JD)
                shot = self._capture()
                self.jd.find_jd_section(shot)

                # 7-8. Select + copy JD
                self.state.set_state(WorkflowState.SELECT_JD)
                shot = self._capture()
                self.state.set_state(WorkflowState.COPY_JD)
                text = self.jd.select_and_copy_jd(shot)

                # 9. Save TXT
                self.state.set_state(WorkflowState.SAVE_JD)
                saved = self.files.save_jd(
                    text,
                    title=card.title,
                    company=card.company,
                    signature=card.signature,
                )

                # 10. Mark completed
                self.state.set_state(WorkflowState.MARK_DONE)
                record = JobRecord(
                    signature=card.signature,
                    title=card.title,
                    company=card.company,
                    page_index=self.state.stats.page_index,
                    path=str(saved.path),
                    saved_at=datetime.now(timezone.utc).isoformat(),
                )
                self.history.mark_completed(record)
                self.jobs.mark_completed(card.signature)
                self.state.stats.jobs_saved += 1
                self.state.set_state(WorkflowState.NEXT_JOB)
                self._emit(
                    "job_saved",
                    path=str(saved.path),
                    signature=card.signature,
                    saved=self.state.stats.jobs_saved,
                )
                return True

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
                    self._emit(
                        "job_failed",
                        signature=card.signature,
                        error=str(exc),
                    )
                    # Continue with other jobs rather than hard-failing the run
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
