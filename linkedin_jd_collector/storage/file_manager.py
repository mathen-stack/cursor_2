"""
File storage for LinkedIn JD text files.

Default folder:
  Documents/LinkedIn_JD/

Filename pattern:
  Company_Title_Date_Time.txt

Example:
  Google_Frontend_Engineer_20260805_143022.txt

Each file stores:
  - URL (if available)
  - timestamp
  - raw JD text (exactly as copied; not summarized/parsed)
"""

from __future__ import annotations

import hashlib
import logging
import os
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    from storage.history import HistoryStore

logger = logging.getLogger(__name__)

DEFAULT_FOLDER_NAME = "LinkedIn_JD"


class DuplicateChecker(Protocol):
    def is_duplicate(
        self, *, signature: str, content_hash: str | None = None
    ) -> bool: ...


def windows_documents_dir() -> Path | None:
    """Resolve the real Windows Documents folder (incl. OneDrive redirect)."""
    if not sys.platform.startswith("win"):
        return None
    # 1) Shell CSIDL_PERSONAL (Documents), OneDrive-aware on modern Windows
    try:
        import ctypes
        from ctypes import wintypes

        CSIDL_PERSONAL = 5
        SHGFP_TYPE_CURRENT = 0
        buf = ctypes.create_unicode_buffer(wintypes.MAX_PATH)
        hr = ctypes.windll.shell32.SHGetFolderPathW(
            None, CSIDL_PERSONAL, None, SHGFP_TYPE_CURRENT, buf
        )
        if hr == 0 and buf.value:
            path = Path(buf.value)
            if path.exists():
                return path
    except Exception:  # noqa: BLE001
        logger.debug("SHGetFolderPathW Documents failed", exc_info=True)

    # 2) USERPROFILE\Documents
    for key in ("USERPROFILE", "HOME"):
        base = os.environ.get(key)
        if base:
            candidate = Path(base) / "Documents"
            if candidate.exists():
                return candidate
    # 3) Home fallback
    return Path.home() / "Documents"


def default_output_dir() -> Path:
    """
    Resolve Documents/LinkedIn_JD/.

    Uses OUTPUT_DIR from env when set; otherwise the real Documents folder
    (Windows Known Folder / OneDrive-aware) / LinkedIn_JD.
    """
    env = (os.getenv("OUTPUT_DIR") or "").strip()
    if env:
        return Path(env).expanduser().resolve()
    docs = windows_documents_dir()
    if docs is not None:
        return (docs / DEFAULT_FOLDER_NAME).resolve()
    return (Path.home() / "Documents" / DEFAULT_FOLDER_NAME).resolve()


def safe_filename_part(text: str, max_len: int = 80) -> str:
    """Sanitize a company/title fragment for Windows filenames."""
    cleaned = (text or "").strip()
    cleaned = cleaned.replace("&", " and ")
    cleaned = re.sub(r"[^\w\-]+", "_", cleaned, flags=re.UNICODE)
    cleaned = re.sub(r"_+", "_", cleaned).strip("._ ")
    if not cleaned:
        cleaned = "Unknown"
    return cleaned[:max_len]


def build_jd_filename(
    company: str,
    title: str,
    when: datetime | None = None,
) -> str:
    """
    Build Company_Title_Date_Time.txt

    Date = YYYYMMDD, Time = HHMMSS.
    """
    stamp = when or datetime.now().astimezone()
    date_part = stamp.strftime("%Y%m%d")
    time_part = stamp.strftime("%H%M%S")
    company_part = safe_filename_part(company)
    title_part = safe_filename_part(title)
    return f"{company_part}_{title_part}_{date_part}_{time_part}.txt"


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def job_signature(
    company: str,
    title: str,
    *,
    url: str | None = None,
    text: str | None = None,
) -> str:
    """
    Stable signature used for duplicate detection.

    Prefer URL when present; otherwise company|title|content_hash.
    """
    if url:
        normalized = url.strip().split("?")[0].rstrip("/").lower()
        if normalized:
            return f"url:{normalized}"
    company_l = (company or "").strip().lower()
    title_l = (title or "").strip().lower()
    digest = content_hash(text or "")[:16] if text else "nohash"
    return f"job:{company_l}|{title_l}|{digest}"


@dataclass
class SavedJobFile:
    path: Path
    signature: str
    bytes_written: int
    timestamp: str
    url: str | None
    content_hash: str
    skipped_duplicate: bool = False


class FileManager:
    """Persist raw JD text under Documents/LinkedIn_JD/."""

    def __init__(self, output_dir: str | Path | None = None) -> None:
        self.output_root = (
            Path(output_dir).expanduser().resolve()
            if output_dir is not None
            else default_output_dir()
        )
        # Alias used by workflow/history wiring
        self.run_dir = self.output_root
        self.jds_dir = self.output_root
        self.logs_dir = self.output_root / "logs"
        self._ensure_dirs()
        logger.info("JD storage directory: %s", self.output_root)

    def _ensure_dirs(self) -> None:
        self.output_root.mkdir(parents=True, exist_ok=True)
        self.logs_dir.mkdir(parents=True, exist_ok=True)

    def build_file_body(
        self,
        raw_jd_text: str,
        *,
        url: str | None = None,
        timestamp: datetime | None = None,
    ) -> str:
        """
        Compose file contents.

        Header metadata first, then a blank line, then the exact raw JD text.
        The JD body is not summarized, modified, or parsed.
        """
        ts = timestamp or datetime.now(timezone.utc)
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        url_value = url.strip() if url and url.strip() else ""
        return (
            f"URL: {url_value}\n"
            f"Timestamp: {ts.isoformat()}\n"
            f"\n"
            f"{raw_jd_text if raw_jd_text is not None else ''}"
        )

    def save_jd(
        self,
        text: str,
        *,
        title: str = "Job",
        company: str = "Company",
        url: str | None = None,
        signature: str | None = None,
        timestamp: datetime | None = None,
        history: DuplicateChecker | HistoryStore | None = None,
    ) -> SavedJobFile:
        """
        Save a JD TXT file. Skips writing when history reports a duplicate.
        """
        if text is None or not str(text).strip():
            raise ValueError("Refusing to save empty JD text")

        raw = str(text)  # exact clipboard text
        digest = content_hash(raw)
        when = timestamp or datetime.now().astimezone()
        ts_utc = when.astimezone(timezone.utc)
        sig = signature or job_signature(company, title, url=url, text=raw)

        if history is not None and history.is_duplicate(
            signature=sig, content_hash=digest
        ):
            logger.info("Duplicate JD skipped signature=%s hash=%s", sig, digest[:12])
            return SavedJobFile(
                path=self.output_root,
                signature=sig,
                bytes_written=0,
                timestamp=ts_utc.isoformat(),
                url=url,
                content_hash=digest,
                skipped_duplicate=True,
            )

        filename = build_jd_filename(company, title, when=when)
        path = self._unique_path(self.output_root / filename)
        body = self.build_file_body(raw, url=url, timestamp=ts_utc)

        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(body, encoding="utf-8", newline="\n")
        tmp.replace(path)

        if not path.exists() or path.stat().st_size <= 0:
            raise OSError(f"JD paste to Documents failed — file missing: {path}")

        logger.info(
            "PASTED JD to Documents file=%s path=%s chars=%s url=%s sig=%s",
            path.name,
            path,
            len(raw),
            bool(url),
            sig,
        )
        return SavedJobFile(
            path=path,
            signature=sig,
            bytes_written=len(body.encode("utf-8")),
            timestamp=ts_utc.isoformat(),
            url=url,
            content_hash=digest,
            skipped_duplicate=False,
        )

    def paste_jd_to_documents(
        self,
        text: str,
        *,
        title: str = "Job",
        company: str = "Company",
        url: str | None = None,
        signature: str | None = None,
        timestamp: datetime | None = None,
        history: DuplicateChecker | HistoryStore | None = None,
    ) -> SavedJobFile:
        """
        Paste a copied JD into Documents/LinkedIn_JD as a .txt file.

        Same as save_jd — named for the human copy→paste-to-Documents step.
        """
        self._ensure_dirs()
        return self.save_jd(
            text,
            title=title,
            company=company,
            url=url,
            signature=signature,
            timestamp=timestamp,
            history=history,
        )

    def _unique_path(self, path: Path) -> Path:
        """Avoid clobbering an existing file with the same timestamp name."""
        if not path.exists():
            return path
        stem = path.stem
        suffix = path.suffix
        for i in range(2, 1000):
            candidate = path.with_name(f"{stem}_{i}{suffix}")
            if not candidate.exists():
                return candidate
        raise RuntimeError(f"Could not allocate unique filename for {path}")
