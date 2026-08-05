"""
Clipboard reader/writer (Pyperclip).

Used after Ctrl+C to obtain the original LinkedIn JD text.
Returns clipboard contents exactly as provided by the OS — no summarize,
modify, or parse.
"""

from __future__ import annotations

import logging
import time
import uuid
from typing import Protocol

logger = logging.getLogger(__name__)


class ClipboardBackend(Protocol):
    def paste(self) -> str: ...
    def copy(self, text: str) -> None: ...


class ClipboardError(RuntimeError):
    """Raised when clipboard access fails."""


class ClipboardService:
    """
    Thin clipboard wrapper.

    Responsibility: read/write OS clipboard text only.
    Never transforms JD content.
    """

    def __init__(
        self,
        backend: ClipboardBackend | None = None,
        *,
        settle_s: float = 0.15,
        read_retries: int = 3,
        retry_delay_s: float = 0.1,
    ) -> None:
        self._backend = backend
        self.settle_s = max(0.0, settle_s)
        self.read_retries = max(1, read_retries)
        self.retry_delay_s = max(0.0, retry_delay_s)

    @property
    def backend(self) -> ClipboardBackend:
        if self._backend is None:
            import pyperclip

            self._backend = pyperclip
        return self._backend

    def read(self) -> str:
        """Return clipboard text exactly as stored (may be empty)."""
        try:
            value = self.backend.paste()
        except Exception as exc:  # noqa: BLE001
            logger.exception("Clipboard read failed")
            raise ClipboardError(f"Clipboard read failed: {exc}") from exc

        # Preserve exact content; only normalize None → ""
        if value is None:
            return ""
        if not isinstance(value, str):
            value = str(value)
        logger.info("Clipboard read chars=%s", len(value))
        return value

    def write(self, text: str) -> None:
        """Write text to the clipboard exactly (used for sentinel tokens)."""
        try:
            self.backend.copy("" if text is None else str(text))
        except Exception as exc:  # noqa: BLE001
            logger.exception("Clipboard write failed")
            raise ClipboardError(f"Clipboard write failed: {exc}") from exc

    def clear_with_sentinel(self) -> str:
        """
        Write a unique sentinel so a later read can detect Ctrl+C success.
        Returns the sentinel string.
        """
        token = f"__jd_collector_sentinel_{uuid.uuid4().hex}__"
        self.write(token)
        logger.debug("Clipboard sentinel set")
        return token

    def read_after_copy(
        self,
        *,
        previous: str | None = None,
        settle_s: float | None = None,
        require_change: bool = True,
    ) -> str:
        """
        Read clipboard after a copy hotkey.

        - Waits briefly for the OS clipboard to update.
        - Retries a few times.
        - Returns the exact clipboard string (no trimming/parsing).
        """
        wait = self.settle_s if settle_s is None else max(0.0, settle_s)
        if wait:
            time.sleep(wait)

        last = ""
        for attempt in range(1, self.read_retries + 1):
            last = self.read()
            changed = previous is None or last != previous
            non_empty = last != ""
            if non_empty and (changed or not require_change):
                if previous is not None and not changed:
                    logger.warning(
                        "Clipboard unchanged after copy (attempt=%s, chars=%s)",
                        attempt,
                        len(last),
                    )
                else:
                    logger.info(
                        "Clipboard captured after copy attempt=%s chars=%s",
                        attempt,
                        len(last),
                    )
                return last

            logger.warning(
                "Clipboard not ready attempt=%s/%s empty=%s changed=%s",
                attempt,
                self.read_retries,
                not non_empty,
                previous is None or last != previous,
            )
            if attempt < self.read_retries and self.retry_delay_s:
                time.sleep(self.retry_delay_s)

        if require_change and previous is not None and last == previous:
            raise ClipboardError(
                "Clipboard did not change after Ctrl+C; selection/copy likely failed"
            )
        if last == "":
            raise ClipboardError("Clipboard empty after Ctrl+C")
        return last


# Module-level helpers
_default: ClipboardService | None = None


def _service() -> ClipboardService:
    global _default
    if _default is None:
        _default = ClipboardService()
    return _default


def read() -> str:
    return _service().read()


def read_after_copy(
    *,
    previous: str | None = None,
    settle_s: float | None = None,
    require_change: bool = True,
) -> str:
    return _service().read_after_copy(
        previous=previous, settle_s=settle_s, require_change=require_change
    )
