"""Tests for UI settings persistence and status mapping (no display required)."""

from __future__ import annotations

from pathlib import Path

from agent.state_manager import WorkflowState
from ui.settings import AppSettings, load_settings, save_settings
from ui.status import UiStatus, ui_status_for_state


def test_ui_status_mapping():
    assert ui_status_for_state(WorkflowState.IDLE) == UiStatus.WAITING
    assert ui_status_for_state(WorkflowState.ANALYZE) == UiStatus.ANALYZING_SCREEN
    assert ui_status_for_state(WorkflowState.OPEN_JOB) == UiStatus.PROCESSING_JOBS
    assert ui_status_for_state(WorkflowState.COPY_JD) == UiStatus.COPYING_JD
    assert ui_status_for_state(WorkflowState.COMPLETE) == UiStatus.COMPLETED
    assert ui_status_for_state(WorkflowState.ANALYZE, paused=True) == UiStatus.PAUSED


def test_save_and_load_settings(tmp_path: Path, monkeypatch):
    settings_path = tmp_path / "ui_settings.json"
    monkeypatch.setenv("OPENROUTER_API_KEY", "")
    monkeypatch.setenv("OPENROUTER_MODEL", "")
    monkeypatch.setenv("OUTPUT_DIR", str(tmp_path / "out"))

    original = AppSettings(
        openrouter_api_key="sk-test-key",
        vision_model="test/vision-model",
        output_dir=str(tmp_path / "LinkedIn_JD"),
    )
    # Avoid rewriting package .env during unit test: patch helper
    import ui.settings as settings_mod

    monkeypatch.setattr(settings_mod, "_SETTINGS_PATH", settings_path)
    monkeypatch.setattr(settings_mod, "_upsert_env", lambda values: None)

    save_settings(original, path=settings_path)
    loaded = load_settings(path=settings_path)
    assert loaded.openrouter_api_key == "sk-test-key"
    assert loaded.vision_model == "test/vision-model"
