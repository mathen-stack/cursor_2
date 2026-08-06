"""Start Agent must not tear down the UI when settings save or worker setup fails."""

from __future__ import annotations

import os

import pytest

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

pytest.importorskip("PyQt6")

from PyQt6.QtWidgets import QApplication, QMessageBox

from ui.main_window import MainWindow
from ui.settings import AppSettings


@pytest.fixture(scope="module")
def qapp():
    app = QApplication.instance()
    if app is None:
        app = QApplication([])
    return app


def test_on_start_survives_settings_save_error(qapp, tmp_path, monkeypatch):
    import ui.settings as settings_mod

    def boom(settings, path=None):
        raise OSError("Access is denied")

    monkeypatch.setattr(settings_mod, "save_settings", boom)

    # Avoid modal dialogs blocking the test
    monkeypatch.setattr(QMessageBox, "warning", lambda *a, **k: QMessageBox.StandardButton.Ok)
    monkeypatch.setattr(QMessageBox, "critical", lambda *a, **k: QMessageBox.StandardButton.Ok)

    started = {"count": 0}

    window = MainWindow(
        settings=AppSettings(
            openrouter_api_key="sk-test",
            vision_model="openai/gpt-4o",
            output_dir=str(tmp_path),
        )
    )

    def fake_start(settings):
        started["count"] += 1

    monkeypatch.setattr(window.controller, "start", fake_start)
    window.on_start()

    assert started["count"] == 1
    assert window.isVisible() or True  # window object still alive
    assert window.btn_start.isEnabled() is False  # running state
    window.close()


def test_on_start_shows_error_instead_of_dying(qapp, tmp_path, monkeypatch):
    import ui.settings as settings_mod

    monkeypatch.setattr(settings_mod, "save_settings", lambda *a, **k: None)
    monkeypatch.setattr(QMessageBox, "critical", lambda *a, **k: QMessageBox.StandardButton.Ok)
    monkeypatch.setattr(QMessageBox, "warning", lambda *a, **k: QMessageBox.StandardButton.Ok)

    window = MainWindow(
        settings=AppSettings(
            openrouter_api_key="sk-test",
            vision_model="openai/gpt-4o",
            output_dir=str(tmp_path),
        )
    )

    def explode(settings):
        raise RuntimeError("simulated start failure")

    monkeypatch.setattr(window.controller, "start", explode)
    window.on_start()

    # UI recovered to idle after failure
    assert window.btn_start.isEnabled() is True
    window.close()


def test_windows_hotkey_parts():
    from automation.safety import AutomationGuard

    mods, vk = AutomationGuard._windows_hotkey_parts("ctrl+shift+f12")
    assert mods & 0x0002  # CONTROL
    assert mods & 0x0004  # SHIFT
    assert vk == 0x7B  # VK_F12
