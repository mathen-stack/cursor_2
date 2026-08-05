"""Integration-style tests for LinkedInWorkflow with fakes."""

from __future__ import annotations

from pathlib import Path

from agent.state_manager import WorkflowState
from agent.workflow import LinkedInWorkflow, WorkflowConfig
from ai.vision_agent import Coordinates, VisionAction
from automation.clipboard import ClipboardService
from automation.safety import AutomationGuard


class ScriptedVision:
    def __init__(self, script):
        self.script = list(script)
        self.calls = []

    def analyze_screenshot(self, screenshot, extra_context=None, mime_type=None):
        self.calls.append(extra_context or "")
        if not self.script:
            return VisionAction(action="finish", observation="default finish")
        return self.script.pop(0)

    def close(self):
        return None


class FakeMouse:
    def __init__(self):
        self.calls = []

    def move(self, x, y, duration=None):
        self.calls.append(("move", x, y))

    def click(self, x=None, y=None, button="left"):
        self.calls.append(("click", x, y))

    def scroll(self, amount=-3, x=None, y=None, dy=None):
        self.calls.append(("scroll", dy or amount, x, y))

    def select_text(self, x1, y1, x2, y2, duration=0.25):
        self.calls.append(("select_text", x1, y1, x2, y2))


class FakeKeyboard:
    def __init__(self, clip=None, text="About the job\nBuild things"):
        self.clip = clip
        self.text = text
        self.calls = []

    def hotkey(self, *keys, interval=0.05):
        self.calls.append(("hotkey", keys))
        if keys == ("ctrl", "c") and self.clip is not None:
            self.clip.text = self.text

    def copy(self, read_clipboard=True, settle_s=None):
        self.calls.append(("copy",))
        return self.text

    def close(self):
        return None


class FakeClip:
    def __init__(self, text=""):
        self.text = text

    def paste(self):
        return self.text

    def copy(self, text):
        self.text = text


class FakeScreenshots:
    def capture(self, region=None, max_width=None):
        from screen.screenshot import ScreenshotResult

        return ScreenshotResult(image_bytes=b"\x89PNG\r\n\x1a\nfake", width=100, height=100)

    def close(self):
        return None


def _click_job(x=100, y=200, title="Eng", company="Acme"):
    return VisionAction(
        action="click",
        target="job_card",
        coordinates=Coordinates(x, y),
        observation=f"{title} at {company}",
        detections={
            "linkedin_page": True,
            "job_list": True,
            "job_cards": True,
            "selected_job": False,
            "about_the_job": False,
            "next_button": True,
            "previous_button": False,
        },
        raw={"job_cards": [{"x": x, "y": y, "title": title, "company": company}]},
    )


def test_workflow_processes_one_job_then_finishes(tmp_path: Path):
    original_jd = "About the job\nBuild things\nExact text"
    script = [
        _click_job(),  # identify_visible_jobs
        VisionAction(  # wait_for_details_panel
            action="wait",
            wait_ms=1,
            detections={"about_the_job": True, "selected_job": True},
        ),
        VisionAction(  # identify_jd_location (extract_jd)
            action="click",
            target="about_the_job",
            coordinates=Coordinates(500, 500),
            detections={"about_the_job": True},
            raw={"select": {"x1": 480, "y1": 400, "x2": 900, "y2": 800}},
        ),
        VisionAction(action="finish", observation="no more jobs"),  # choose_next after save
        VisionAction(action="finish", observation="no next"),  # paginate
    ]
    vision = ScriptedVision(script)
    guard = AutomationGuard(safety_delay_s=0.0)
    events = []
    clip_backend = FakeClip()
    clipboard = ClipboardService(
        backend=clip_backend, settle_s=0.0, read_retries=2, retry_delay_s=0.0
    )
    keyboard = FakeKeyboard(clip=clip_backend, text=original_jd)

    wf = LinkedInWorkflow(
        config=WorkflowConfig(
            output_dir=str(tmp_path),
            detail_wait_s=0.0,
            between_jobs_s=0.0,
            max_job_attempts=1,
        ),
        vision=vision,
        mouse=FakeMouse(),
        keyboard=keyboard,
        screenshots=FakeScreenshots(),
        guard=guard,
        on_event=lambda name, payload: events.append(name),
    )
    wf.jd.clipboard = clipboard
    wf.jd.keyboard = keyboard
    wf.jd.detail_wait_s = 0.0
    wf.jd.max_detail_attempts = 1
    wf.jd.max_extract_attempts = 1
    wf.pages.page_load_wait_s = 0.0

    state = wf.run()
    assert state.state in {WorkflowState.COMPLETE, WorkflowState.STOPPED}
    assert state.stats.jobs_saved == 1
    saved_files = list((tmp_path / "runs").glob("*/jds/*.txt"))
    assert len(saved_files) == 1
    assert saved_files[0].read_text(encoding="utf-8") == original_jd
    assert "job_saved" in events
    assert "complete" in events


def test_workflow_stops_on_user_stop(tmp_path: Path):
    vision = ScriptedVision([
        _click_job(),
    ])
    guard = AutomationGuard(safety_delay_s=0.0)
    wf = LinkedInWorkflow(
        config=WorkflowConfig(output_dir=str(tmp_path), between_jobs_s=0.0, detail_wait_s=0.0),
        vision=vision,
        mouse=FakeMouse(),
        keyboard=FakeKeyboard(),
        screenshots=FakeScreenshots(),
        guard=guard,
    )
    wf.state.request_stop()
    state = wf.run()
    assert state.state == WorkflowState.STOPPED
    assert state.stats.jobs_saved == 0
