"""Regression tests for isolated agent worker process wiring."""

from __future__ import annotations

import os
from pathlib import Path

import pytest

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

pytest.importorskip("PyQt6")

from PyQt6.QtWidgets import QApplication

from agent.controller import AgentController, _worker_command
from ui.settings import AppSettings


@pytest.fixture(scope="module")
def qapp():
    app = QApplication.instance()
    if app is None:
        app = QApplication([])
    return app


def test_worker_command_uses_agent_worker_flag(tmp_path: Path):
    settings = AppSettings(
        openrouter_api_key="sk-test",
        vision_model="test/model",
        output_dir=str(tmp_path),
    )
    paths = {
        "events": tmp_path / "events.jsonl",
        "control": tmp_path / "control.json",
        "heartbeat": tmp_path / "hb.txt",
        "worker_log": tmp_path / "worker.log",
    }
    cmd = _worker_command(settings, paths)
    assert "--agent-worker" in cmd
    assert "sk-test" in cmd
    assert "test/model" in cmd
    assert str(paths["events"]) in cmd


def test_controller_start_requires_api_key(qapp, tmp_path, monkeypatch):
    controller = AgentController()
    failed = []
    controller.agent_failed.connect(lambda m: failed.append(m))
    controller.start(
        AppSettings(
            openrouter_api_key="",
            vision_model="test/model",
            output_dir=str(tmp_path),
        )
    )
    assert failed
    assert "API Key" in failed[0]
    assert controller.is_running is False
