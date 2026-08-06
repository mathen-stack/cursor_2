"""
OS-specific process hardening for the frozen Windows EXE.

Null-pointer access violations during screenshot/automation are often caused by
missing DPI awareness or unstable capture backends (mss) on Windows.
"""

from __future__ import annotations

import logging
import os
import sys

logger = logging.getLogger(__name__)


def harden_windows_process(*, role: str = "ui") -> None:
    """
    Call as early as possible in both UI and --agent-worker processes.

    - Per-monitor DPI awareness (avoids bad screen metrics / capture crashes)
    - Prefer software OpenGL for the Qt UI process
    - Prefer PIL capture over mss (mss is opt-in via USE_MSS=1)
    """
    if not sys.platform.startswith("win"):
        return

    # Capture backend preference for ScreenshotService
    os.environ.setdefault("SCREENSHOT_BACKEND", "pil")
    # Avoid accidental mss use unless explicitly requested
    if os.getenv("USE_MSS", "").strip() not in {"1", "true", "yes"}:
        os.environ.setdefault("USE_MSS", "0")

    if role == "ui":
        os.environ.setdefault("QT_OPENGL", "software")
        os.environ.setdefault("QT_ENABLE_HIGHDPI_SCALING", "1")

    try:
        import ctypes

        # PROCESS_PER_MONITOR_DPI_AWARE = 2 (Windows 8.1+)
        try:
            ctypes.windll.shcore.SetProcessDpiAwareness(2)
            logger.info("Windows DPI awareness set (per-monitor) role=%s", role)
        except Exception:  # noqa: BLE001
            try:
                ctypes.windll.user32.SetProcessDPIAware()
                logger.info("Windows DPI awareness set (system) role=%s", role)
            except Exception:  # noqa: BLE001
                logger.debug("Could not set DPI awareness", exc_info=True)
    except Exception:  # noqa: BLE001
        logger.debug("Windows harden skipped", exc_info=True)
