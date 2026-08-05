"""
Top-level agent controller (bridge between PyQt6 UI and workflow).
"""

from __future__ import annotations

import logging
import traceback
from typing import Any

from PyQt6.QtCore import QObject, QThread, pyqtSignal, pyqtSlot

from agent.state_manager import StateManager, WorkflowState
from agent.workflow import LinkedInWorkflow, WorkflowConfig, WorkflowError
from automation.safety import default_guard
from storage.file_manager import FileManager, default_output_dir
from storage.history import HistoryStore
from ui.settings import AppSettings

logger = logging.getLogger(__name__)


class AgentWorker(QObject):
    """Runs LinkedInWorkflow on a background thread."""

    event = pyqtSignal(str, dict)
    finished = pyqtSignal(object)
    failed = pyqtSignal(str)

    def __init__(self, settings: AppSettings, state: StateManager) -> None:
        super().__init__()
        self.settings = settings
        self.state = state
        self.workflow: LinkedInWorkflow | None = None

    @pyqtSlot()
    def run(self) -> None:
        try:
            self.settings.apply_to_environ()
            default_guard.clear_emergency_stop()
            self.state.clear_stop()
            self.state.resume()

            output_dir = self.settings.output_dir or str(default_output_dir())
            files = FileManager(output_dir)
            history = HistoryStore.create(files.output_root)
            config = WorkflowConfig(output_dir=output_dir)

            self.workflow = LinkedInWorkflow(
                config=config,
                state=self.state,
                file_manager=files,
                history=history,
                guard=default_guard,
                on_event=self._on_event,
            )
            result = self.workflow.run()
            self.finished.emit(result)
        except WorkflowError as exc:
            self.failed.emit(str(exc))
        except Exception as exc:  # noqa: BLE001
            logger.exception("Agent worker crashed")
            self.failed.emit(f"{exc}\n{traceback.format_exc()}")

    def _on_event(self, name: str, payload: dict[str, Any]) -> None:
        self.event.emit(name, payload)


class AgentController(QObject):
    """
    UI-facing controller: start/pause/resume/stop + progress signals.
    """

    status_changed = pyqtSignal(str)          # UiStatus value
    log_message = pyqtSignal(str, str)        # message, level
    stats_changed = pyqtSignal(dict)
    agent_finished = pyqtSignal(dict)
    agent_failed = pyqtSignal(str)

    def __init__(self, parent=None) -> None:
        super().__init__(parent)
        self._thread: QThread | None = None
        self._worker: AgentWorker | None = None
        self.state = StateManager()
        self.settings = AppSettings()
        self._paused = False
        self._running = False

    @property
    def is_running(self) -> bool:
        return self._running

    @property
    def is_paused(self) -> bool:
        return self._paused

    def start(self, settings: AppSettings) -> None:
        if self._running:
            self.log_message.emit("Agent already running", "WARN")
            return

        self.settings = settings
        self.settings.apply_to_environ()
        if not self.settings.openrouter_api_key.strip():
            self.agent_failed.emit("OpenRouter API Key is required in Settings.")
            return

        self.state = StateManager()
        self._paused = False
        self._running = True
        self.status_changed.emit("Waiting")
        self.log_message.emit("Starting LinkedIn JD Collector Agent…", "INFO")

        self._thread = QThread()
        self._worker = AgentWorker(self.settings, self.state)
        self._worker.moveToThread(self._thread)
        self._thread.started.connect(self._worker.run)
        self._worker.event.connect(self._handle_event)
        self._worker.finished.connect(self._on_finished)
        self._worker.failed.connect(self._on_failed)
        self._worker.finished.connect(self._thread.quit)
        self._worker.failed.connect(self._thread.quit)
        self._thread.finished.connect(self._cleanup_thread)
        self._thread.start()

    def pause(self) -> None:
        if not self._running:
            return
        if self._paused:
            self.state.resume()
            default_guard.resume()
            self._paused = False
            self.log_message.emit("Resumed", "INFO")
            self.status_changed.emit("Processing Jobs")
        else:
            self.state.request_pause()
            default_guard.pause()
            self._paused = True
            self.log_message.emit("Paused", "INFO")
            self.status_changed.emit("Paused")

    def stop(self) -> None:
        if not self._running:
            return
        self.log_message.emit("Stop requested", "INFO")
        self.state.request_stop()
        default_guard.trigger_emergency_stop("user stop")
        if self._worker and self._worker.workflow:
            self._worker.workflow.request_stop()

    def _handle_event(self, name: str, payload: dict) -> None:
        from ui.status import ui_status_for_state

        state = payload.get("state")
        if state:
            status = ui_status_for_state(state, paused=self._paused)
            self.status_changed.emit(status.value)

        page = payload.get("page") or payload.get("page_index")
        if page is not None:
            self.log_message.emit(f"Page number: {page}", "PAGE")

        if name == "started":
            self.log_message.emit(
                f"Run started. Saving to: {payload.get('run_dir', '')}", "INFO"
            )
        elif name == "job_started":
            title = payload.get("title", "job")
            company = payload.get("company", "company")
            self.log_message.emit(
                f"Current job: {title} @ {company} (page {payload.get('page', '?')})",
                "JOB",
            )
        elif name == "job_saved":
            self.log_message.emit(
                f"Saved JD → {payload.get('path')} (total saved={payload.get('saved')})",
                "JOB",
            )
        elif name == "job_duplicate_skipped":
            self.log_message.emit(
                f"Duplicate skipped: {payload.get('title')} @ {payload.get('company')}",
                "JOB",
            )
        elif name == "job_failed":
            self.log_message.emit(
                f"Job error: {payload.get('error')}",
                "ERROR",
            )
        elif name == "page_changed":
            self.log_message.emit(f"Moved to page {payload.get('page')}", "PAGE")
        elif name == "complete":
            self.log_message.emit("Collection completed", "INFO")
        elif name == "stopped":
            self.log_message.emit(
                f"Stopped. reason={payload.get('reason', 'user/stop')}", "INFO"
            )
        elif name == "error":
            self.log_message.emit(f"Error: {payload.get('error')}", "ERROR")
        else:
            # Generic / AI-oriented breadcrumbs
            obs = payload.get("observation") or payload.get("action")
            if obs:
                self.log_message.emit(str(obs), "AI")

        # Surface AI-ish fields when present on any event
        if payload.get("ai_decision"):
            self.log_message.emit(str(payload["ai_decision"]), "AI")

        stats = {
            k: payload.get(k)
            for k in (
                "page_index",
                "jobs_saved",
                "jobs_seen",
                "jobs_failed",
                "last_job_signature",
                "last_error",
                "state",
            )
            if k in payload
        }
        if stats:
            self.stats_changed.emit(stats)

    def _on_finished(self, state: StateManager) -> None:
        from ui.status import ui_status_for_state

        self._running = False
        self._paused = False
        snap = state.snapshot()
        status = ui_status_for_state(state.state)
        self.status_changed.emit(status.value)
        self.stats_changed.emit(snap)
        self.agent_finished.emit(snap)
        self.log_message.emit(
            f"Agent finished with status={status.value}, saved={snap.get('jobs_saved', 0)}",
            "INFO",
        )

    def _on_failed(self, message: str) -> None:
        self._running = False
        self._paused = False
        self.status_changed.emit("Error")
        self.log_message.emit(message, "ERROR")
        self.agent_failed.emit(message)

    def _cleanup_thread(self) -> None:
        if self._worker is not None:
            self._worker.deleteLater()
            self._worker = None
        if self._thread is not None:
            self._thread.deleteLater()
            self._thread = None
