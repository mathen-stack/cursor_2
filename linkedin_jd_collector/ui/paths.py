"""
Writable user-data paths for the frozen Windows EXE and source runs.

Settings/logs must never target the install directory (Program Files /
Local\\Programs), which is frequently read-only or AV-watched.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path


APP_DIR_NAME = "LinkedInJDCollector"


def is_frozen() -> bool:
    return bool(getattr(sys, "frozen", False)) or hasattr(sys, "_MEIPASS")


def user_data_dir() -> Path:
    """
    Resolve a per-user writable config/data directory.

    Windows: %LOCALAPPDATA%\\LinkedInJDCollector
    macOS:   ~/Library/Application Support/LinkedInJDCollector
    Linux:   $XDG_CONFIG_HOME/LinkedInJDCollector or ~/.config/...
    """
    if sys.platform.startswith("win"):
        base = os.environ.get("LOCALAPPDATA") or os.environ.get("APPDATA")
        if base:
            path = Path(base) / APP_DIR_NAME
        else:
            path = Path.home() / "AppData" / "Local" / APP_DIR_NAME
    elif sys.platform == "darwin":
        path = Path.home() / "Library" / "Application Support" / APP_DIR_NAME
    else:
        xdg = os.environ.get("XDG_CONFIG_HOME")
        path = Path(xdg) / APP_DIR_NAME if xdg else Path.home() / ".config" / APP_DIR_NAME
    path.mkdir(parents=True, exist_ok=True)
    return path.resolve()


def settings_path() -> Path:
    return user_data_dir() / "ui_settings.json"


def env_path() -> Path:
    """User-writable .env used by frozen builds; package .env for source runs."""
    if is_frozen():
        return user_data_dir() / ".env"
    return Path(__file__).resolve().parents[1] / ".env"


def log_dir() -> Path:
    path = user_data_dir() / "logs"
    path.mkdir(parents=True, exist_ok=True)
    return path


def crash_log_path() -> Path:
    return log_dir() / "crash.log"
