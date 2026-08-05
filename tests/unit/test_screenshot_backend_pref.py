"""Screenshot backend preference (Windows defaults to PIL to avoid mss AVs)."""

from __future__ import annotations

import screen.screenshot as shot_mod


def test_prefer_pil_default_on_windows(monkeypatch):
    monkeypatch.setattr(shot_mod.sys, "platform", "win32")
    monkeypatch.delenv("USE_MSS", raising=False)
    monkeypatch.delenv("SCREENSHOT_BACKEND", raising=False)
    assert shot_mod._prefer_pil() is True


def test_prefer_mss_when_forced(monkeypatch):
    monkeypatch.setattr(shot_mod.sys, "platform", "win32")
    monkeypatch.setenv("USE_MSS", "1")
    assert shot_mod._prefer_pil() is False


def test_prefer_pil_when_backend_env_set(monkeypatch):
    monkeypatch.setattr(shot_mod.sys, "platform", "linux")
    monkeypatch.setenv("SCREENSHOT_BACKEND", "pil")
    monkeypatch.delenv("USE_MSS", raising=False)
    assert shot_mod._prefer_pil() is True
