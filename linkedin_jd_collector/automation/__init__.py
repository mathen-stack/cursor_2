"""Computer automation package: mouse, keyboard, clipboard actuation."""

from .keyboard_controller import KeyboardController, copy, hotkey
from .mouse_controller import (
    MouseController,
    click,
    double_click,
    move,
    scroll,
    select_text,
)
from .safety import (
    AutomationError,
    AutomationGuard,
    EmergencyStopError,
    default_guard,
)

__all__ = [
    "AutomationError",
    "AutomationGuard",
    "EmergencyStopError",
    "KeyboardController",
    "MouseController",
    "click",
    "copy",
    "default_guard",
    "double_click",
    "hotkey",
    "move",
    "scroll",
    "select_text",
]
