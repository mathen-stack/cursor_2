"""Tests for Documents/LinkedIn_JD file storage."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

from storage.file_manager import (
    FileManager,
    build_jd_filename,
    content_hash,
    job_signature,
)
from storage.history import HistoryStore, JobRecord


def test_build_jd_filename_company_title_date_time():
    when = datetime(2026, 8, 5, 14, 30, 22)
    name = build_jd_filename("Google", "Frontend Engineer", when=when)
    assert name == "Google_Frontend_Engineer_20260805_143022.txt"


def test_save_jd_writes_url_timestamp_and_raw_text(tmp_path: Path):
    fm = FileManager(tmp_path)
    history = HistoryStore.create(tmp_path)
    raw = "About the job\nBuild great UIs\n"
    saved = fm.save_jd(
        raw,
        company="Google",
        title="Frontend Engineer",
        url="https://www.linkedin.com/jobs/view/12345",
        timestamp=datetime(2026, 8, 5, 14, 30, 22),
        history=history,
    )
    assert saved.skipped_duplicate is False
    assert saved.path.name == "Google_Frontend_Engineer_20260805_143022.txt"
    body = saved.path.read_text(encoding="utf-8")
    assert body.startswith("URL: https://www.linkedin.com/jobs/view/12345\n")
    assert "Timestamp: " in body
    assert body.endswith(raw)
    # Raw JD body preserved exactly after header blank line
    assert "\n\n" + raw == body[body.index("\n\n") :]


def test_duplicate_skipped_by_url(tmp_path: Path):
    fm = FileManager(tmp_path)
    history = HistoryStore.create(tmp_path)
    raw = "Same JD body with enough characters for a realistic description."
    first = fm.save_jd(
        raw,
        company="Google",
        title="Frontend Engineer",
        url="https://www.linkedin.com/jobs/view/999",
        history=history,
    )
    history.mark_completed(
        JobRecord(
            signature=first.signature,
            title="Frontend Engineer",
            company="Google",
            page_index=1,
            path=str(first.path),
            saved_at=first.timestamp,
            url="https://www.linkedin.com/jobs/view/999",
            content_hash=first.content_hash,
        )
    )
    second = fm.save_jd(
        raw,
        company="Google",
        title="Frontend Engineer",
        url="https://www.linkedin.com/jobs/view/999?ref=share",
        history=history,
    )
    assert second.skipped_duplicate is True
    assert len(list(tmp_path.glob("*.txt"))) == 1


def test_same_text_different_urls_both_saved(tmp_path: Path):
    fm = FileManager(tmp_path)
    history = HistoryStore.create(tmp_path)
    raw = "Identical posting text across two distinct LinkedIn job URLs."
    a = fm.save_jd(
        raw,
        company="Google",
        title="FE",
        url="https://www.linkedin.com/jobs/view/1",
        history=history,
    )
    history.mark_completed(
        JobRecord(
            signature=a.signature,
            title="FE",
            company="Google",
            page_index=1,
            path=str(a.path),
            saved_at=a.timestamp,
            url="https://www.linkedin.com/jobs/view/1",
            content_hash=a.content_hash,
        )
    )
    b = fm.save_jd(
        raw,
        company="Google",
        title="FE",
        url="https://www.linkedin.com/jobs/view/2",
        history=history,
    )
    assert b.skipped_duplicate is False
    assert len(list(tmp_path.glob("*.txt"))) == 2


def test_job_signature_prefers_url():
    sig = job_signature(
        "Google",
        "FE",
        url="https://www.linkedin.com/jobs/view/1/?trk=x",
        text="body",
    )
    assert sig == "url:https://www.linkedin.com/jobs/view/1"


def test_content_hash_stable():
    assert content_hash("abc") == content_hash("abc")
    assert content_hash("abc") != content_hash("abcd")
