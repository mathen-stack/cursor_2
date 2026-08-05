"""
Screenshot capture service (Pillow primary on Windows; mss optional).

Tracks scale/offset so AI image coordinates can be mapped back to screen
coordinates reliably (critical when images are resized for OpenRouter).
"""

from __future__ import annotations

import io
import logging
import os
import sys
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
    # screen = offset + image_coord * scale
    scale_x: float = 1.0
    scale_y: float = 1.0
    offset_left: int = 0
    offset_top: int = 0
    source_width: int = 0
    source_height: int = 0

    def to_screen(self, x: int, y: int) -> tuple[int, int]:
        """Map screenshot-relative coordinates to absolute screen pixels."""
        sx = int(round(self.offset_left + float(x) * self.scale_x))
        sy = int(round(self.offset_top + float(y) * self.scale_y))
        return sx, sy

    def to_screen_region(
        self, x1: int, y1: int, x2: int, y2: int
    ) -> tuple[int, int, int, int]:
        a = self.to_screen(x1, y1)
        b = self.to_screen(x2, y2)
        return a[0], a[1], b[0], b[1]


def _prefer_pil() -> bool:
    """mss has caused Windows access-violation crashes in frozen EXEs."""
    if os.getenv("USE_MSS", "").strip().lower() in {"1", "true", "yes"}:
        return False
    backend = os.getenv("SCREENSHOT_BACKEND", "").strip().lower()
    if backend in {"mss", "mssgrab"}:
        return False
    if backend in {"pil", "pillow", "imagegrab"}:
        return True
    # Default: PIL on Windows, mss elsewhere (tests often inject a grabber).
    return sys.platform.startswith("win")


class ScreenshotService:
    """Capture the screen (or a region) as PNG bytes for the vision agent."""

    def __init__(
        self,
        grabber: ScreenGrabber | None = None,
        *,
        max_width: int | None = 1280,
    ) -> None:
        self._grabber = grabber
        self._owns_grabber = grabber is None
        self.max_width = max_width
        self.last: ScreenshotResult | None = None

    def _get_grabber(self) -> ScreenGrabber:
        if self._grabber is None:
            import mss

            logger.info("Initializing mss screenshot grabber…")
            self._grabber = mss.mss()
        return self._grabber

    def _capture_with_pil(
        self, region: dict[str, int] | None, limit: int | None
    ) -> ScreenshotResult:
        """Stable Windows capture path (GDI via Pillow)."""
        from PIL import ImageGrab

        logger.info("Capturing screenshot via PIL ImageGrab")
        if region is None:
            # all_screens=True includes virtual desktop when available
            try:
                img = ImageGrab.grab(all_screens=True)
            except TypeError:
                img = ImageGrab.grab()
            offset_left = 0
            offset_top = 0
        else:
            left = int(region.get("left", 0))
            top = int(region.get("top", 0))
            width = int(region.get("width", 0))
            height = int(region.get("height", 0))
            img = ImageGrab.grab(bbox=(left, top, left + width, top + height))
            offset_left = left
            offset_top = top
        if img.mode != "RGB":
            img = img.convert("RGB")
        return self._finalize_image(img, offset_left, offset_top, limit)

    def _capture_with_mss(
        self, region: dict[str, int] | None, limit: int | None
    ) -> ScreenshotResult:
        from PIL import Image

        grabber = self._get_grabber()
        offset_left = 0
        offset_top = 0
        if region is None:
            monitor = grabber.monitors[0] if hasattr(grabber, "monitors") else None
            if monitor is not None:
                offset_left = int(monitor.get("left", 0))
                offset_top = int(monitor.get("top", 0))
                shot = grabber.grab(monitor)
            else:
                shot = grabber.grab()
        else:
            offset_left = int(region.get("left", 0))
            offset_top = int(region.get("top", 0))
            shot = grabber.grab(region)

        img = Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")
        return self._finalize_image(img, offset_left, offset_top, limit)

    def _finalize_image(
        self,
        img,
        offset_left: int,
        offset_top: int,
        limit: int | None,
    ) -> ScreenshotResult:
        from PIL import Image

        source_w, source_h = img.width, img.height
        scale_x = 1.0
        scale_y = 1.0

        if limit and img.width > limit:
            ratio = limit / float(img.width)
            new_w = limit
            new_h = max(1, int(img.height * ratio))
            img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
            scale_x = source_w / float(new_w)
            scale_y = source_h / float(new_h)

        buf = io.BytesIO()
        img.save(buf, format="PNG", optimize=True)
        data = buf.getvalue()
        result = ScreenshotResult(
            image_bytes=data,
            width=img.width,
            height=img.height,
            scale_x=scale_x,
            scale_y=scale_y,
            offset_left=offset_left,
            offset_top=offset_top,
            source_width=source_w,
            source_height=source_h,
        )
        self.last = result
        logger.info(
            "Screenshot captured img=%sx%s source=%sx%s scale=%.3fx%.3f bytes=%s",
            img.width,
            img.height,
            source_w,
            source_h,
            scale_x,
            scale_y,
            len(data),
        )
        return result

    def capture(
        self,
        region: dict[str, int] | None = None,
        *,
        max_width: int | None = None,
    ) -> ScreenshotResult:
        """
        Capture a screenshot.

        region: optional mss-style dict {left, top, width, height}
        """
        limit = self.max_width if max_width is None else max_width

        # Injected grabber (unit/integration tests) always wins.
        if self._grabber is not None:
            return self._capture_with_mss(region, limit)

        prefer_pil = _prefer_pil()
        errors: list[str] = []

        if prefer_pil:
            try:
                return self._capture_with_pil(region, limit)
            except Exception as exc:  # noqa: BLE001
                errors.append(f"pil:{exc}")
                logger.exception("PIL screenshot failed; trying mss")
                try:
                    return self._capture_with_mss(region, limit)
                except Exception as exc2:  # noqa: BLE001
                    errors.append(f"mss:{exc2}")
                    raise RuntimeError(
                        "Screenshot capture failed: " + "; ".join(errors)
                    ) from exc2

        try:
            return self._capture_with_mss(region, limit)
        except Exception as exc:  # noqa: BLE001
            errors.append(f"mss:{exc}")
            logger.exception("mss screenshot failed; trying PIL")
            try:
                return self._capture_with_pil(region, limit)
            except Exception as exc2:  # noqa: BLE001
                errors.append(f"pil:{exc2}")
                raise RuntimeError(
                    "Screenshot capture failed: " + "; ".join(errors)
                ) from exc2

    def to_screen(self, x: int, y: int) -> tuple[int, int]:
        if self.last is None:
            logger.warning("No screenshot transform yet; using raw coordinates")
            return int(x), int(y)
        return self.last.to_screen(x, y)

    def to_screen_region(
        self, x1: int, y1: int, x2: int, y2: int
    ) -> tuple[int, int, int, int]:
        if self.last is None:
            return int(x1), int(y1), int(x2), int(y2)
        return self.last.to_screen_region(x1, y1, x2, y2)

    def close(self) -> None:
        if self._owns_grabber and self._grabber is not None:
            try:
                self._grabber.close()
            except Exception:  # noqa: BLE001
                logger.debug("Screenshot grabber close failed", exc_info=True)
            self._grabber = None
