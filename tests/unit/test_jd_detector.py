"""Tests for JD extraction: locate → select → Ctrl+C → exact clipboard text."""

from __future__ import annotations

import pytest

from ai.vision_agent import Coordinates, VisionAction
from automation.clipboard import ClipboardService
from linkedin.jd_detector import JdDetector, JdExtractionError


class FakeVision:
    def __init__(self, actions):
        self.actions = list(actions)

    def analyze_screenshot(self, screenshot, extra_context=None):
        return self.actions.pop(0)


class FakeMouse:
    def __init__(self):
        self.calls = []

    def move(self, x, y, duration=None):
        self.calls.append(("move", x, y))

    def click(self, x=None, y=None, button="left"):
        self.calls.append(("click", x, y))

    def select_text(self, x1, y1, x2, y2, duration=0.25):
        self.calls.append(("select_text", x1, y1, x2, y2))


class FakeKeyboard:
    def __init__(self):
        self.calls = []

    def hotkey(self, *keys, interval=0.05):
        self.calls.append(("hotkey", keys))


class FakeClip:
    def __init__(self):
        self.text = ""

    def paste(self):
        return self.text

    def copy(self, text):
        self.text = text


def test_extract_jd_drag_select_and_exact_clipboard():
    original = (
        "About the job\nBuild APIs\n\nRequirements:\n- Python\n"
        "More description to exceed minimum clipboard length checks.\n"
    )
    locate = VisionAction(
        action="click",
        target="about_the_job",
        coordinates=Coordinates(500, 400),
        detections={"about_the_job": True},
        raw={"select": {"x1": 480, "y1": 380, "x2": 900, "y2": 800}},
    )
    vision = FakeVision([locate])
    mouse = FakeMouse()
    keyboard = FakeKeyboard()
    clip_backend = FakeClip()
    clipboard = ClipboardService(
        backend=clip_backend, settle_s=0.0, read_retries=2, retry_delay_s=0.0
    )

    def hotkey_side_effect(*keys, interval=0.05):
        keyboard.calls.append(("hotkey", keys))
        if keys == ("ctrl", "c"):
            clip_backend.text = original

    keyboard.hotkey = hotkey_side_effect

    detector = JdDetector(
        vision=vision,
        mouse=mouse,
        keyboard=keyboard,
        clipboard=clipboard,
        max_extract_attempts=1,
    )
    result = detector.extract_jd(lambda: b"png")

    assert ("select_text", 480, 380, 900, 800) in mouse.calls
    assert any(c == ("hotkey", ("ctrl", "c")) for c in keyboard.calls)
    assert result.text == original
    assert result.selection_method == "drag_region"


def test_extract_jd_focus_point_drags_through_right_panel():
    """Match human stage: focus About the job, drag down, then Ctrl+C."""
    locate = VisionAction(
        action="copy",
        target="about_the_job",
        coordinates=Coordinates(510, 420),
        raw={},
    )
    vision = FakeVision([locate])
    mouse = FakeMouse()
    keyboard = FakeKeyboard()
    clip_backend = FakeClip()
    clipboard = ClipboardService(
        backend=clip_backend, settle_s=0.0, read_retries=1, retry_delay_s=0.0
    )
    raw_jd = "About the job\n" + ("Raw JD line with enough characters.\n" * 4)

    def hotkey_side_effect(*keys, interval=0.05):
        keyboard.calls.append(("hotkey", keys))
        if keys == ("ctrl", "c"):
            clip_backend.text = raw_jd

    keyboard.hotkey = hotkey_side_effect
    detector = JdDetector(
        vision=vision,
        mouse=mouse,
        keyboard=keyboard,
        clipboard=clipboard,
        max_extract_attempts=1,
        select_drag_duration_s=0.0,
    )
    result = detector.extract_jd(
        lambda: b"png",
        select_fallback_region=(400, 300, 1100, 900),
    )
    assert result.text == raw_jd
    assert result.selection_method == "focus_drag"
    assert ("select_text", 510, 420, 1100, 900) in mouse.calls
    assert any(c == ("hotkey", ("ctrl", "c")) for c in keyboard.calls)


def test_right_panel_jd_region_stays_in_detail_pane():
    from linkedin.jd_detector import right_panel_jd_region

    x1, y1, x2, y2 = right_panel_jd_region(1920, 1080)
    assert x1 > 1920 * 0.3
    assert y1 > 1080 * 0.35  # below Apply / match widgets
    assert x2 > x1
    assert y2 > y1


def test_extract_jd_fails_when_clipboard_empty():
    locate = VisionAction(
        action="copy",
        target="about_the_job",
        coordinates=Coordinates(1, 2),
        raw={},
    )
    vision = FakeVision([locate])
    mouse = FakeMouse()
    keyboard = FakeKeyboard()
    clipboard = ClipboardService(
        backend=FakeClip(), settle_s=0.0, read_retries=1, retry_delay_s=0.0
    )
    detector = JdDetector(
        vision=vision,
        mouse=mouse,
        keyboard=keyboard,
        clipboard=clipboard,
        max_extract_attempts=1,
    )
    with pytest.raises(JdExtractionError):
        detector.extract_jd(lambda: b"png")
