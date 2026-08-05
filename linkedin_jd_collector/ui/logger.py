"""
UI log panel for the LinkedIn JD Collector Agent.
"""

from __future__ import annotations

import logging
from datetime import datetime

from PyQt6.QtGui import QFont, QTextCursor
from PyQt6.QtWidgets import QPlainTextEdit, QVBoxLayout, QWidget


class LogPanel(QWidget):
    """Scrollable log view for AI decisions, jobs, pages, and errors."""

    def __init__(self, parent=None) -> None:
        super().__init__(parent)
        self.view = QPlainTextEdit(self)
        self.view.setReadOnly(True)
        self.view.setMaximumBlockCount(5000)
        font = QFont("Consolas")
        if not font.exactMatch():
            font = QFont("Courier New")
        font.setStyleHint(QFont.StyleHint.Monospace)
        font.setPointSize(10)
        self.view.setFont(font)
        self.view.setPlaceholderText(
            "Logs will appear here: AI decisions, current job, page number, errors…"
        )

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.addWidget(self.view)

    def clear(self) -> None:
        self.view.clear()

    def append(self, message: str, *, level: str = "INFO") -> None:
        ts = datetime.now().strftime("%H:%M:%S")
        line = f"[{ts}] [{level.upper()}] {message}"
        self.view.appendPlainText(line)
        self.view.moveCursor(QTextCursor.MoveOperation.End)

    def info(self, message: str) -> None:
        self.append(message, level="INFO")

    def decision(self, message: str) -> None:
        self.append(f"AI: {message}", level="AI")

    def job(self, message: str) -> None:
        self.append(message, level="JOB")

    def page(self, message: str) -> None:
        self.append(message, level="PAGE")

    def error(self, message: str) -> None:
        self.append(message, level="ERROR")


class QtLogHandler(logging.Handler):
    """Bridge stdlib logging into the LogPanel (thread-safe via signal callback)."""

    def __init__(self, emit_callable) -> None:
        super().__init__()
        self._emit_callable = emit_callable

    def emit(self, record: logging.LogRecord) -> None:
        try:
            msg = self.format(record)
            level = record.levelname
            self._emit_callable(msg, level)
        except Exception:  # noqa: BLE001
            self.handleError(record)
