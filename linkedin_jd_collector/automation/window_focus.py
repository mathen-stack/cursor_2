"""
Lightweight Win32 window focus helper (ctypes only — no pywinauto).

Used so automation clicks hit the LinkedIn browser instead of this app's UI.
Critical: must NEVER focus the Collector window itself (its title contains
"LinkedIn"), or clicks can land on our Close button and "turn the app off".
"""

from __future__ import annotations

import logging
import sys
import time
from typing import Callable

logger = logging.getLogger(__name__)

# Titles that belong to this app — never treat as the LinkedIn browser.
_SELF_TITLE_MARKERS = (
    "jd collector",
    "linkedin jd collector",
    "linkedinjdcollector",
)

_BROWSER_TOKENS = (
    "chrome",
    "edge",
    "firefox",
    "brave",
    "opera",
    "vivaldi",
    "chromium",
)

_last_focus_monotonic: float = 0.0


def _is_self_app_title(title: str) -> bool:
    low = (title or "").lower()
    return any(marker in low for marker in _SELF_TITLE_MARKERS)


def _is_linkedin_browser_title(title: str) -> bool:
    """True for LinkedIn-in-browser windows; false for this Collector app."""
    low = (title or "").lower()
    if not low or "linkedin" not in low:
        return False
    if _is_self_app_title(low):
        return False
    # Prefer clear browser windows; also accept Jobs | LinkedIn style titles.
    if any(token in low for token in _BROWSER_TOKENS):
        return True
    if "jobs" in low:
        return True
    # Generic LinkedIn tab title without browser suffix (some setups).
    return True


def _browser_rank(title: str) -> int:
    """Higher is better when choosing among matches."""
    low = (title or "").lower()
    score = 0
    if any(token in low for token in _BROWSER_TOKENS):
        score += 10
    if "jobs" in low:
        score += 5
    if "linkedin" in low:
        score += 1
    return score


def focus_linkedin_browser(*, force: bool = False, min_interval_s: float = 1.25) -> bool:
    """Bring a LinkedIn browser window to the foreground. Windows-only."""
    global _last_focus_monotonic
    if not sys.platform.startswith("win"):
        return False

    now = time.monotonic()
    if not force and (now - _last_focus_monotonic) < min_interval_s:
        return True

    try:
        import ctypes
        from ctypes import wintypes
    except Exception:  # noqa: BLE001
        return False

    user32 = ctypes.windll.user32
    EnumWindows = user32.EnumWindows
    IsWindowVisible = user32.IsWindowVisible
    GetWindowTextW = user32.GetWindowTextW
    GetWindowTextLengthW = user32.GetWindowTextLengthW
    SetForegroundWindow = user32.SetForegroundWindow
    ShowWindow = user32.ShowWindow
    BringWindowToTop = user32.BringWindowToTop
    GetForegroundWindow = user32.GetForegroundWindow
    GetWindowThreadProcessId = user32.GetWindowThreadProcessId
    AttachThreadInput = user32.AttachThreadInput
    AllowSetForegroundWindow = getattr(user32, "AllowSetForegroundWindow", None)

    SW_RESTORE = 9
    EnumWindowsProc = ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)

    matches: list[tuple[int, str, int]] = []

    def _title(hwnd: int) -> str:
        length = GetWindowTextLengthW(hwnd)
        if length <= 0:
            return ""
        buf = ctypes.create_unicode_buffer(length + 1)
        GetWindowTextW(hwnd, buf, length + 1)
        return buf.value or ""

    def _enum(hwnd: int, _lparam: int) -> bool:
        try:
            if not IsWindowVisible(hwnd):
                return True
            title = _title(hwnd)
            if _is_linkedin_browser_title(title):
                matches.append((int(hwnd), title, _browser_rank(title)))
        except Exception:  # noqa: BLE001
            pass
        return True

    try:
        EnumWindows(EnumWindowsProc(_enum), 0)
    except Exception:  # noqa: BLE001
        logger.exception("EnumWindows failed")
        return False

    if not matches:
        logger.warning("No LinkedIn browser window found to focus")
        return False

    matches.sort(key=lambda item: item[2], reverse=True)
    hwnd, title, _rank = matches[0]

    try:
        if AllowSetForegroundWindow is not None:
            try:
                AllowSetForegroundWindow(-1)  # ASFW_ANY
            except Exception:  # noqa: BLE001
                pass

        ShowWindow(hwnd, SW_RESTORE)
        BringWindowToTop(hwnd)

        # AttachThreadInput helps when Windows blocks SetForegroundWindow.
        fg = GetForegroundWindow()
        pid = wintypes.DWORD()
        fg_tid = GetWindowThreadProcessId(fg, ctypes.byref(pid)) if fg else 0
        target_tid = GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        attached = False
        if fg_tid and target_tid and fg_tid != target_tid:
            attached = bool(AttachThreadInput(fg_tid, target_tid, True))
        try:
            SetForegroundWindow(hwnd)
        finally:
            if attached:
                AttachThreadInput(fg_tid, target_tid, False)

        _last_focus_monotonic = time.monotonic()
        logger.info("Focused LinkedIn browser hwnd=%s title=%r", hwnd, title)
        return True
    except Exception:  # noqa: BLE001
        logger.exception("SetForegroundWindow failed")
        return False


def focus_before(action: Callable[[], None]) -> None:
    """Best-effort focus LinkedIn, then run action."""
    try:
        focus_linkedin_browser()
    except Exception:  # noqa: BLE001
        logger.debug("focus_linkedin_browser failed", exc_info=True)
    action()
