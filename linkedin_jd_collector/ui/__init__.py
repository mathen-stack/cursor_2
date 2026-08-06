"""Desktop UI package (PyQt6): main window, settings, logger widgets."""

from .settings import AppSettings, load_settings, save_settings
from .status import UiStatus, ui_status_for_state, ui_status_for_step

__all__ = [
    "AppSettings",
    "MainWindow",
    "UiStatus",
    "load_settings",
    "save_settings",
    "ui_status_for_state",
    "ui_status_for_step",
]


def __getattr__(name: str):
    if name == "MainWindow":
        from .main_window import MainWindow

        return MainWindow
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
