"""QtLogHandler must marshal logs onto the UI thread via a Qt signal."""

from __future__ import annotations

import logging
import os
import threading

import pytest

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

pytest.importorskip("PyQt6")

from PyQt6.QtCore import QCoreApplication
from PyQt6.QtWidgets import QApplication

from ui.logger import QtLogHandler


@pytest.fixture(scope="module")
def qapp():
    app = QApplication.instance()
    if app is None:
        app = QApplication([])
    return app


def test_log_handler_uses_signal_bridge(qapp):
    received = []

    def sink(message: str, level: str = "INFO") -> None:
        received.append((threading.current_thread().name, message, level))

    handler = QtLogHandler(sink, parent=None)
    handler.setFormatter(logging.Formatter("%(message)s"))
    log = logging.getLogger("test.qt.log.handler")
    log.handlers.clear()
    log.addHandler(handler)
    log.setLevel(logging.INFO)
    log.propagate = False

    def worker() -> None:
        log.info("hello from worker")

    t = threading.Thread(target=worker, name="log-worker")
    t.start()
    t.join(timeout=2)
    # Process queued signal delivery on the UI/main thread
    for _ in range(20):
        QCoreApplication.processEvents()
        if received:
            break

    assert received, "log record never reached UI sink"
    thread_name, message, level = received[0]
    assert "hello from worker" in message
    assert level == "INFO"
    # Slot should run on the main/UI thread, not the worker thread
    assert thread_name != "log-worker"
