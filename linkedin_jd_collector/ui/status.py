"""UI status labels mapped from workflow FSM states."""

from __future__ import annotations

from enum import Enum

from agent.state_manager import WorkflowState


class UiStatus(str, Enum):
    WAITING = "Waiting"
    CAPTURING_SCREEN = "Capturing Screen"
    ANALYZING_SCREEN = "Analyzing Screen"
    DETECTING_LINKEDIN = "Detecting LinkedIn"
    CLICKING_JOB = "Clicking Job"
    WAITING_DETAILS = "Waiting for Job Details"
    FINDING_JD = "Finding About the Job"
    SELECTING_JD = "Drag-Selecting JD"
    COPYING_JD = "Copying JD (Ctrl+C)"
    SAVING_JD = "Saving JD File"
    MARKING_DONE = "Marking Job Done"
    NEXT_JOB = "Moving to Next Job"
    PAGINATING = "Going to Next Page"
    PROCESSING_JOBS = "Processing Jobs"
    COMPLETED = "Completed"
    PAUSED = "Paused"
    ERROR = "Error"
    STOPPED = "Stopped"


_STATE_MAP = {
    WorkflowState.IDLE: UiStatus.WAITING,
    WorkflowState.START: UiStatus.WAITING,
    WorkflowState.CAPTURE: UiStatus.CAPTURING_SCREEN,
    WorkflowState.ANALYZE: UiStatus.ANALYZING_SCREEN,
    WorkflowState.OPEN_JOB: UiStatus.CLICKING_JOB,
    WorkflowState.WAIT_DETAIL: UiStatus.WAITING_DETAILS,
    WorkflowState.FIND_JD: UiStatus.FINDING_JD,
    WorkflowState.SELECT_JD: UiStatus.SELECTING_JD,
    WorkflowState.COPY_JD: UiStatus.COPYING_JD,
    WorkflowState.SAVE_JD: UiStatus.SAVING_JD,
    WorkflowState.MARK_DONE: UiStatus.MARKING_DONE,
    WorkflowState.NEXT_JOB: UiStatus.NEXT_JOB,
    WorkflowState.PAGINATE: UiStatus.PAGINATING,
    WorkflowState.COMPLETE: UiStatus.COMPLETED,
    WorkflowState.STOPPED: UiStatus.STOPPED,
    WorkflowState.ERROR: UiStatus.ERROR,
}

# Optional overrides when the workflow announces a named step.
_STEP_LABEL_MAP = {
    "detect_linkedin": UiStatus.DETECTING_LINKEDIN,
    "capture": UiStatus.CAPTURING_SCREEN,
    "analyze": UiStatus.ANALYZING_SCREEN,
    "open_job": UiStatus.CLICKING_JOB,
    "wait_detail": UiStatus.WAITING_DETAILS,
    "find_jd": UiStatus.FINDING_JD,
    "select_jd": UiStatus.SELECTING_JD,
    "copy_jd": UiStatus.COPYING_JD,
    "save_jd": UiStatus.SAVING_JD,
    "mark_done": UiStatus.MARKING_DONE,
    "next_job": UiStatus.NEXT_JOB,
    "paginate": UiStatus.PAGINATING,
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


def ui_status_for_step(step: str | None, state: WorkflowState | str | None = None) -> UiStatus:
    """Prefer an announced step key; fall back to FSM state mapping."""
    key = (step or "").strip().lower()
    if key in _STEP_LABEL_MAP:
        return _STEP_LABEL_MAP[key]
    if state is not None:
        return ui_status_for_state(state)
    return UiStatus.WAITING
