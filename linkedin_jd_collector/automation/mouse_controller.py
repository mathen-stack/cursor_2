"""
Mouse control via PyAutoGUI.

Provides move/click/double-click/scroll/select_text with safety delay,
emergency-stop checks, logging, and failure handling.
"""

from __future__ import annotations

import logging
from typing import Any, Protocol

from .safety import (
    AutomationError,
    AutomationGuard,
    EmergencyStopError,
    default_guard,
)

logger = logging.getLogger(__name__)


class MouseBackend(Protocol):
    FAILSAFE: bool
    PAUSE: float

    def size(self) -> tuple[int, int]: ...
    def position(self) -> tuple[int, int]: ...
    def moveTo(self, x: int, y: int, duration: float = 0.0) -> None: ...
    def click(
        self,
        x: int | None = None,
        y: int | None = None,
        clicks: int = 1,
        interval: float = 0.0,
        button: str = "left",
    ) -> None: ...
    def doubleClick(
        self,
        x: int | None = None,
        y: int | None = None,
        button: str = "left",
    ) -> None: ...
    def scroll(self, clicks: int, x: int | None = None, y: int | None = None) -> None: ...
    def dragTo(
        self,
        x: int,
        y: int,
        duration: float = 0.0,
        button: str = "left",
    ) -> None: ...
    def mouseDown(
        self,
        x: int | None = None,
        y: int | None = None,
        button: str = "left",
    ) -> None: ...
    def mouseUp(
        self,
        x: int | None = None,
        y: int | None = None,
        button: str = "left",
    ) -> None: ...


def _load_pyautogui() -> MouseBackend:
    logger.info("Loading pyautogui mouse backend…")
    import pyautogui

    # Corner failsafe: slamming mouse into a screen corner aborts PyAutoGUI.
    # Keep enabled, but never call size()/position() during import — that has
    # faulted on some Windows DPI setups inside frozen EXEs.
    pyautogui.FAILSAFE = True
    # Prefer our explicit safety delay over PyAutoGUI's global PAUSE.
    pyautogui.PAUSE = 0
    logger.info("pyautogui mouse backend loaded failsafe=%s", pyautogui.FAILSAFE)
    return pyautogui


class MouseController:
    """High-level mouse automation API."""

    def __init__(
        self,
        guard: AutomationGuard | None = None,
        backend: MouseBackend | None = None,
        *,
        move_duration_s: float = 0.15,
        lazy_backend: bool = True,
    ) -> None:
        self.guard = guard or default_guard
        # Lazy-load by default: importing pyautogui during workflow construction
        # has hard-crashed some Windows EXE sessions before any UI event fires.
        self._backend = backend
        self._lazy_backend = lazy_backend and backend is None
        self.move_duration_s = max(0.0, move_duration_s)
        if not self._lazy_backend and self._backend is None:
            self._backend = _load_pyautogui()
        logger.info(
            "MouseController created safety_delay=%.3fs lazy_backend=%s",
            self.guard.safety_delay_s,
            self._lazy_backend,
        )

    @property
    def backend(self) -> MouseBackend:
        if self._backend is None:
            try:
                self._backend = _load_pyautogui()
            except Exception as exc:  # noqa: BLE001
                raise AutomationError(f"Failed to load mouse backend: {exc}") from exc
        return self._backend

    def _clamp(self, x: int, y: int) -> tuple[int, int]:
        try:
            width, height = self.backend.size()
        except Exception:  # noqa: BLE001
            return int(x), int(y)
        cx = max(0, min(int(x), max(0, width - 1)))
        cy = max(0, min(int(y), max(0, height - 1)))
        if (cx, cy) != (int(x), int(y)):
            logger.warning(
                "Clamped coordinates from (%s,%s) to (%s,%s) screen=%sx%s",
                x,
                y,
                cx,
                cy,
                width,
                height,
            )
        return cx, cy

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
            # PyAutoGUI raises FailSafeException when corner-triggered
            name = type(exc).__name__
            if "FailSafe" in name:
                self.guard.trigger_emergency_stop("PyAutoGUI FAILSAFE (screen corner)")
                raise EmergencyStopError(str(exc)) from exc
            logger.exception("ACTION failed: %s (%s)", action_name, exc)
            raise AutomationError(f"{action_name} failed: {exc}") from exc

    def move(self, x: int, y: int, *, duration: float | None = None) -> tuple[int, int]:
        """Move mouse pointer to screen coordinates (x, y)."""
        cx, cy = self._clamp(x, y)
        dur = self.move_duration_s if duration is None else max(0.0, duration)

        def _do() -> tuple[int, int]:
            logger.info("move -> (%s, %s) duration=%.3fs", cx, cy, dur)
            self.backend.moveTo(cx, cy, duration=dur)
            return cx, cy

        return self._run(f"move({cx},{cy})", _do)

    def click(
        self,
        x: int | None = None,
        y: int | None = None,
        *,
        button: str = "left",
        clicks: int = 1,
    ) -> None:
        """Click at (x,y) or current position."""

        def _do() -> None:
            if x is not None and y is not None:
                cx, cy = self._clamp(x, y)
                logger.info("click %s at (%s, %s) clicks=%s", button, cx, cy, clicks)
                self.backend.click(cx, cy, clicks=clicks, button=button)
            else:
                pos = self.backend.position()
                logger.info("click %s at current %s clicks=%s", button, pos, clicks)
                self.backend.click(clicks=clicks, button=button)

        label = f"click({x},{y})" if x is not None else "click()"
        self._run(label, _do)

    def double_click(
        self,
        x: int | None = None,
        y: int | None = None,
        *,
        button: str = "left",
    ) -> None:
        """Double-click at (x,y) or current position."""

        def _do() -> None:
            if x is not None and y is not None:
                cx, cy = self._clamp(x, y)
                logger.info("double_click %s at (%s, %s)", button, cx, cy)
                self.backend.doubleClick(cx, cy, button=button)
            else:
                logger.info("double_click %s at current %s", button, self.backend.position())
                self.backend.doubleClick(button=button)

        label = f"double_click({x},{y})" if x is not None else "double_click()"
        self._run(label, _do)

    def scroll(
        self,
        amount: int = -3,
        x: int | None = None,
        y: int | None = None,
        *,
        dy: int | None = None,
    ) -> None:
        """
        Scroll the mouse wheel.

        Positive amount scrolls up; negative scrolls down.
        `dy` is accepted as an alias used by vision actions (mapped to amount).
        """
        delta = int(dy) if dy is not None else int(amount)

        def _do() -> None:
            if x is not None and y is not None:
                cx, cy = self._clamp(x, y)
                logger.info("scroll delta=%s at (%s, %s)", delta, cx, cy)
                self.backend.scroll(delta, cx, cy)
            else:
                logger.info("scroll delta=%s at current %s", delta, self.backend.position())
                self.backend.scroll(delta)

        self._run(f"scroll({delta})", _do)

    def select_text(
        self,
        x1: int,
        y1: int,
        x2: int,
        y2: int,
        *,
        duration: float = 0.25,
    ) -> None:
        """
        Drag-select text from (x1,y1) to (x2,y2).

        Used to highlight the About the job region before copy().
        """
        a = self._clamp(x1, y1)
        b = self._clamp(x2, y2)
        dur = max(0.0, duration)

        def _do() -> None:
            logger.info("select_text from %s to %s duration=%.3fs", a, b, dur)
            self.backend.moveTo(a[0], a[1], duration=min(dur, self.move_duration_s))
            self.backend.mouseDown(button="left")
            try:
                self.backend.dragTo(b[0], b[1], duration=dur, button="left")
            finally:
                self.backend.mouseUp(button="left")

        self._run(f"select_text({a}->{b})", _do)


# Module-level convenience functions using a shared controller instance.
_default_mouse: MouseController | None = None


def _mouse() -> MouseController:
    global _default_mouse
    if _default_mouse is None:
        _default_mouse = MouseController()
    return _default_mouse


def move(x: int, y: int, *, duration: float | None = None) -> tuple[int, int]:
    return _mouse().move(x, y, duration=duration)


def click(x: int | None = None, y: int | None = None, *, button: str = "left") -> None:
    _mouse().click(x, y, button=button)


def double_click(
    x: int | None = None, y: int | None = None, *, button: str = "left"
) -> None:
    _mouse().double_click(x, y, button=button)


def scroll(
    amount: int = -3,
    x: int | None = None,
    y: int | None = None,
    *,
    dy: int | None = None,
) -> None:
    _mouse().scroll(amount, x, y, dy=dy)


def select_text(x1: int, y1: int, x2: int, y2: int, *, duration: float = 0.25) -> None:
    _mouse().select_text(x1, y1, x2, y2, duration=duration)
