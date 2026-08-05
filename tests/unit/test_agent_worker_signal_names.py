"""Regression: AgentWorker must not shadow QObject.event with a pyqtSignal."""

from __future__ import annotations

import os

import pytest

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

pytest.importorskip("PyQt6")

from PyQt6.QtCore import QObject, QEvent
from PyQt6.QtWidgets import QApplication

from agent.controller import AgentWorker
from agent.state_manager import StateManager
from ui.settings import AppSettings


@pytest.fixture(scope="module")
def qapp():
    app = QApplication.instance()
    if app is None:
        app = QApplication([])
    return app


def test_worker_keeps_qobject_event_callable(qapp, tmp_path):
    worker = AgentWorker(
        AppSettings(
            openrouter_api_key="sk-test",
            vision_model="openai/gpt-4o",
            output_dir=str(tmp_path),
        ),
        StateManager(),
    )
    assert hasattr(worker, "workflow_event")
    assert hasattr(worker, "run_finished")
    assert hasattr(worker, "run_failed")
    # Must not shadow QObject.event with a pyqtSignal
    assert "event" not in AgentWorker.__dict__
    assert callable(worker.event)
    # Delivering a Qt event must not raise TypeError: native Qt signal is not callable
    ev = QEvent(QEvent.Type.User)
    assert isinstance(worker.event(ev), bool)
    worker.deleteLater()
