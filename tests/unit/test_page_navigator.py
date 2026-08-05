"""Tests for PageNavigator next detection and click."""

from __future__ import annotations

from ai.vision_agent import Coordinates, VisionAction
from linkedin.page_navigator import PageNavigator


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


def test_has_next_and_click():
    vision = FakeVision([])
    mouse = FakeMouse()
    nav = PageNavigator(vision=vision, mouse=mouse, page_load_wait_s=0)
    action = VisionAction(
        action="next_page",
        target="next_button",
        coordinates=Coordinates(800, 900),
        detections={"next_button": True},
    )
    assert nav.has_next(action) is True
    assert nav.click_next(action) is True
    assert ("move", 800, 900) in mouse.calls
    assert any(c[0] == "click" for c in mouse.calls)


def test_finish_means_no_next():
    nav = PageNavigator(vision=FakeVision([]), mouse=FakeMouse(), page_load_wait_s=0)
    action = VisionAction(action="finish", observation="no next")
    assert nav.has_next(action) is False


def test_go_to_next_page_false_when_finish():
    vision = FakeVision([VisionAction(action="finish")])
    nav = PageNavigator(vision=vision, mouse=FakeMouse(), page_load_wait_s=0)
    assert nav.go_to_next_page(lambda: b"png") is False
