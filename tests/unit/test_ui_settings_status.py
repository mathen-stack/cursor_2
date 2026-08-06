"""Tests for UI settings persistence and status mapping (no display required)."""

from __future__ import annotations

from pathlib import Path

from agent.state_manager import WorkflowState
from ui.settings import AppSettings, load_settings, save_settings
from ui.status import UiStatus, ui_status_for_state


def test_ui_status_mapping():
    assert ui_status_for_state(WorkflowState.IDLE) == UiStatus.WAITING
    assert ui_status_for_state(WorkflowState.CAPTURE) == UiStatus.CAPTURING_SCREEN
    assert ui_status_for_state(WorkflowState.ANALYZE) == UiStatus.ANALYZING_SCREEN
    assert ui_status_for_state(WorkflowState.OPEN_JOB) == UiStatus.CLICKING_JOB
    assert ui_status_for_state(WorkflowState.WAIT_DETAIL) == UiStatus.WAITING_DETAILS
    assert ui_status_for_state(WorkflowState.FIND_JD) == UiStatus.FINDING_JD
    assert ui_status_for_state(WorkflowState.SELECT_JD) == UiStatus.SELECTING_JD
    assert ui_status_for_state(WorkflowState.COPY_JD) == UiStatus.COPYING_JD
    assert ui_status_for_state(WorkflowState.SAVE_JD) == UiStatus.SAVING_JD
    assert ui_status_for_state(WorkflowState.PAGINATE) == UiStatus.PAGINATING
    assert ui_status_for_state(WorkflowState.COMPLETE) == UiStatus.COMPLETED
    assert ui_status_for_state(WorkflowState.ANALYZE, paused=True) == UiStatus.PAUSED


def test_ui_status_for_step():
    from ui.status import ui_status_for_step

    assert ui_status_for_step("select_jd") == UiStatus.SELECTING_JD
    assert ui_status_for_step("paginate") == UiStatus.PAGINATING
    assert ui_status_for_step("", WorkflowState.COPY_JD) == UiStatus.COPYING_JD


def test_save_and_load_settings(tmp_path: Path, monkeypatch):
    settings_file = tmp_path / "ui_settings.json"
    monkeypatch.setenv("OPENROUTER_API_KEY", "")
    monkeypatch.setenv("OPENROUTER_MODEL", "")
    monkeypatch.delenv("AUTOMATION_PACE", raising=False)
    monkeypatch.setenv("OUTPUT_DIR", str(tmp_path / "out"))

    original = AppSettings(
        openrouter_api_key="sk-test-key",
        vision_model="test/vision-model",
        output_dir=str(tmp_path / "LinkedIn_JD"),
        automation_pace="human",
    )
    # Avoid rewriting package .env during unit test: patch helper
    import ui.settings as settings_mod

    monkeypatch.setattr(settings_mod, "_upsert_env", lambda values: None)

    save_settings(original, path=settings_file)
    loaded = load_settings(path=settings_file)
    assert loaded.openrouter_api_key == "sk-test-key"
    assert loaded.vision_model == "test/vision-model"
    assert loaded.automation_pace == "human"


def test_user_data_settings_path(tmp_path: Path, monkeypatch):
    import ui.paths as paths_mod
    import ui.settings as settings_mod

    monkeypatch.setattr(paths_mod, "user_data_dir", lambda: tmp_path)
    monkeypatch.setattr(settings_mod, "_upsert_env", lambda values: None)
    monkeypatch.setenv("OPENROUTER_API_KEY", "")
    monkeypatch.setenv("OPENROUTER_MODEL", "")

    original = AppSettings(
        openrouter_api_key="sk-path-test",
        vision_model="custom/vision-keep",
        output_dir=str(tmp_path / "out"),
    )
    save_settings(original)
    assert (tmp_path / "ui_settings.json").exists()
    loaded = load_settings()
    assert loaded.openrouter_api_key == "sk-path-test"
    assert loaded.vision_model == "custom/vision-keep"


def test_retired_free_model_migrates_on_load(tmp_path: Path, monkeypatch):
    import ui.paths as paths_mod
    import ui.settings as settings_mod
    from ai.openrouter_client import DEFAULT_MODEL

    settings_file = tmp_path / "ui_settings.json"
    payload = {
        "openrouter_api_key": "sk-x",
        "vision_model": "qwen/qwen2.5-vl-72b-instruct:free",
        "output_dir": str(tmp_path),
    }
    settings_file.write_text(
        __import__("json").dumps(payload),
        encoding="utf-8",
    )
    monkeypatch.setattr(paths_mod, "user_data_dir", lambda: tmp_path)
    monkeypatch.setattr(settings_mod, "_upsert_env", lambda values: None)
    monkeypatch.setenv("OPENROUTER_API_KEY", "")
    monkeypatch.setenv("OPENROUTER_MODEL", "")

    loaded = load_settings(path=settings_file)
    assert loaded.vision_model == DEFAULT_MODEL


def test_legacy_paid_default_migrates_on_load(tmp_path: Path, monkeypatch):
    import ui.paths as paths_mod
    import ui.settings as settings_mod
    from ai.openrouter_client import DEFAULT_MODEL

    settings_file = tmp_path / "ui_settings.json"
    payload = {
        "openrouter_api_key": "sk-x",
        "vision_model": "openai/gpt-4o",
        "output_dir": str(tmp_path),
    }
    settings_file.write_text(
        __import__("json").dumps(payload),
        encoding="utf-8",
    )
    monkeypatch.setattr(paths_mod, "user_data_dir", lambda: tmp_path)
    monkeypatch.setattr(settings_mod, "_upsert_env", lambda values: None)
    monkeypatch.setenv("OPENROUTER_API_KEY", "")
    monkeypatch.setenv("OPENROUTER_MODEL", "")

    loaded = load_settings(path=settings_file)
    assert loaded.vision_model == DEFAULT_MODEL
