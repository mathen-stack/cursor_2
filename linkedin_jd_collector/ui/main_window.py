"""
Main PyQt6 window for LinkedIn JD Collector Agent.
"""

from __future__ import annotations

import logging
import os
import subprocess
import sys
from pathlib import Path

from PyQt6.QtCore import Qt
from PyQt6.QtGui import QFont
from PyQt6.QtWidgets import (
    QFormLayout,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QVBoxLayout,
    QWidget,
)

from agent.controller import AgentController
from ai.openrouter_client import DEFAULT_MODEL, format_openrouter_user_error
from storage.file_manager import default_output_dir
from ui.logger import LogPanel, QtLogHandler
from ui.settings import AppSettings, load_settings, save_settings
from ui.status import UiStatus

logger = logging.getLogger(__name__)


class MainWindow(QMainWindow):
    """Desktop UI: status, controls, settings, log panel."""

    def __init__(self, settings: AppSettings | None = None) -> None:
        super().__init__()
        # Version bump helps confirm the user installed the latest EXE.
        self.setWindowTitle("LinkedIn JD Collector Agent v1.0.7")
        self.resize(920, 680)

        self.settings = settings or load_settings()
        self.controller = AgentController(self)

        self._build_ui()
        self._bind_controller()
        self._install_log_bridge()
        self._load_settings_into_form()
        self._set_status(UiStatus.WAITING.value)
        self._set_buttons_idle()

    def _build_ui(self) -> None:
        root = QWidget(self)
        self.setCentralWidget(root)
        layout = QVBoxLayout(root)
        layout.setContentsMargins(16, 16, 16, 16)
        layout.setSpacing(12)

        # Title
        title = QLabel("LinkedIn JD Collector Agent v1.0.7")
        title_font = QFont()
        title_font.setPointSize(18)
        title_font.setBold(True)
        title.setFont(title_font)
        layout.addWidget(title)

        subtitle = QLabel(
            "After you open LinkedIn job results in your browser, start the agent "
            "to collect original job descriptions."
        )
        subtitle.setWordWrap(True)
        layout.addWidget(subtitle)

        # Status
        status_box = QGroupBox("Status")
        status_layout = QHBoxLayout(status_box)
        self.status_label = QLabel(UiStatus.WAITING.value)
        status_font = QFont()
        status_font.setPointSize(14)
        status_font.setBold(True)
        self.status_label.setFont(status_font)
        self.status_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.status_label.setStyleSheet(
            "padding: 10px; border-radius: 6px; background: #eef3f8; color: #123;"
        )
        status_layout.addWidget(self.status_label)
        layout.addWidget(status_box)

        # Stats row
        stats_row = QHBoxLayout()
        self.page_label = QLabel("Page: —")
        self.job_label = QLabel("Current job: —")
        self.saved_label = QLabel("Saved: 0")
        for lbl in (self.page_label, self.job_label, self.saved_label):
            stats_row.addWidget(lbl)
        stats_row.addStretch(1)
        layout.addLayout(stats_row)

        # Buttons
        buttons = QHBoxLayout()
        self.btn_start = QPushButton("Start Agent")
        self.btn_pause = QPushButton("Pause")
        self.btn_stop = QPushButton("Stop")
        self.btn_folder = QPushButton("Open Folder")
        for btn in (self.btn_start, self.btn_pause, self.btn_stop, self.btn_folder):
            btn.setMinimumHeight(36)
            buttons.addWidget(btn)
        layout.addLayout(buttons)

        self.btn_start.clicked.connect(self.on_start)
        self.btn_pause.clicked.connect(self.on_pause)
        self.btn_stop.clicked.connect(self.on_stop)
        self.btn_folder.clicked.connect(self.on_open_folder)

        # Settings
        settings_box = QGroupBox("Settings")
        form = QFormLayout(settings_box)
        self.api_key_input = QLineEdit()
        self.api_key_input.setEchoMode(QLineEdit.EchoMode.Password)
        self.api_key_input.setPlaceholderText("sk-or-…")
        self.model_input = QLineEdit()
        self.model_input.setPlaceholderText(DEFAULT_MODEL)
        form.addRow("OpenRouter API Key", self.api_key_input)
        form.addRow("Vision Model Name", self.model_input)
        model_hint = QLabel(
            "Tip: paid models (e.g. openai/gpt-4o) need OpenRouter credits. "
            f"Free default: {DEFAULT_MODEL}"
        )
        model_hint.setWordWrap(True)
        model_hint.setStyleSheet("color: #555;")
        form.addRow("", model_hint)
        layout.addWidget(settings_box)

        # Log panel
        log_box = QGroupBox("Log")
        log_layout = QVBoxLayout(log_box)
        self.log_panel = LogPanel()
        log_layout.addWidget(self.log_panel)
        layout.addWidget(log_box, stretch=1)

    def _bind_controller(self) -> None:
        self.controller.status_changed.connect(self._set_status)
        self.controller.log_message.connect(self._on_log)
        self.controller.stats_changed.connect(self._on_stats)
        self.controller.agent_finished.connect(self._on_finished)
        self.controller.agent_failed.connect(self._on_failed)

    def _install_log_bridge(self) -> None:
        # Parent the bridge to this window so signal affinity stays on the UI thread.
        handler = QtLogHandler(self._on_log, parent=self)
        handler.setLevel(logging.INFO)
        handler.setFormatter(logging.Formatter("%(name)s: %(message)s"))
        logging.getLogger().addHandler(handler)
        logging.getLogger().setLevel(logging.INFO)
        self._log_handler = handler

    def _load_settings_into_form(self) -> None:
        self.api_key_input.setText(self.settings.openrouter_api_key)
        self.model_input.setText(self.settings.vision_model)

    def _read_settings_from_form(self) -> AppSettings:
        return AppSettings(
            openrouter_api_key=self.api_key_input.text().strip(),
            vision_model=self.model_input.text().strip() or DEFAULT_MODEL,
            output_dir=self.settings.output_dir or str(default_output_dir()),
        )

    def on_start(self) -> None:
        try:
            settings = self._read_settings_from_form()
            if not settings.openrouter_api_key:
                QMessageBox.warning(
                    self,
                    "Missing API Key",
                    "Please enter your OpenRouter API Key in Settings.",
                )
                return
            try:
                save_settings(settings)
            except OSError as exc:
                # Common when the install folder is locked/read-only.
                logger.exception("Failed to persist settings")
                QMessageBox.warning(
                    self,
                    "Settings Save Failed",
                    "Could not save settings to disk, but the agent can still start "
                    f"for this session.\n\n{exc}",
                )
            self.settings = settings
            self.settings.apply_to_environ()
            self.log_panel.clear()
            self.log_panel.info("Starting agent…")
            self._set_buttons_running()
            self.controller.start(settings)
        except Exception as exc:  # noqa: BLE001
            logger.exception("Start Agent failed")
            self._set_buttons_idle()
            QMessageBox.critical(
                self,
                "Start Failed",
                "The agent could not start. The app will stay open.\n\n"
                f"{type(exc).__name__}: {exc}",
            )

    def on_pause(self) -> None:
        self.controller.pause()
        if self.controller.is_paused:
            self.btn_pause.setText("Resume")
        else:
            self.btn_pause.setText("Pause")

    def on_stop(self) -> None:
        self.controller.stop()
        self.btn_stop.setEnabled(False)

    def on_open_folder(self) -> None:
        folder = Path(self.settings.output_dir or default_output_dir())
        folder.mkdir(parents=True, exist_ok=True)
        path = str(folder)
        self.log_panel.info(f"Opening folder: {path}")
        try:
            if sys.platform.startswith("win"):
                os.startfile(path)  # type: ignore[attr-defined]
            elif sys.platform == "darwin":
                subprocess.Popen(["open", path])
            else:
                subprocess.Popen(["xdg-open", path])
        except Exception as exc:  # noqa: BLE001
            QMessageBox.warning(self, "Open Folder", f"Could not open folder:\n{exc}")

    def _set_status(self, status: str) -> None:
        self.status_label.setText(status)
        colors = {
            UiStatus.WAITING.value: ("#eef3f8", "#123"),
            UiStatus.ANALYZING_SCREEN.value: ("#fff4d6", "#5c4500"),
            UiStatus.PROCESSING_JOBS.value: ("#e3f2fd", "#0d47a1"),
            UiStatus.COPYING_JD.value: ("#f3e5f5", "#4a148c"),
            UiStatus.COMPLETED.value: ("#e8f5e9", "#1b5e20"),
            UiStatus.PAUSED.value: ("#eceff1", "#37474f"),
            UiStatus.ERROR.value: ("#ffebee", "#b71c1c"),
            UiStatus.STOPPED.value: ("#fafafa", "#424242"),
        }
        bg, fg = colors.get(status, ("#eef3f8", "#123"))
        self.status_label.setStyleSheet(
            f"padding: 10px; border-radius: 6px; background: {bg}; color: {fg};"
        )

    def _on_log(self, message: str, level: str = "INFO") -> None:
        level_u = (level or "INFO").upper()
        if level_u in {"AI", "DECISION"}:
            self.log_panel.decision(message)
        elif level_u == "JOB":
            self.log_panel.job(message)
            if message.lower().startswith("current job:"):
                self.job_label.setText(message)
        elif level_u == "PAGE":
            self.log_panel.page(message)
            if "page number:" in message.lower() or message.lower().startswith("page"):
                self.page_label.setText(message.replace("Page number:", "Page:"))
        elif level_u in {"ERROR", "CRITICAL"}:
            self.log_panel.error(message)
        else:
            self.log_panel.append(message, level=level_u)

    def _on_stats(self, stats: dict) -> None:
        if "page_index" in stats and stats["page_index"] is not None:
            self.page_label.setText(f"Page: {stats['page_index']}")
        if "jobs_saved" in stats and stats["jobs_saved"] is not None:
            self.saved_label.setText(f"Saved: {stats['jobs_saved']}")
        if stats.get("last_job_signature"):
            self.job_label.setText(f"Current job: {stats['last_job_signature']}")

    def _on_finished(self, snap: dict) -> None:
        self._set_buttons_idle()
        self.btn_pause.setText("Pause")
        self.saved_label.setText(f"Saved: {snap.get('jobs_saved', 0)}")

    def _on_failed(self, message: str) -> None:
        self._set_buttons_idle()
        self.btn_pause.setText("Pause")
        friendly = format_openrouter_user_error(message)
        low = (friendly + "\n" + message).lower()
        # Nudge Settings toward a working free VL model on credits / retired-model errors.
        if (
            "no credits" in low
            or "402" in message
            or "404" in message
            or "unavailable" in low
            or "retired" in low
        ):
            self.model_input.setText(DEFAULT_MODEL)
        QMessageBox.critical(self, "Agent Error", friendly)

    def _set_buttons_idle(self) -> None:
        self.btn_start.setEnabled(True)
        self.btn_pause.setEnabled(False)
        self.btn_stop.setEnabled(False)
        self.btn_folder.setEnabled(True)
        self.api_key_input.setEnabled(True)
        self.model_input.setEnabled(True)

    def _set_buttons_running(self) -> None:
        self.btn_start.setEnabled(False)
        self.btn_pause.setEnabled(True)
        self.btn_stop.setEnabled(True)
        self.btn_folder.setEnabled(True)
        self.api_key_input.setEnabled(False)
        self.model_input.setEnabled(False)
