"""
Keyboard control via PyAutoGUI.

Provides hotkey() and copy() with safety delay, emergency-stop checks,
logging, and failure handling.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Iterable, Protocol

from .safety import (
    AutomationError,
    AutomationGuard,
    EmergencyStopError,
    default_guard,
)

logger = logging.getLogger(__name__)


class KeyboardBackend(Protocol):
    FAILSAFE: bool
    PAUSE: float

    def hotkey(self, *args: str, interval: float = 0.0) -> None: ...
    def keyDown(self, key: str) -> None: ...
    def keyUp(self, key: str) -> None: ...
    def press(self, keys: str | Iterable[str], presses: int = 1, interval: float = 0.0) -> None: ...


class ClipboardBackend(Protocol):
    def paste(self) -> str: ...
    def copy(self, text: str) -> None: ...


def _load_pyautogui() -> KeyboardBackend:
    import pyautogui

    pyautogui.FAILSAFE = True
    pyautogui.PAUSE = 0
    return pyautogui


def _load_pyperclip() -> ClipboardBackend:
    import pyperclip

    return pyperclip


class KeyboardController:
    """High-level keyboard automation API."""

    def __init__(
        self,
        guard: AutomationGuard | None = None,
        backend: KeyboardBackend | None = None,
        clipboard: ClipboardBackend | None = None,
        *,
        copy_settle_s: float = 0.15,
        enable_emergency_hotkey: bool = True,
    ) -> None:
        self.guard = guard or default_guard
        self.backend = backend or _load_pyautogui()
        self._clipboard = clipboard
        self.copy_settle_s = max(0.0, copy_settle_s)

        if enable_emergency_hotkey:
            try:
                started = self.guard.start_emergency_hotkey_listener()
                if started:
                    logger.info(
                        "Emergency stop armed on hotkey=%s",
                        self.guard.emergency_hotkey,
                    )
                else:
                    logger.warning(
                        "Emergency hotkey listener unavailable; use Stop button "
                        "or move mouse to a screen corner (FAILSAFE)."
                    )
            except Exception:  # noqa: BLE001
                # Never let hotkey setup kill the agent process / UI.
                logger.exception(
                    "Emergency hotkey listener failed to start; continuing without it"
                )

        logger.info(
            "KeyboardController ready safety_delay=%.3fs",
            self.guard.safety_delay_s,
        )

    @property
    def clipboard(self) -> ClipboardBackend:
        if self._clipboard is None:
            self._clipboard = _load_pyperclip()
        return self._clipboard

    def _run(self, action_name: str, fn) -> Any:
        self.guard.check()
        logger.info("ACTION start: %s", action_name)
        try:
            result = fn()
            self.guard.safety_delay()
            logger.info("ACTION ok: %s", action_name)
            return result
        except EmergencyStopError:
            logger.error("ACTION aborted by emergency stop: %s", action_name)
            raise
        except Exception as exc:  # noqa: BLE001
            name = type(exc).__name__
            if "FailSafe" in name:
                self.guard.trigger_emergency_stop("PyAutoGUI FAILSAFE (screen corner)")
                raise EmergencyStopError(str(exc)) from exc
            logger.exception("ACTION failed: %s (%s)", action_name, exc)
            raise AutomationError(f"{action_name} failed: {exc}") from exc

    def hotkey(self, *keys: str, interval: float = 0.05) -> None:
        """
        Press a keyboard shortcut chord, e.g. hotkey('ctrl', 'c').
        """
        if not keys:
            raise AutomationError("hotkey() requires at least one key")

        normalized = tuple(str(k).lower().strip() for k in keys if str(k).strip())
        if not normalized:
            raise AutomationError("hotkey() received empty key list")

        def _do() -> None:
            logger.info("hotkey %s", "+".join(normalized))
            self.backend.hotkey(*normalized, interval=interval)

        self._run(f"hotkey({'+'.join(normalized)})", _do)

    def copy(self, *, read_clipboard: bool = True, settle_s: float | None = None) -> str | None:
        """
        Issue Ctrl+C and optionally return the resulting clipboard text.

        Returns:
            Clipboard text when read_clipboard=True, otherwise None.
        """
        wait = self.copy_settle_s if settle_s is None else max(0.0, settle_s)

        def _do() -> str | None:
            before = None
            if read_clipboard:
                try:
                    before = self.clipboard.paste()
                except Exception:  # noqa: BLE001
                    logger.warning("Could not read clipboard before copy", exc_info=True)

            logger.info("copy via ctrl+c (settle=%.3fs)", wait)
            self.backend.hotkey("ctrl", "c")
            if wait:
                time.sleep(wait)

            if not read_clipboard:
                return None

            try:
                text = self.clipboard.paste()
            except Exception as exc:  # noqa: BLE001
                raise AutomationError(f"Failed to read clipboard after copy: {exc}") from exc

            if text is None:
                text = ""
            if before is not None and text == before:
                logger.warning(
                    "Clipboard unchanged after Ctrl+C (len=%s). "
                    "Selection may have failed.",
                    len(text),
                )
            else:
                logger.info("Clipboard read after copy len=%s", len(text))
            return text

        return self._run("copy()", _do)

    def select_all_and_copy(self) -> str | None:
        """Convenience: Ctrl+A then Ctrl+C (focused widget must be correct)."""

        def _do() -> str | None:
            logger.info("select_all_and_copy")
            self.backend.hotkey("ctrl", "a")
            self.guard.safety_delay()
            self.backend.hotkey("ctrl", "c")
            if self.copy_settle_s:
                time.sleep(self.copy_settle_s)
            return self.clipboard.paste()

        return self._run("select_all_and_copy()", _do)

    def close(self) -> None:
        self.guard.stop_emergency_hotkey_listener()


# Module-level convenience functions
_default_keyboard: KeyboardController | None = None


def _keyboard() -> KeyboardController:
    global _default_keyboard
    if _default_keyboard is None:
        _default_keyboard = KeyboardController()
    return _default_keyboard


def hotkey(*keys: str, interval: float = 0.05) -> None:
    _keyboard().hotkey(*keys, interval=interval)


def copy(*, read_clipboard: bool = True, settle_s: float | None = None) -> str | None:
    return _keyboard().copy(read_clipboard=read_clipboard, settle_s=settle_s)
