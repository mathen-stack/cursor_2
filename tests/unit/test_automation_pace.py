"""Tests for human-visible automation pacing."""

from __future__ import annotations

from automation.pace import FAST, HUMAN, resolve_pace


def test_default_pace_is_human(monkeypatch):
    monkeypatch.delenv("AUTOMATION_PACE", raising=False)
    monkeypatch.delenv("AUTOMATION_SAFETY_DELAY", raising=False)
    pace = resolve_pace()
    assert pace.name == "human"
    assert pace.move_duration_s == HUMAN.move_duration_s
    assert pace.select_drag_s >= 1.0
    assert pace.safety_delay_s >= 0.5


def test_fast_pace(monkeypatch):
    monkeypatch.setenv("AUTOMATION_PACE", "fast")
    monkeypatch.delenv("AUTOMATION_SAFETY_DELAY", raising=False)
    pace = resolve_pace()
    assert pace.name == "fast"
    assert pace.select_drag_s == FAST.select_drag_s


def test_safety_delay_env_override(monkeypatch):
    monkeypatch.setenv("AUTOMATION_PACE", "human")
    monkeypatch.setenv("AUTOMATION_SAFETY_DELAY", "1.5")
    pace = resolve_pace()
    assert pace.safety_delay_s == 1.5
    assert pace.move_duration_s == HUMAN.move_duration_s
