"""
Screenshot capture service (MSS + Pillow).
"""

from __future__ import annotations

import io
import logging
from dataclasses import dataclass
from typing import Protocol

logger = logging.getLogger(__name__)


class ScreenGrabber(Protocol):
    def grab(self, region: dict[str, int] | None = None): ...
    def close(self) -> None: ...


@dataclass
class ScreenshotResult:
    image_bytes: bytes
    width: int
    height: int
    mime_type: str = "image/png"


class ScreenshotService:
    """Capture the screen (or a region) as PNG bytes for the vision agent."""

    def __init__(self, grabber: ScreenGrabber | None = None) -> None:
        self._grabber = grabber
        self._owns_grabber = grabber is None

    def _get_grabber(self) -> ScreenGrabber:
        if self._grabber is None:
            import mss

            self._grabber = mss.mss()
        return self._grabber

    def capture(
        self,
        region: dict[str, int] | None = None,
        *,
        max_width: int | None = 1600,
    ) -> ScreenshotResult:
        """
        Capture a screenshot.

        region: optional mss-style dict {left, top, width, height}
        """
        from PIL import Image

        grabber = self._get_grabber()
        try:
            if region is None:
                # monitor 0 is virtual desktop spanning all displays on Windows
                monitor = grabber.monitors[0] if hasattr(grabber, "monitors") else None
                shot = grabber.grab(monitor) if monitor is not None else grabber.grab()
            else:
                shot = grabber.grab(region)

            img = Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")
            if max_width and img.width > max_width:
                ratio = max_width / float(img.width)
                img = img.resize(
                    (max_width, max(1, int(img.height * ratio))),
                    Image.Resampling.LANCZOS,
                )

            buf = io.BytesIO()
            img.save(buf, format="PNG", optimize=True)
            data = buf.getvalue()
            logger.info(
                "Screenshot captured %sx%s bytes=%s", img.width, img.height, len(data)
            )
            return ScreenshotResult(
                image_bytes=data, width=img.width, height=img.height
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("Screenshot capture failed")
            raise RuntimeError(f"Screenshot capture failed: {exc}") from exc

    def close(self) -> None:
        if self._owns_grabber and self._grabber is not None:
            try:
                self._grabber.close()
            except Exception:  # noqa: BLE001
                logger.debug("Screenshot grabber close failed", exc_info=True)
            self._grabber = None
