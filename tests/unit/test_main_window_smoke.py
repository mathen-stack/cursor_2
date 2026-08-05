"""Offscreen smoke test for MainWindow controls."""

from __future__ import annotations

import os

import pytest

# Must be set before QApplication is created
os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

pytest.importorskip("PyQt6")

from PyQt6.QtWidgets import QApplication

from ui.main_window import MainWindow
from ui.settings import AppSettings


@pytest.fixture(scope="module")
def qapp():
    app = QApplication.instance()
    if app is None:
        app = QApplication([])
    return app


def test_main_window_builds_and_shows_status(qapp, tmp_path, monkeypatch):
    import ui.settings as settings_mod

    monkeypatch.setattr(settings_mod, "_upsert_env", lambda values: None)
    settings = AppSettings(
        openrouter_api_key="sk-test",
        vision_model="openai/gpt-4o",
        output_dir=str(tmp_path),
    )
    window = MainWindow(settings=settings)
    assert "LinkedIn JD Collector Agent" in window.windowTitle()
    assert "v1.0.10" in window.windowTitle()
    assert window.status_label.text() == "Waiting"
    assert window.btn_start.text() == "Start Agent"
    assert window.btn_pause.text() == "Pause"
    assert window.btn_stop.text() == "Stop"
    assert window.btn_folder.text() == "Open Folder"
    assert window.api_key_input.text() == "sk-test"
    assert window.model_input.text() == "openai/gpt-4o"
    window._on_log("action=click target=job_card", "AI")
    window._on_log("Current job: Eng @ Acme (page 1)", "JOB")
    window._on_log("Page number: 2", "PAGE")
    window._on_log("boom", "ERROR")
    text = window.log_panel.view.toPlainText()
    assert "AI:" in text
    assert "Current job:" in text
    assert "Page number: 2" in text or "Page: 2" in text
    assert "boom" in text
    window.close()
