"""
Top-level agent controller (bridge between PyQt6 UI and workflow).

The collection loop runs in a **separate process** so native crashes in
mss/pyautogui/pywinauto cannot auto-close the Qt window.
"""

from __future__ import annotations

import json
import logging
import sys
from pathlib import Path
from typing import Any

from PyQt6.QtCore import QObject, QProcess, QTimer, pyqtSignal

from agent.state_manager import StateManager
from storage.file_manager import default_output_dir
from ui.paths import log_dir, user_data_dir
from ui.settings import AppSettings

logger = logging.getLogger(__name__)


def _agent_paths() -> dict[str, Path]:
    root = log_dir()
    return {
        "events": root / "agent_events.jsonl",
        "control": root / "agent_control.json",
        "heartbeat": root / "agent_heartbeat.txt",
        "worker_log": root / "agent_worker.log",
    }


def _worker_command(settings: AppSettings, paths: dict[str, Path]) -> list[str]:
    """Build argv to spawn the agent worker process."""
    common = [
        "--agent-worker",
        "--api-key",
        settings.openrouter_api_key.strip(),
        "--model",
        settings.vision_model.strip(),
        "--output-dir",
        settings.output_dir or str(default_output_dir()),
        "--events-file",
        str(paths["events"]),
        "--control-file",
        str(paths["control"]),
        "--heartbeat-file",
        str(paths["heartbeat"]),
        "--log-file",
        str(paths["worker_log"]),
    ]
    if getattr(sys, "frozen", False):
        # Same EXE, alternate entry mode.
        return [sys.executable, *common]

    # Source run: python main.py --agent-worker ...
    main_py = Path(__file__).resolve().parents[1] / "main.py"
    return [sys.executable, str(main_py), *common]


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
        self.state = StateManager()
        self.settings = AppSettings()
        self._paused = False
        self._running = False
        self._process: QProcess | None = None
        self._paths = _agent_paths()
        self._events_offset = 0
        self._poll = QTimer(self)
        self._poll.setInterval(150)
        self._poll.timeout.connect(self._poll_worker)
        self._last_snapshot: dict[str, Any] = {}

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

        # Ensure user data/log dirs exist
        user_data_dir()
        self._paths = _agent_paths()
        for key in ("events", "control", "heartbeat"):
            p = self._paths[key]
            try:
                if p.exists():
                    p.unlink()
            except OSError:
                pass

        self.state = StateManager()
        self._paused = False
        self._running = True
        self._events_offset = 0
        self._last_snapshot = {}
        self.status_changed.emit("Waiting")
        self.log_message.emit("Starting LinkedIn JD Collector Agent…", "INFO")
        self.log_message.emit(
            "Agent runs in an isolated process so crashes won't close this window.",
            "INFO",
        )

        cmd = _worker_command(self.settings, self._paths)
        logger.info("Spawning agent worker: %s", " ".join(cmd[:2] + ["..."]))

        self._process = QProcess(self)
        self._process.setProcessChannelMode(QProcess.ProcessChannelMode.MergedChannels)
        self._process.finished.connect(self._on_process_finished)
        self._process.errorOccurred.connect(self._on_process_error)
        # Don't pass the API key via the system shell; argv is fine for local use.
        program = cmd[0]
        args = cmd[1:]
        self._process.start(program, args)
        if not self._process.waitForStarted(8000):
            self._running = False
            err = self._process.errorString() if self._process else "unknown"
            self.agent_failed.emit(f"Could not start agent worker process:\n{err}")
            self._process = None
            return

        self.log_message.emit(
            f"Worker PID {self._process.processId()} started", "INFO"
        )
        self._poll.start()

    def pause(self) -> None:
        if not self._running:
            return
        if self._paused:
            self._write_control({"pause": False, "resume": True, "stop": False})
            self._paused = False
            self.log_message.emit("Resumed", "INFO")
            self.status_changed.emit("Processing Jobs")
        else:
            self._write_control({"pause": True, "resume": False, "stop": False})
            self._paused = True
            self.log_message.emit("Paused", "INFO")
            self.status_changed.emit("Paused")

    def stop(self) -> None:
        if not self._running:
            return
        self.log_message.emit("Stop requested", "INFO")
        self._write_control({"pause": False, "resume": False, "stop": True})
        if self._process and self._process.state() != QProcess.ProcessState.NotRunning:
            # Give the worker a moment to stop cooperatively, then kill.
            QTimer.singleShot(4000, self._force_kill_worker)

    def _force_kill_worker(self) -> None:
        if self._process and self._process.state() != QProcess.ProcessState.NotRunning:
            self.log_message.emit("Force-stopping worker process…", "WARN")
            self._process.kill()

    def _write_control(self, payload: dict) -> None:
        try:
            self._paths["control"].write_text(
                json.dumps(payload), encoding="utf-8"
            )
        except OSError as exc:
            logger.warning("Could not write control file: %s", exc)

    def _poll_worker(self) -> None:
        path = self._paths["events"]
        if not path.exists():
            return
        try:
            data = path.read_text(encoding="utf-8")
        except OSError:
            return
        if len(data) < self._events_offset:
            self._events_offset = 0
        chunk = data[self._events_offset :]
        if not chunk:
            return
        self._events_offset = len(data)
        for line in chunk.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                item = json.loads(line)
            except json.JSONDecodeError:
                continue
            name = str(item.get("name") or "")
            payload = item.get("payload") or {}
            if not isinstance(payload, dict):
                payload = {"value": payload}
            self._dispatch_event(name, payload)

    def _dispatch_event(self, name: str, payload: dict) -> None:
        if name == "log":
            self.log_message.emit(
                str(payload.get("message", "")),
                str(payload.get("level", "INFO")),
            )
            return
        if name == "worker_finished":
            self._last_snapshot = dict(payload)
            self._handle_event("complete", payload)
            return
        if name == "worker_failed":
            err = str(payload.get("error") or "Worker failed")
            tb = str(payload.get("traceback") or "")
            msg = err if not tb else f"{err}\n\n{tb}"
            self._finish_failed(msg)
            return
        self._handle_event(name, payload)

    def _handle_event(self, name: str, payload: dict) -> None:
        from ui.status import ui_status_for_state

        try:
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
            elif name == "need_user":
                self.log_message.emit(
                    f"Need user: {payload.get('error') or payload.get('observation')}",
                    "ERROR",
                )
                self.status_changed.emit("Error")
            elif name == "linkedin_detected":
                self.log_message.emit(
                    f"LinkedIn detected: {payload.get('observation') or 'ok'}",
                    "AI",
                )
            elif name == "error":
                self.log_message.emit(f"Error: {payload.get('error')}", "ERROR")
            else:
                obs = payload.get("observation") or payload.get("action")
                if obs:
                    self.log_message.emit(str(obs), "AI")

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
                self._last_snapshot.update(stats)
                self.stats_changed.emit(stats)
        except Exception:  # noqa: BLE001
            logger.exception("UI event handler failed for %s", name)

    def _on_process_finished(self, exit_code: int, exit_status) -> None:
        self._poll.stop()
        # Drain any remaining events first
        self._poll_worker()

        if not self._running:
            return

        # Normal completion signaled via worker_finished / worker_failed events.
        if self._last_snapshot and exit_code == 0:
            self._finish_ok(self._last_snapshot)
            return

        # Unexpected death (native crash, kill, etc.) — UI stays alive.
        hb = ""
        try:
            if self._paths["heartbeat"].exists():
                hb = self._paths["heartbeat"].read_text(encoding="utf-8").strip()
        except OSError:
            pass
        worker_log = str(self._paths["worker_log"])
        msg = (
            "Agent worker process exited unexpectedly "
            f"(code={exit_code}, status={int(exit_status)}).\n\n"
            f"Last heartbeat: {hb or '(none)'}\n"
            f"Worker log: {worker_log}\n\n"
            "The main window stayed open on purpose. "
            "Share the worker log if this keeps happening."
        )
        # If worker already reported failure, don't double-dialog.
        if exit_code != 0 and "worker_failed" not in (hb or ""):
            self._finish_failed(msg)
        elif exit_code == 0:
            self._finish_ok(self._last_snapshot or {"jobs_saved": 0, "state": "COMPLETE"})
        else:
            self._running = False
            self._paused = False
            self.status_changed.emit("Error")
            self.log_message.emit(msg, "ERROR")

    def _on_process_error(self, error) -> None:
        self.log_message.emit(f"Worker process error: {error}", "ERROR")

    def _finish_ok(self, snap: dict) -> None:
        from ui.status import ui_status_for_state

        self._running = False
        self._paused = False
        self._poll.stop()
        state = snap.get("state", "COMPLETE")
        status = ui_status_for_state(state)
        self.status_changed.emit(status.value)
        self.stats_changed.emit(snap)
        self.agent_finished.emit(snap)
        self.log_message.emit(
            f"Agent finished with status={status.value}, saved={snap.get('jobs_saved', 0)}",
            "INFO",
        )
        self._cleanup_process()

    def _finish_failed(self, message: str) -> None:
        self._running = False
        self._paused = False
        self._poll.stop()
        self.status_changed.emit("Error")
        self.log_message.emit(message, "ERROR")
        self.agent_failed.emit(message)
        self._cleanup_process()

    def _cleanup_process(self) -> None:
        if self._process is not None:
            self._process.deleteLater()
            self._process = None
