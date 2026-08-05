"""Integration-style tests for LinkedInWorkflow with fakes."""

from __future__ import annotations

from pathlib import Path

from agent.state_manager import WorkflowState
from agent.workflow import LinkedInWorkflow, WorkflowConfig
from ai.vision_agent import Coordinates, VisionAction
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
    def __init__(self, text="About the job\nBuild things"):
        self.text = text
        self.calls = []

    def hotkey(self, *keys, interval=0.05):
        self.calls.append(("hotkey", keys))

    def copy(self, read_clipboard=True, settle_s=None):
        self.calls.append(("copy",))
        return self.text

    def close(self):
        return None


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
    # identify jobs
    # choose next (cached after identify, but choose may still call if needed)
    # wait detail
    # find jd
    # select/copy analyze
    # page done choose -> finish/next
    # paginate detect -> finish
    script = [
        _click_job(),  # identify_visible_jobs
        VisionAction(  # wait_for_details_panel
            action="wait",
            wait_ms=1,
            detections={"about_the_job": True, "selected_job": True},
        ),
        VisionAction(  # find_jd_section
            action="click",
            target="about_the_job",
            coordinates=Coordinates(500, 500),
            detections={"about_the_job": True},
        ),
        VisionAction(  # select_and_copy_jd analyze
            action="copy",
            target="about_the_job",
            coordinates=Coordinates(500, 520),
        ),
        VisionAction(action="finish", observation="no more jobs"),  # choose_next after save
        VisionAction(action="finish", observation="no next"),  # paginate
    ]
    vision = ScriptedVision(script)
    guard = AutomationGuard(safety_delay_s=0.0)
    events = []

    wf = LinkedInWorkflow(
        config=WorkflowConfig(
            output_dir=str(tmp_path),
            detail_wait_s=0.0,
            between_jobs_s=0.0,
            max_job_attempts=1,
        ),
        vision=vision,
        mouse=FakeMouse(),
        keyboard=FakeKeyboard(),
        screenshots=FakeScreenshots(),
        guard=guard,
        on_event=lambda name, payload: events.append(name),
    )
    # Avoid emergency listener / real pyautogui delay interactions
    wf.keyboard = FakeKeyboard()
    wf.jd.keyboard = wf.keyboard
    wf.jd.detail_wait_s = 0.0
    wf.jd.max_detail_attempts = 1
    wf.pages.page_load_wait_s = 0.0

    state = wf.run()
    assert state.state in {WorkflowState.COMPLETE, WorkflowState.STOPPED}
    assert state.stats.jobs_saved == 1
    saved_files = list((tmp_path / "runs").glob("*/jds/*.txt"))
    assert len(saved_files) == 1
    assert "About the job" in saved_files[0].read_text(encoding="utf-8")
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
    wf.keyboard = FakeKeyboard()
    wf.jd.keyboard = wf.keyboard
    wf.state.request_stop()
    state = wf.run()
    assert state.state == WorkflowState.STOPPED
    assert state.stats.jobs_saved == 0
