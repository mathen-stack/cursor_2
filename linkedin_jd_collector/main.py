"""
Application entrypoint for LinkedIn JD Collector Agent.

Boots PyQt6, opens the main window, and starts the event loop.
This file is the PyInstaller EXE entrypoint target.
"""

from __future__ import annotations

import logging
import sys
import traceback
from pathlib import Path


def _ensure_import_path() -> None:
    root = Path(__file__).resolve().parent
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))


def _install_crash_logging() -> Path | None:
    """
    Route uncaught exceptions + faulthandler to a user-writable log file.

    Windowed PyInstaller builds (`console=False`) hide stderr, so without this
    Start-Agent crashes look like the app simply closed.
    """
    try:
        import faulthandler

        from ui.paths import crash_log_path, log_dir

        log_dir()
        path = crash_log_path()
        mode = "a"
        if path.exists() and path.stat().st_size > 2_000_000:
            mode = "w"
        # Kept open for the process lifetime for faulthandler
        crash_fp = open(path, mode, encoding="utf-8")  # noqa: SIM115
        faulthandler.enable(file=crash_fp, all_threads=True)

        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s %(levelname)s %(name)s: %(message)s",
            handlers=[
                logging.FileHandler(path, encoding="utf-8"),
                logging.StreamHandler(sys.stderr),
            ],
            force=True,
        )
        logging.getLogger(__name__).info("Crash/log file: %s", path)
        return path
    except Exception:  # noqa: BLE001
        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        )
        logging.getLogger(__name__).exception("Failed to install crash logging")
        return None


def main() -> int:
    _ensure_import_path()
    crash_path = _install_crash_logging()

    from PyQt6.QtWidgets import QApplication, QMessageBox

    from ui.main_window import MainWindow
    from ui.settings import load_settings

    app = QApplication(sys.argv)
    app.setApplicationName("LinkedIn JD Collector Agent")
    app.setOrganizationName("LinkedInJDCollector")

    def _excepthook(exc_type, exc, tb) -> None:
        text = "".join(traceback.format_exception(exc_type, exc, tb))
        logging.getLogger(__name__).error("Uncaught exception:\n%s", text)
        try:
            QMessageBox.critical(
                None,
                "Unexpected Error",
                "The app hit an unexpected error and recovered.\n\n"
                f"{exc_type.__name__}: {exc}\n\n"
                + (
                    f"Details were written to:\n{crash_path}"
                    if crash_path
                    else "Check the log panel / crash log."
                ),
            )
        except Exception:  # noqa: BLE001
            sys.__excepthook__(exc_type, exc, tb)

    sys.excepthook = _excepthook

    # Background-thread Python exceptions (worker) — keep UI alive + log.
    import threading

    def _thread_excepthook(args) -> None:
        try:
            text = "".join(
                traceback.format_exception(args.exc_type, args.exc_value, args.exc_traceback)
            )
        except Exception:  # noqa: BLE001
            text = f"{getattr(args, 'exc_type', None)}: {getattr(args, 'exc_value', None)}"
        logging.getLogger(__name__).error(
            "Uncaught thread exception in %s:\n%s",
            getattr(args, "thread", None),
            text,
        )

    threading.excepthook = _thread_excepthook

    try:
        settings = load_settings()
        window = MainWindow(settings=settings)
        window.show()
        return app.exec()
    except Exception as exc:  # noqa: BLE001
        logging.getLogger(__name__).exception("Fatal startup error")
        try:
            QMessageBox.critical(
                None,
                "Startup Error",
                f"LinkedIn JD Collector Agent failed to start:\n\n{exc}",
            )
        except Exception:  # noqa: BLE001
            pass
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
