"""
Clipboard access (Pyperclip).
"""

from __future__ import annotations

import logging
import time
import uuid

logger = logging.getLogger(__name__)


class ClipboardService:
    """Read/write clipboard with optional change detection."""

    def __init__(self, backend=None) -> None:
        self._backend = backend

    @property
    def backend(self):
        if self._backend is None:
            import pyperclip

            self._backend = pyperclip
        return self._backend

    def read(self) -> str:
        try:
            value = self.backend.paste()
            return value if value is not None else ""
        except Exception as exc:  # noqa: BLE001
            logger.exception("Clipboard read failed")
            raise RuntimeError(f"Clipboard read failed: {exc}") from exc

    def write(self, text: str) -> None:
        try:
            self.backend.copy(text)
        except Exception as exc:  # noqa: BLE001
            logger.exception("Clipboard write failed")
            raise RuntimeError(f"Clipboard write failed: {exc}") from exc

    def prepare_sentinel(self) -> str:
        token = f"__jd_collector_sentinel_{uuid.uuid4().hex}__"
        self.write(token)
        return token

    def read_changed(self, before: str, *, settle_s: float = 0.1) -> str:
        if settle_s:
            time.sleep(settle_s)
        text = self.read()
        if text == before:
            logger.warning("Clipboard content unchanged after copy")
        return text
