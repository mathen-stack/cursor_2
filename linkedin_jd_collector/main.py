"""
Application entrypoint for LinkedIn JD Collector Agent.

Boots PyQt6, opens the main window, and starts the event loop.
This file is the PyInstaller EXE entrypoint target.
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path


def _ensure_import_path() -> None:
    root = Path(__file__).resolve().parent
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))


def main() -> int:
    _ensure_import_path()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    from PyQt6.QtWidgets import QApplication

    from ui.main_window import MainWindow
    from ui.settings import load_settings

    app = QApplication(sys.argv)
    app.setApplicationName("LinkedIn JD Collector Agent")
    app.setOrganizationName("LinkedInJDCollector")

    settings = load_settings()
    window = MainWindow(settings=settings)
    window.show()
    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
