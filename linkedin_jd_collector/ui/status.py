"""UI status labels mapped from workflow FSM states."""

from __future__ import annotations

from enum import Enum

from agent.state_manager import WorkflowState


class UiStatus(str, Enum):
    WAITING = "Waiting"
    ANALYZING_SCREEN = "Analyzing Screen"
    PROCESSING_JOBS = "Processing Jobs"
    COPYING_JD = "Copying JD"
    COMPLETED = "Completed"
    PAUSED = "Paused"
    ERROR = "Error"
    STOPPED = "Stopped"


_STATE_MAP = {
    WorkflowState.IDLE: UiStatus.WAITING,
    WorkflowState.START: UiStatus.WAITING,
    WorkflowState.CAPTURE: UiStatus.ANALYZING_SCREEN,
    WorkflowState.ANALYZE: UiStatus.ANALYZING_SCREEN,
    WorkflowState.OPEN_JOB: UiStatus.PROCESSING_JOBS,
    WorkflowState.WAIT_DETAIL: UiStatus.PROCESSING_JOBS,
    WorkflowState.FIND_JD: UiStatus.PROCESSING_JOBS,
    WorkflowState.SELECT_JD: UiStatus.COPYING_JD,
    WorkflowState.COPY_JD: UiStatus.COPYING_JD,
    WorkflowState.SAVE_JD: UiStatus.PROCESSING_JOBS,
    WorkflowState.MARK_DONE: UiStatus.PROCESSING_JOBS,
    WorkflowState.NEXT_JOB: UiStatus.PROCESSING_JOBS,
    WorkflowState.PAGINATE: UiStatus.PROCESSING_JOBS,
    WorkflowState.COMPLETE: UiStatus.COMPLETED,
    WorkflowState.STOPPED: UiStatus.STOPPED,
    WorkflowState.ERROR: UiStatus.ERROR,
}


def ui_status_for_state(state: WorkflowState | str, *, paused: bool = False) -> UiStatus:
    if paused and str(state) not in {
        WorkflowState.COMPLETE.value,
        WorkflowState.ERROR.value,
        WorkflowState.STOPPED.value,
    }:
        return UiStatus.PAUSED
    if isinstance(state, str):
        try:
            state = WorkflowState(state)
        except ValueError:
            return UiStatus.WAITING
    return _STATE_MAP.get(state, UiStatus.WAITING)
