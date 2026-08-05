"""
File/folder manager for JD outputs.
"""

from __future__ import annotations

import logging
import re
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)


def _safe_name(text: str, max_len: int = 60) -> str:
    cleaned = re.sub(r"[^\w\-]+", "_", text.strip(), flags=re.UNICODE)
    cleaned = re.sub(r"_+", "_", cleaned).strip("_")
    if not cleaned:
        cleaned = "job"
    return cleaned[:max_len]


@dataclass
class SavedJobFile:
    path: Path
    signature: str
    bytes_written: int


class FileManager:
    """Create run folders and save raw JD TXT files."""

    def __init__(self, output_dir: str | Path) -> None:
        self.output_root = Path(output_dir).expanduser().resolve()
        stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H%M%S")
        self.run_dir = self.output_root / "runs" / stamp
        self.jds_dir = self.run_dir / "jds"
        self.logs_dir = self.run_dir / "logs"
        self._counter = 0
        self._ensure_dirs()
        self._write_manifest_start()

    def _ensure_dirs(self) -> None:
        self.jds_dir.mkdir(parents=True, exist_ok=True)
        self.logs_dir.mkdir(parents=True, exist_ok=True)
        logger.info("Run output directory: %s", self.run_dir)

    def _write_manifest_start(self) -> None:
        manifest = {
            "started_at": datetime.now(timezone.utc).isoformat(),
            "output_root": str(self.output_root),
        }
        (self.run_dir / "manifest.json").write_text(
            json.dumps(manifest, indent=2), encoding="utf-8"
        )

    def save_jd(
        self,
        text: str,
        *,
        title: str = "job",
        company: str = "company",
        signature: str | None = None,
    ) -> SavedJobFile:
        if text is None or not str(text).strip():
            raise ValueError("Refusing to save empty JD text")

        self._counter += 1
        sig = signature or f"{title}|{company}|{self._counter}"
        filename = f"{self._counter:03d}_{_safe_name(title)}_{_safe_name(company)}.txt"
        path = self.jds_dir / filename

        # Atomic-ish write
        tmp = path.with_suffix(".txt.tmp")
        raw = str(text)
        tmp.write_text(raw, encoding="utf-8")
        tmp.replace(path)

        logger.info("Saved JD file=%s chars=%s sig=%s", path.name, len(raw), sig)
        return SavedJobFile(path=path, signature=sig, bytes_written=len(raw.encode("utf-8")))
