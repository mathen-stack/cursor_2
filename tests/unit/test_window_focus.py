"""Unit tests for LinkedIn window-focus title filtering."""

from __future__ import annotations

from automation.window_focus import (
    DEFAULT_BOTTOM_STRIP_PX,
    _browser_rank,
    _is_linkedin_browser_title,
    _is_self_app_title,
    arrange_linkedin_above_bottom_strip,
    focus_linkedin_browser,
)


def test_rejects_collector_app_title():
    assert _is_self_app_title("LinkedIn JD Collector Agent v1.0.9")
    assert not _is_linkedin_browser_title("LinkedIn JD Collector Agent v1.0.9")
    assert not _is_linkedin_browser_title("LinkedInJDCollector")


def test_accepts_browser_linkedin_titles():
    assert _is_linkedin_browser_title("Jobs | LinkedIn - Google Chrome")
    assert _is_linkedin_browser_title("LinkedIn - Job search | Microsoft Edge")
    assert _is_linkedin_browser_title("Software Engineer | LinkedIn - Firefox")
    assert _is_linkedin_browser_title("Jobs | LinkedIn")


def test_browser_rank_prefers_chrome_over_generic():
    chrome = _browser_rank("Jobs | LinkedIn - Google Chrome")
    generic = _browser_rank("Jobs | LinkedIn")
    assert chrome > generic


def test_arrange_and_focus_are_noop_off_windows():
    # Linux/mac CI: helpers must fail soft without raising.
    assert DEFAULT_BOTTOM_STRIP_PX >= 160
    assert arrange_linkedin_above_bottom_strip() is False
    assert focus_linkedin_browser(force=True) is False
