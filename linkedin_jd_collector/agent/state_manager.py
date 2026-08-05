"""
Run state manager for the LinkedIn collection workflow.
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

logger = logging.getLogger(__name__)


class WorkflowState(str, Enum):
    IDLE = "IDLE"
    START = "START"
    CAPTURE = "CAPTURE"
    ANALYZE = "ANALYZE"
    OPEN_JOB = "OPEN_JOB"
    WAIT_DETAIL = "WAIT_DETAIL"
    FIND_JD = "FIND_JD"
    SELECT_JD = "SELECT_JD"
    COPY_JD = "COPY_JD"
    SAVE_JD = "SAVE_JD"
    MARK_DONE = "MARK_DONE"
    NEXT_JOB = "NEXT_JOB"
    PAGINATE = "PAGINATE"
    COMPLETE = "COMPLETE"
    STOPPED = "STOPPED"
    ERROR = "ERROR"


@dataclass
class RunStats:
    page_index: int = 1
    jobs_seen: int = 0
    jobs_saved: int = 0
    jobs_failed: int = 0
    pages_completed: int = 0
    last_error: str | None = None
    last_job_signature: str | None = None


@dataclass
class StateManager:
    """Tracks FSM state, stop/pause flags, and run counters."""

    state: WorkflowState = WorkflowState.IDLE
    stats: RunStats = field(default_factory=RunStats)
    _stop: threading.Event = field(default_factory=threading.Event)
    _pause: threading.Event = field(default_factory=threading.Event)
    history: list[str] = field(default_factory=list)

    def request_stop(self) -> None:
        logger.info("Stop requested by user")
        self._stop.set()

    def clear_stop(self) -> None:
        self._stop.clear()

    def request_pause(self) -> None:
        logger.info("Pause requested")
        self._pause.set()

    def resume(self) -> None:
        logger.info("Resume requested")
        self._pause.clear()

    @property
    def should_stop(self) -> bool:
        return self._stop.is_set()

    @property
    def is_paused(self) -> bool:
        return self._pause.is_set()

    def wait_if_paused(self) -> None:
        while self._pause.is_set() and not self._stop.is_set():
            self._pause.wait(0.1)

    def set_state(self, state: WorkflowState) -> None:
        prev = self.state
        self.state = state
        self.history.append(f"{prev.value}->{state.value}")
        logger.info("STATE %s -> %s", prev.value, state.value)

    def snapshot(self) -> dict[str, Any]:
        return {
            "state": self.state.value,
            "page_index": self.stats.page_index,
            "jobs_seen": self.stats.jobs_seen,
            "jobs_saved": self.stats.jobs_saved,
            "jobs_failed": self.stats.jobs_failed,
            "pages_completed": self.stats.pages_completed,
            "last_error": self.stats.last_error,
            "last_job_signature": self.stats.last_job_signature,
            "should_stop": self.should_stop,
            "is_paused": self.is_paused,
        }

    def context_for_ai(self) -> str:
        snap = self.snapshot()
        return (
            f"workflow_state={snap['state']}; page={snap['page_index']}; "
            f"saved={snap['jobs_saved']}; last_job={snap['last_job_signature']}"
        )
