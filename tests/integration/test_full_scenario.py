"""
Full scenario integration test (mocked OS/AI):

1-3. User already opened Chrome/LinkedIn/filters (precondition)
4. User starts application/workflow
5. AI detects LinkedIn
6. Agent clicks jobs
7. Agent copies JD
8. Agent saves files
9. Agent moves to next page
10. Agent finishes
"""

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
        return x, y

    def click(self, x=None, y=None, button="left"):
        self.calls.append(("click", x, y))

    def scroll(self, amount=-3, x=None, y=None, dy=None):
        self.calls.append(("scroll", dy or amount, x, y))

    def select_text(self, x1, y1, x2, y2, duration=0.25):
        self.calls.append(("select_text", x1, y1, x2, y2))


class FakeClip:
    def __init__(self):
        self.text = ""

    def paste(self):
        return self.text

    def copy(self, text):
        self.text = text


class FakeKeyboard:
    def __init__(self, clip: FakeClip, jd_text: str):
        self.clip = clip
        self.jd_text = jd_text
        self.calls = []

    def hotkey(self, *keys, interval=0.05):
        self.calls.append(("hotkey", keys))
        if keys == ("ctrl", "c"):
            self.clip.text = self.jd_text

    def close(self):
        return None


class FakeScreenshots:
    def __init__(self):
        from screen.screenshot import ScreenshotResult

        self.last = ScreenshotResult(
            image_bytes=b"\x89PNG\r\n\x1a\nfake",
            width=1000,
            height=800,
            scale_x=1.5,  # prove mapping is applied
            scale_y=1.5,
            offset_left=10,
            offset_top=20,
        )

    def capture(self, region=None, max_width=None):
        return self.last

    def to_screen(self, x, y):
        return self.last.to_screen(x, y)

    def to_screen_region(self, x1, y1, x2, y2):
        return self.last.to_screen_region(x1, y1, x2, y2)

    def close(self):
        return None


def _linkedin_ok():
    return VisionAction(
        action="wait",
        wait_ms=1,
        observation="LinkedIn jobs results visible",
        detections={
            "linkedin_page": True,
            "job_list": True,
            "job_cards": True,
            "next_button": True,
        },
        confidence=0.9,
    )


def _job_cards(page: int):
    y0 = 200 if page == 1 else 220
    return VisionAction(
        action="click",
        target="job_card",
        coordinates=Coordinates(120, y0),
        observation=f"Engineer {page} at Acme",
        detections={"linkedin_page": True, "job_cards": True, "job_list": True},
        confidence=0.88,
        raw={
            "job_cards": [
                {
                    "x": 120,
                    "y": y0,
                    "title": f"Engineer {page}",
                    "company": "Acme",
                    "url": f"https://www.linkedin.com/jobs/view/{page}001",
                }
            ]
        },
    )


def _details_ok():
    return VisionAction(
        action="wait",
        wait_ms=1,
        detections={"about_the_job": True, "selected_job": True},
        confidence=0.9,
    )


def _jd_locate():
    return VisionAction(
        action="click",
        target="about_the_job",
        coordinates=Coordinates(600, 400),
        detections={"about_the_job": True},
        confidence=0.9,
        raw={"select": {"x1": 500, "y1": 300, "x2": 900, "y2": 700}},
    )


def test_full_scenario_two_pages(tmp_path: Path):
    # Unique JD bodies per page so content-hash cannot collide across URLs
    jd_by_page = {
        1: (
            "About the job\n"
            "We are hiring a software engineer to build products.\n"
            "Requirements include Python and collaboration skills.\n"
            "Page one unique marker ALPHA.\n"
        ),
        2: (
            "About the job\n"
            "We are hiring a software engineer to build products.\n"
            "Requirements include Python and collaboration skills.\n"
            "Page two unique marker BETA.\n"
        ),
    }
    jd = jd_by_page[1]
    # Page 1: detect → identify → details → jd → finish page
    # Paginate: next detect → wait jobs
    # Page 2: identify → details → jd → finish page
    # Paginate: finish
    script = [
        _linkedin_ok(),
        _job_cards(1),
        _details_ok(),
        _jd_locate(),
        VisionAction(action="finish", observation="page1 done"),
        VisionAction(  # pagination detect
            action="next_page",
            target="next_button",
            coordinates=Coordinates(800, 760),
            detections={"next_button": True},
            confidence=0.85,
        ),
        VisionAction(  # wait for new jobs
            action="wait",
            wait_ms=1,
            detections={"job_cards": True, "job_list": True},
        ),
        _job_cards(2),
        _details_ok(),
        _jd_locate(),
        VisionAction(action="finish", observation="page2 done"),
        VisionAction(action="finish", observation="no next"),
    ]

    vision = ScriptedVision(script)
    guard = AutomationGuard(safety_delay_s=0.0)
    clip = FakeClip()
    # Swap JD text when page 2 job is clicked (second job_started)
    class SwitchingKeyboard(FakeKeyboard):
        def __init__(self):
            super().__init__(clip, jd_by_page[1])
            self._n_copy = 0

        def hotkey(self, *keys, interval=0.05):
            self.calls.append(("hotkey", keys))
            if keys == ("ctrl", "c"):
                self._n_copy += 1
                self.clip.text = jd_by_page[1] if self._n_copy == 1 else jd_by_page[2]

    keyboard = SwitchingKeyboard()
    clipboard = ClipboardService(
        backend=clip, settle_s=0.0, read_retries=2, retry_delay_s=0.0
    )
    mouse = FakeMouse()
    events: list[str] = []

    wf = LinkedInWorkflow(
        config=WorkflowConfig(
            output_dir=str(tmp_path),
            detail_wait_s=0.0,
            between_jobs_s=0.0,
            max_job_attempts=1,
            require_linkedin_detection=True,
        ),
        vision=vision,
        mouse=mouse,
        keyboard=keyboard,
        screenshots=FakeScreenshots(),
        guard=guard,
        on_event=lambda n, p: events.append(n),
    )
    wf.pages.page_load_wait_s = 0.0
    wf.pages.max_page_wait_attempts = 1
    wf.jd.clipboard = clipboard
    wf.jd.keyboard = keyboard
    wf.jd.detail_wait_s = 0.0
    wf.jd.max_detail_attempts = 1
    wf.jd.max_extract_attempts = 1
    wf.linkedin.max_attempts = 1

    state = wf.run()
    assert state.state == WorkflowState.COMPLETE
    assert state.stats.jobs_saved == 2
    assert state.stats.page_index == 2
    assert state.stats.pages_completed == 1
    assert "linkedin_detected" in events
    assert events.count("job_saved") == 2
    assert "page_changed" in events
    assert "complete" in events

    files = list(tmp_path.glob("*.txt"))
    assert len(files) == 2
    bodies = [f.read_text(encoding="utf-8") for f in files]
    assert any("ALPHA" in body for body in bodies)
    assert any("BETA" in body for body in bodies)
    assert any("jobs/view/1001" in body for body in bodies)
    assert any("jobs/view/2001" in body for body in bodies)

    # Coordinate mapping applied: image x=120 -> screen 10 + 120*1.5 = 190
    assert any(c[0] == "move" and c[1] == 190 for c in mouse.calls)


def test_failed_job_is_skipped_not_looped(tmp_path: Path):
    """A permanently failing job must be skipped so the page can finish."""
    script = [
        _linkedin_ok(),
        _job_cards(1),
        # details never ready / extract never called because wait returns nothing useful
        VisionAction(action="wait", wait_ms=1, detections={}, confidence=0.9),
        VisionAction(action="wait", wait_ms=1, detections={}, confidence=0.9),
        VisionAction(action="finish", observation="no more"),
        VisionAction(action="finish", observation="no next"),
    ]
    # Force extraction failure path: details "ok" then empty clipboard repeatedly
    # Simpler: details ok, locate ok, but clipboard stays empty
    script = [
        _linkedin_ok(),
        _job_cards(1),
        _details_ok(),
        _jd_locate(),
        _jd_locate(),  # retry extract
        VisionAction(action="finish", observation="page done"),
        VisionAction(action="finish", observation="no next"),
    ]
    vision = ScriptedVision(script)
    guard = AutomationGuard(safety_delay_s=0.0)
    clip = FakeClip()  # never filled → extract fails
    keyboard = FakeKeyboard(clip, "")  # empty JD
    # Override hotkey to keep clipboard empty
    keyboard.hotkey = lambda *keys, interval=0.05: None
    clipboard = ClipboardService(
        backend=clip, settle_s=0.0, read_retries=1, retry_delay_s=0.0
    )

    wf = LinkedInWorkflow(
        config=WorkflowConfig(
            output_dir=str(tmp_path),
            detail_wait_s=0.0,
            between_jobs_s=0.0,
            max_job_attempts=1,
            require_linkedin_detection=True,
        ),
        vision=vision,
        mouse=FakeMouse(),
        keyboard=keyboard,
        screenshots=FakeScreenshots(),
        guard=guard,
    )
    wf.pages.page_load_wait_s = 0.0
    wf.jd.clipboard = clipboard
    wf.jd.keyboard = keyboard
    wf.jd.detail_wait_s = 0.0
    wf.jd.max_detail_attempts = 1
    wf.jd.max_extract_attempts = 1
    wf.linkedin.max_attempts = 1

    state = wf.run()
    assert state.state == WorkflowState.COMPLETE
    assert state.stats.jobs_saved == 0
    assert state.stats.jobs_failed == 1
