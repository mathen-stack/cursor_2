"""VisionAgent end-to-end with mocked OpenRouterClient."""

from __future__ import annotations

import json

from ai.vision_agent import VisionAgent


class FakeClient:
    def __init__(self, text: str):
        self.text = text
        self.calls = 0

    def complete_with_image(self, **kwargs):
        self.calls += 1
        assert "Analyze this LinkedIn page" in kwargs["user_text"]
        return self.text

    def close(self):
        return None


def test_analyze_screenshot_returns_vision_action():
    payload = {
        "action": "click",
        "target": "job_card",
        "coordinates": {"x": 300, "y": 450},
        "observation": "Click next unprocessed job card",
        "detections": {
            "linkedin_page": True,
            "job_list": True,
            "job_cards": True,
            "selected_job": False,
            "about_the_job": False,
            "next_button": True,
            "previous_button": True,
        },
    }
    agent = VisionAgent(client=FakeClient(json.dumps(payload)), parse_retries=1)
    action = agent.analyze_screenshot(b"\x89PNG\r\n\x1a\n" + b"\x00" * 8)
    assert action.action == "click"
    assert action.coordinates.y == 450
    assert action.detections["next_button"] is True
    agent.close()


def test_analyze_retries_on_bad_json_then_succeeds():
    class Flaky:
        def __init__(self):
            self.calls = 0

        def complete_with_image(self, **kwargs):
            self.calls += 1
            if self.calls == 1:
                return "not-json"
            return '{"action":"finish","observation":"all done"}'

        def close(self):
            return None

    fake = Flaky()
    agent = VisionAgent(client=fake, parse_retries=2)
    action = agent.analyze_screenshot(b"\x89PNG\r\n\x1a\n" + b"\x00" * 8)
    assert action.action == "finish"
    assert fake.calls == 2
    agent.close()
