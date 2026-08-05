"""Tests for ClipboardService — exact text, change detection."""

from __future__ import annotations

import pytest

from automation.clipboard import ClipboardError, ClipboardService


class FakeClip:
    def __init__(self, text=""):
        self.text = text

    def paste(self):
        return self.text

    def copy(self, text):
        self.text = text


def test_read_returns_exact_text():
    raw = "About the job\nLine 2\n\n  keep spaces  "
    svc = ClipboardService(backend=FakeClip(raw), settle_s=0.0)
    assert svc.read() == raw


def test_read_after_copy_detects_change():
    clip = FakeClip("sentinel")
    svc = ClipboardService(backend=clip, settle_s=0.0, read_retries=2, retry_delay_s=0.0)
    previous = "sentinel"
    clip.text = "Original JD text exactly"
    assert svc.read_after_copy(previous=previous) == "Original JD text exactly"


def test_read_after_copy_fails_when_unchanged():
    clip = FakeClip("same")
    svc = ClipboardService(backend=clip, settle_s=0.0, read_retries=2, retry_delay_s=0.0)
    with pytest.raises(ClipboardError):
        svc.read_after_copy(previous="same", require_change=True)


def test_clear_with_sentinel():
    clip = FakeClip("old")
    svc = ClipboardService(backend=clip, settle_s=0.0)
    token = svc.clear_with_sentinel()
    assert clip.text == token
    assert token.startswith("__jd_collector_sentinel_")
