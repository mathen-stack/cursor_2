"""Unit tests for MouseController with a fake backend."""

from __future__ import annotations

import pytest

from automation.mouse_controller import MouseController
from automation.safety import AutomationError, AutomationGuard, EmergencyStopError


class FakeMouse:
    FAILSAFE = True
    PAUSE = 0

    def __init__(self):
        self.calls = []
        self._pos = (0, 0)

    def size(self):
        return (1920, 1080)

    def position(self):
        return self._pos

    def moveTo(self, x, y, duration=0.0):
        self.calls.append(("moveTo", x, y, duration))
        self._pos = (x, y)

    def click(self, x=None, y=None, clicks=1, interval=0.0, button="left"):
        self.calls.append(("click", x, y, clicks, button))

    def doubleClick(self, x=None, y=None, button="left"):
        self.calls.append(("doubleClick", x, y, button))

    def scroll(self, clicks, x=None, y=None):
        self.calls.append(("scroll", clicks, x, y))

    def dragTo(self, x, y, duration=0.0, button="left"):
        self.calls.append(("dragTo", x, y, duration, button))
        self._pos = (x, y)

    def mouseDown(self, x=None, y=None, button="left"):
        self.calls.append(("mouseDown", x, y, button))

    def mouseUp(self, x=None, y=None, button="left"):
        self.calls.append(("mouseUp", x, y, button))


@pytest.fixture
def guard():
    g = AutomationGuard(safety_delay_s=0.0)
    return g


def test_move_click_double_click_scroll(guard):
    backend = FakeMouse()
    mouse = MouseController(guard=guard, backend=backend, move_duration_s=0.0)

    mouse.move(300, 450)
    mouse.click()
    mouse.double_click(10, 20)
    mouse.scroll(dy=-5, x=100, y=200)

    assert ("moveTo", 300, 450, 0.0) in backend.calls
    assert any(c[0] == "click" for c in backend.calls)
    assert ("doubleClick", 10, 20, "left") in backend.calls
    assert ("scroll", -5, 100, 200) in backend.calls


def test_select_text_drag(guard):
    backend = FakeMouse()
    mouse = MouseController(guard=guard, backend=backend, move_duration_s=0.0)
    mouse.select_text(10, 10, 200, 300, duration=0.0)
    assert any(c[0] == "mouseDown" for c in backend.calls)
    assert any(c[0] == "dragTo" for c in backend.calls)
    assert any(c[0] == "mouseUp" for c in backend.calls)


def test_emergency_stop_blocks_actions(guard):
    backend = FakeMouse()
    mouse = MouseController(guard=guard, backend=backend, move_duration_s=0.0)
    guard.trigger_emergency_stop("test")
    with pytest.raises(EmergencyStopError):
        mouse.click(1, 2)


def test_clamp_out_of_bounds(guard):
    backend = FakeMouse()
    mouse = MouseController(guard=guard, backend=backend, move_duration_s=0.0)
    mouse.move(5000, -10)
    assert ("moveTo", 1919, 0, 0.0) in backend.calls


def test_backend_failure_wrapped(guard):
    class Boom(FakeMouse):
        def click(self, *args, **kwargs):
            raise RuntimeError("boom")

    mouse = MouseController(guard=guard, backend=Boom(), move_duration_s=0.0)
    with pytest.raises(AutomationError, match="click"):
        mouse.click(1, 2)
