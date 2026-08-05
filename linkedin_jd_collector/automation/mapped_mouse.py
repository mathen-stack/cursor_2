"""
Mouse wrapper that maps screenshot coordinates to screen coordinates.
"""

from __future__ import annotations

import logging
from typing import Protocol

logger = logging.getLogger(__name__)


class ScreenMapper(Protocol):
    def to_screen(self, x: int, y: int) -> tuple[int, int]: ...
    def to_screen_region(
        self, x1: int, y1: int, x2: int, y2: int
    ) -> tuple[int, int, int, int]: ...


class MappedMouse:
    """Delegate mouse ops after mapping AI/image coords → screen coords."""

    def __init__(self, mouse, mapper: ScreenMapper) -> None:
        self._mouse = mouse
        self._mapper = mapper

    def move(self, x: int, y: int, *, duration: float | None = None) -> tuple[int, int]:
        sx, sy = self._mapper.to_screen(x, y)
        logger.debug("map move (%s,%s) -> (%s,%s)", x, y, sx, sy)
        return self._mouse.move(sx, sy, duration=duration)

    def click(self, x: int | None = None, y: int | None = None, *, button: str = "left"):
        if x is not None and y is not None:
            sx, sy = self._mapper.to_screen(x, y)
            return self._mouse.click(sx, sy, button=button)
        return self._mouse.click(button=button)

    def double_click(
        self, x: int | None = None, y: int | None = None, *, button: str = "left"
    ):
        if x is not None and y is not None:
            sx, sy = self._mapper.to_screen(x, y)
            return self._mouse.double_click(sx, sy, button=button)
        return self._mouse.double_click(button=button)

    def scroll(
        self,
        amount: int = -3,
        x: int | None = None,
        y: int | None = None,
        *,
        dy: int | None = None,
    ):
        if x is not None and y is not None:
            sx, sy = self._mapper.to_screen(x, y)
            return self._mouse.scroll(amount, sx, sy, dy=dy)
        return self._mouse.scroll(amount, dy=dy)

    def select_text(self, x1: int, y1: int, x2: int, y2: int, *, duration: float = 0.25):
        sx1, sy1, sx2, sy2 = self._mapper.to_screen_region(x1, y1, x2, y2)
        logger.debug(
            "map select (%s,%s,%s,%s) -> (%s,%s,%s,%s)",
            x1,
            y1,
            x2,
            y2,
            sx1,
            sy1,
            sx2,
            sy2,
        )
        return self._mouse.select_text(sx1, sy1, sx2, sy2, duration=duration)
