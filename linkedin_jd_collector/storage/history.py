"""
Completed-job history / index tracking.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class JobRecord:
    signature: str
    title: str
    company: str
    page_index: int
    path: str
    saved_at: str


@dataclass
class HistoryStore:
    """Track completed jobs to avoid duplicates within/across a run."""

    index_path: Path
    completed: set[str] = field(default_factory=set)
    records: list[JobRecord] = field(default_factory=list)

    @classmethod
    def create(cls, run_dir: Path) -> HistoryStore:
        path = run_dir / "index.jsonl"
        path.parent.mkdir(parents=True, exist_ok=True)
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
                sig = str(data.get("signature", ""))
                if sig:
                    self.completed.add(sig)
            except json.JSONDecodeError:
                logger.warning("Skipping bad index line: %s", line[:120])

    def is_completed(self, signature: str) -> bool:
        return signature in self.completed

    def mark_completed(self, record: JobRecord) -> None:
        self.completed.add(record.signature)
        self.records.append(record)
        with self.index_path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(record.__dict__, ensure_ascii=False) + "\n")
        logger.info("Marked completed sig=%s total=%s", record.signature, len(self.completed))

    def to_context(self) -> str:
        recent = list(self.completed)[-20:]
        return "completed_signatures=" + ",".join(recent)
