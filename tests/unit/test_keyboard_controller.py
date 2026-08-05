"""Unit tests for KeyboardController with fake backends."""

from __future__ import annotations

import pytest

from automation.keyboard_controller import KeyboardController
from automation.safety import AutomationError, AutomationGuard, EmergencyStopError


class FakeKeyboard:
    FAILSAFE = True
    PAUSE = 0

    def __init__(self):
        self.calls = []

    def hotkey(self, *args, interval=0.0):
        self.calls.append(("hotkey", args, interval))

    def keyDown(self, key):
        self.calls.append(("keyDown", key))

    def keyUp(self, key):
        self.calls.append(("keyUp", key))

    def press(self, keys, presses=1, interval=0.0):
        self.calls.append(("press", keys, presses))


class FakeClipboard:
    def __init__(self, text="hello jd"):
        self.text = text

    def paste(self):
        return self.text

    def copy(self, text):
        self.text = text


@pytest.fixture
def guard():
    return AutomationGuard(safety_delay_s=0.0)


def test_hotkey_and_copy(guard):
    kb_backend = FakeKeyboard()
    clip = FakeClipboard("before")
    keyboard = KeyboardController(
        guard=guard,
        backend=kb_backend,
        clipboard=clip,
        copy_settle_s=0.0,
        enable_emergency_hotkey=False,
    )

    keyboard.hotkey("ctrl", "a")
    clip.text = "About the job\nDetails"
    text = keyboard.copy()

    assert ("hotkey", ("ctrl", "a"), 0.05) in kb_backend.calls
    assert any(c[0] == "hotkey" and c[1] == ("ctrl", "c") for c in kb_backend.calls)
    assert text == "About the job\nDetails"
    keyboard.close()


def test_hotkey_empty_fails(guard):
    keyboard = KeyboardController(
        guard=guard,
        backend=FakeKeyboard(),
        clipboard=FakeClipboard(),
        enable_emergency_hotkey=False,
    )
    with pytest.raises(AutomationError):
        keyboard.hotkey()
    keyboard.close()


def test_emergency_stop_blocks_hotkey(guard):
    keyboard = KeyboardController(
        guard=guard,
        backend=FakeKeyboard(),
        clipboard=FakeClipboard(),
        enable_emergency_hotkey=False,
    )
    guard.trigger_emergency_stop("test")
    with pytest.raises(EmergencyStopError):
        keyboard.hotkey("ctrl", "c")
    keyboard.close()


def test_copy_warns_when_unchanged(guard, caplog):
    kb_backend = FakeKeyboard()
    clip = FakeClipboard("same")
    keyboard = KeyboardController(
        guard=guard,
        backend=kb_backend,
        clipboard=clip,
        copy_settle_s=0.0,
        enable_emergency_hotkey=False,
    )
    with caplog.at_level("WARNING"):
        text = keyboard.copy()
    assert text == "same"
    assert any("unchanged" in r.message.lower() for r in caplog.records)
    keyboard.close()
