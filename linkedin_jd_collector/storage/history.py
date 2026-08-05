"""
Completed-job history / duplicate tracking for Documents/LinkedIn_JD.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)

HISTORY_FILENAME = "history.jsonl"


@dataclass
class JobRecord:
    signature: str
    title: str
    company: str
    page_index: int
    path: str
    saved_at: str
    url: str | None = None
    content_hash: str | None = None


@dataclass
class HistoryStore:
    """
    Track completed jobs to avoid duplicate saving.

    Persists under Documents/LinkedIn_JD/history.jsonl (or the configured
    output root).
    """

    index_path: Path
    completed: set[str] = field(default_factory=set)
    content_hashes: set[str] = field(default_factory=set)
    records: list[JobRecord] = field(default_factory=list)

    @classmethod
    def create(cls, storage_dir: Path) -> HistoryStore:
        storage_dir.mkdir(parents=True, exist_ok=True)
        path = storage_dir / HISTORY_FILENAME
        store = cls(index_path=path)
        if path.exists():
            store._load()
        return store

    def _load(self) -> None:
        for line in self.index_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
            except json.JSONDecodeError:
                logger.warning("Skipping bad history line: %s", line[:120])
                continue
            sig = str(data.get("signature", ""))
            if sig:
                self.completed.add(sig)
            digest = data.get("content_hash")
            if digest:
                self.content_hashes.add(str(digest))

    def is_completed(self, signature: str) -> bool:
        return signature in self.completed

    def has_content_hash(self, digest: str) -> bool:
        return digest in self.content_hashes

    def is_duplicate(
        self,
        *,
        signature: str,
        content_hash: str | None = None,
    ) -> bool:
        if signature in self.completed:
            return True
        # Content-hash dedupe only when we lack a stable URL identity.
        # Different LinkedIn job URLs with identical JD text must still save.
        if (
            content_hash
            and not str(signature).startswith("url:")
            and content_hash in self.content_hashes
        ):
            return True
        return False

    def mark_completed(self, record: JobRecord) -> None:
        self.completed.add(record.signature)
        self.records.append(record)
        if record.content_hash:
            self.content_hashes.add(record.content_hash)
        with self.index_path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(record.__dict__, ensure_ascii=False) + "\n")
        logger.info(
            "Marked completed sig=%s total=%s path=%s",
            record.signature,
            len(self.completed),
            record.path,
        )

    def to_context(self) -> str:
        recent = list(self.completed)[-20:]
        return "completed_signatures=" + ",".join(recent)
