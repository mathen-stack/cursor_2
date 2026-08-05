"""
Shared automation safety: delays, emergency stop, action guards.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from typing import Callable

logger = logging.getLogger(__name__)

# Default pause between actions (seconds). Override with AUTOMATION_SAFETY_DELAY.
DEFAULT_SAFETY_DELAY_S = 0.35
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
        env_delay = os.getenv("AUTOMATION_SAFETY_DELAY")
        if safety_delay_s is None:
            safety_delay_s = float(env_delay) if env_delay else DEFAULT_SAFETY_DELAY_S

        self.safety_delay_s = max(0.0, float(safety_delay_s))
        self.emergency_hotkey = emergency_hotkey.lower().strip()
        self._stop = threading.Event()
        self._paused = threading.Event()
        self._listener_stop = threading.Event()
        self._listener_thread: threading.Thread | None = None
        self._lock = threading.RLock()

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

        Returns True if a listener was started. Uses pynput when available;
        otherwise logs a warning (FAILSAFE corner still works via PyAutoGUI).
        """
        with self._lock:
            if self._listener_thread and self._listener_thread.is_alive():
                return True

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
            self._listener_stop.clear()

            def _run() -> None:
                current = set()
                target = set(combo)

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
                logger.info(
                    "Emergency stop hotkey listener started (%s)", self.emergency_hotkey
                )
                self._listener_stop.wait()
                listener.stop()
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
            thread.join(timeout=1.0)

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
