"""
Shared automation safety: delays, emergency stop, action guards.
"""

from __future__ import annotations

import logging
import os
import sys
import threading
import time
from typing import Callable

logger = logging.getLogger(__name__)

# Default pause between actions (seconds). Overridden by AUTOMATION_PACE /
# AUTOMATION_SAFETY_DELAY via automation.pace.resolve_pace().
def _default_safety_delay() -> float:
    try:
        from automation.pace import resolve_pace

        return resolve_pace().safety_delay_s
    except Exception:  # noqa: BLE001
        return 0.75


DEFAULT_SAFETY_DELAY_S = 0.75
DEFAULT_EMERGENCY_HOTKEY = os.getenv("EMERGENCY_STOP_HOTKEY", "ctrl+shift+f12")


class EmergencyStopError(RuntimeError):
    """Raised when automation is aborted by the emergency stop."""


class AutomationError(RuntimeError):
    """Raised when a mouse/keyboard action fails."""


class AutomationGuard:
    """
    Process-wide automation guard.

    - Cooperative pause / stop flags
    - Emergency stop latch (hotkey or manual trigger)
    - Configurable safety delay between actions
    """

    def __init__(
        self,
        *,
        safety_delay_s: float | None = None,
        emergency_hotkey: str = DEFAULT_EMERGENCY_HOTKEY,
    ) -> None:
        if safety_delay_s is None:
            safety_delay_s = _default_safety_delay()

        self.safety_delay_s = max(0.0, float(safety_delay_s))
        self.emergency_hotkey = emergency_hotkey.lower().strip()
        self._stop = threading.Event()
        self._paused = threading.Event()
        self._listener_stop = threading.Event()
        self._listener_thread: threading.Thread | None = None
        self._lock = threading.RLock()
        self._listener_backend: str | None = None

    @property
    def stopped(self) -> bool:
        return self._stop.is_set()

    @property
    def paused(self) -> bool:
        return self._paused.is_set()

    def trigger_emergency_stop(self, reason: str = "emergency stop") -> None:
        logger.error("EMERGENCY STOP: %s", reason)
        self._stop.set()

    def clear_emergency_stop(self) -> None:
        logger.info("Emergency stop cleared")
        self._stop.clear()

    def pause(self) -> None:
        logger.info("Automation paused")
        self._paused.set()

    def resume(self) -> None:
        logger.info("Automation resumed")
        self._paused.clear()

    def check(self) -> None:
        """Raise if emergency-stopped; block while paused."""
        if self._stop.is_set():
            raise EmergencyStopError(
                f"Automation halted by emergency stop ({self.emergency_hotkey})"
            )
        while self._paused.is_set():
            if self._stop.is_set():
                raise EmergencyStopError(
                    f"Automation halted by emergency stop ({self.emergency_hotkey})"
                )
            time.sleep(0.05)

    def safety_delay(self, extra_s: float = 0.0) -> None:
        """Sleep the configured safety delay (and optional extra), abortable."""
        self.check()
        delay = self.safety_delay_s + max(0.0, extra_s)
        if delay <= 0:
            return
        logger.debug("Safety delay %.3fs", delay)
        end = time.monotonic() + delay
        while time.monotonic() < end:
            self.check()
            time.sleep(min(0.05, end - time.monotonic()))

    def start_emergency_hotkey_listener(self) -> bool:
        """
        Start a background listener for the emergency hotkey.

        On Windows, prefer RegisterHotKey (stable in frozen EXEs). pynput is a
        fallback only — it has caused hard process exits in windowed PyInstaller
        builds when the keyboard hook is installed.
        """
        with self._lock:
            if self._listener_thread and self._listener_thread.is_alive():
                return True

            self._listener_stop.clear()

            if sys.platform.startswith("win"):
                started = self._start_windows_hotkey_listener()
                if started:
                    return True
                logger.warning(
                    "Windows RegisterHotKey listener failed; "
                    "falling back to UI Stop / FAILSAFE corner "
                    "(pynput disabled to avoid EXE hard-crashes)."
                )
                return False

            return self._start_pynput_hotkey_listener()

    def _start_windows_hotkey_listener(self) -> bool:
        """Use Win32 RegisterHotKey — no global keyboard hook, safer for EXE."""
        try:
            import ctypes
            from ctypes import wintypes
        except Exception:  # noqa: BLE001
            logger.exception("ctypes unavailable for Windows hotkey listener")
            return False

        mods, vk = self._windows_hotkey_parts(self.emergency_hotkey)
        if vk is None:
            logger.warning(
                "Unsupported emergency hotkey for RegisterHotKey: %s",
                self.emergency_hotkey,
            )
            return False

        user32 = ctypes.windll.user32
        HOTKEY_ID = 0x4A44  # 'JD'
        WM_HOTKEY = 0x0312
        PM_REMOVE = 0x0001

        def _run() -> None:
            registered = False
            try:
                if not user32.RegisterHotKey(None, HOTKEY_ID, mods, vk):
                    err = ctypes.get_last_error()
                    logger.warning(
                        "RegisterHotKey failed for %s (winerr=%s)",
                        self.emergency_hotkey,
                        err,
                    )
                    return
                registered = True
                self._listener_backend = "win32"
                logger.info(
                    "Emergency stop hotkey listener started via RegisterHotKey (%s)",
                    self.emergency_hotkey,
                )
                msg = wintypes.MSG()
                while not self._listener_stop.is_set():
                    # Peek so we can observe the stop event promptly
                    has_msg = user32.PeekMessageW(
                        ctypes.byref(msg), None, 0, 0, PM_REMOVE
                    )
                    if has_msg:
                        if msg.message == WM_HOTKEY and msg.wParam == HOTKEY_ID:
                            self.trigger_emergency_stop(
                                f"hotkey pressed: {self.emergency_hotkey}"
                            )
                        user32.TranslateMessage(ctypes.byref(msg))
                        user32.DispatchMessageW(ctypes.byref(msg))
                    else:
                        time.sleep(0.05)
            except Exception:  # noqa: BLE001
                logger.exception("Windows emergency hotkey listener crashed")
            finally:
                if registered:
                    try:
                        user32.UnregisterHotKey(None, HOTKEY_ID)
                    except Exception:  # noqa: BLE001
                        logger.debug("UnregisterHotKey failed", exc_info=True)
                logger.info("Emergency stop hotkey listener stopped")

        self._listener_thread = threading.Thread(
            target=_run, name="emergency-stop-listener", daemon=True
        )
        self._listener_thread.start()
        # Give the thread a moment to register; failure is logged inside.
        time.sleep(0.05)
        return self._listener_thread.is_alive()

    def _start_pynput_hotkey_listener(self) -> bool:
        try:
            from pynput import keyboard as pynput_keyboard
        except ImportError:
            logger.warning(
                "pynput not installed; emergency hotkey listener unavailable. "
                "Use AutomationGuard.trigger_emergency_stop() or PyAutoGUI FAILSAFE "
                "(mouse to screen corner). Desired hotkey=%s",
                self.emergency_hotkey,
            )
            return False

        combo = self._parse_hotkey(self.emergency_hotkey)

        def _run() -> None:
            current: set[str] = set()
            target = set(combo)
            listener = None
            try:
                def on_press(key: object) -> None:
                    try:
                        current.add(self._normalize_pynput_key(key))
                        if target and target.issubset(current):
                            self.trigger_emergency_stop(
                                f"hotkey pressed: {self.emergency_hotkey}"
                            )
                    except Exception:  # noqa: BLE001
                        logger.exception("Emergency hotkey press handler failed")

                def on_release(key: object) -> None:
                    try:
                        current.discard(self._normalize_pynput_key(key))
                    except Exception:  # noqa: BLE001
                        logger.exception("Emergency hotkey release handler failed")

                listener = pynput_keyboard.Listener(
                    on_press=on_press, on_release=on_release
                )
                listener.start()
                self._listener_backend = "pynput"
                logger.info(
                    "Emergency stop hotkey listener started (%s)", self.emergency_hotkey
                )
                self._listener_stop.wait()
            except Exception:  # noqa: BLE001
                logger.exception("pynput emergency hotkey listener failed")
            finally:
                if listener is not None:
                    try:
                        listener.stop()
                    except Exception:  # noqa: BLE001
                        logger.debug("pynput listener stop failed", exc_info=True)
                logger.info("Emergency stop hotkey listener stopped")

        self._listener_thread = threading.Thread(
            target=_run, name="emergency-stop-listener", daemon=True
        )
        self._listener_thread.start()
        return True

    def stop_emergency_hotkey_listener(self) -> None:
        with self._lock:
            self._listener_stop.set()
            thread = self._listener_thread
        if thread and thread.is_alive():
            thread.join(timeout=1.5)
        self._listener_backend = None

    @staticmethod
    def _windows_hotkey_parts(hotkey: str) -> tuple[int, int | None]:
        """Map 'ctrl+shift+f12' → (MOD flags, virtual-key)."""
        MOD_ALT = 0x0001
        MOD_CONTROL = 0x0002
        MOD_SHIFT = 0x0004
        MOD_WIN = 0x0008
        parts = {p.strip().lower() for p in hotkey.split("+") if p.strip()}
        mods = 0
        key_part = None
        for part in parts:
            if part in {"ctrl", "control", "ctl"}:
                mods |= MOD_CONTROL
            elif part == "shift":
                mods |= MOD_SHIFT
            elif part == "alt" or part == "option":
                mods |= MOD_ALT
            elif part in {"win", "cmd", "super"}:
                mods |= MOD_WIN
            else:
                key_part = part
        if not key_part:
            return mods, None
        # Function keys F1–F24
        if key_part.startswith("f") and key_part[1:].isdigit():
            n = int(key_part[1:])
            if 1 <= n <= 24:
                return mods, 0x70 + (n - 1)  # VK_F1 = 0x70
        if len(key_part) == 1:
            return mods, ord(key_part.upper())
        named = {
            "esc": 0x1B,
            "escape": 0x1B,
            "space": 0x20,
            "tab": 0x09,
            "enter": 0x0D,
            "return": 0x0D,
        }
        return mods, named.get(key_part)

    @staticmethod
    def _parse_hotkey(hotkey: str) -> frozenset[str]:
        parts = [p.strip().lower() for p in hotkey.split("+") if p.strip()]
        normalized = []
        for part in parts:
            aliases = {
                "control": "ctrl",
                "ctl": "ctrl",
                "cmd": "cmd",
                "win": "cmd",
                "option": "alt",
                "escape": "esc",
            }
            normalized.append(aliases.get(part, part))
        return frozenset(normalized)

    @staticmethod
    def _normalize_pynput_key(key: object) -> str:
        from pynput.keyboard import Key

        if isinstance(key, Key):
            name = key.name.lower()
            aliases = {
                "ctrl_l": "ctrl",
                "ctrl_r": "ctrl",
                "alt_l": "alt",
                "alt_r": "alt",
                "shift_l": "shift",
                "shift_r": "shift",
                "cmd": "cmd",
                "cmd_l": "cmd",
                "cmd_r": "cmd",
                "esc": "esc",
            }
            return aliases.get(name, name)
        # Character key
        char = getattr(key, "char", None)
        if char:
            return str(char).lower()
        return str(key).lower()


# Process-wide default guard used by controllers unless overridden.
default_guard = AutomationGuard()


def guarded(action_name: str, guard: AutomationGuard | None = None) -> Callable:
    """Decorator for logging + safety delay + failure wrapping."""

    def decorator(func: Callable) -> Callable:
        def wrapper(*args, **kwargs):
            active = guard or default_guard
            # Allow instance.guard to override when bound methods pass self
            inst = args[0] if args else None
            inst_guard = getattr(inst, "guard", None)
            use_guard: AutomationGuard = inst_guard or active

            use_guard.check()
            logger.info("ACTION start: %s args=%s kwargs=%s", action_name, args[1:] if inst is not None else args, kwargs)
            try:
                result = func(*args, **kwargs)
                use_guard.safety_delay()
                logger.info("ACTION ok: %s", action_name)
                return result
            except EmergencyStopError:
                logger.error("ACTION aborted by emergency stop: %s", action_name)
                raise
            except Exception as exc:  # noqa: BLE001
                logger.exception("ACTION failed: %s (%s)", action_name, exc)
                raise AutomationError(f"{action_name} failed: {exc}") from exc

        wrapper.__name__ = getattr(func, "__name__", action_name)
        wrapper.__doc__ = func.__doc__
        return wrapper

    return decorator
