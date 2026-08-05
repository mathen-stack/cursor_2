"""Tests for JobDetector parsing and next-job selection."""

from __future__ import annotations

from ai.vision_agent import Coordinates, VisionAction
from linkedin.job_detector import JobDetector


class FakeVision:
    def __init__(self, actions):
        self.actions = list(actions)
        self.calls = 0

    def analyze_screenshot(self, screenshot, extra_context=None):
        self.calls += 1
        return self.actions.pop(0)


def test_parse_job_cards_array():
    vision = FakeVision([])
    detector = JobDetector(vision=vision)
    action = VisionAction(
        action="click",
        target="job_card",
        coordinates=Coordinates(10, 20),
        raw={
            "job_cards": [
                {"x": 100, "y": 200, "title": "Eng", "company": "Acme"},
                {"x": 100, "y": 300, "title": "PM", "company": "Beta"},
            ]
        },
    )
    cards = detector.parse_job_cards(action)
    assert len(cards) == 2
    assert cards[0].title == "Eng"
    assert detector.next_unprocessed().title == "Eng"
    detector.mark_completed(cards[0].signature)
    assert detector.next_unprocessed().title == "PM"


def test_choose_next_job_uses_ai_click():
    action = VisionAction(
        action="click",
        target="job_card",
        coordinates=Coordinates(300, 450),
        observation="Software Engineer at Example Corp",
        detections={"job_cards": True},
        raw={},
    )
    vision = FakeVision([action])
    detector = JobDetector(vision=vision)
    card, returned = detector.choose_next_job_action(b"png")
    assert card is not None
    assert card.x == 300
    assert "software engineer" in card.title.lower()
    assert returned.action == "click"


def test_identify_visible_jobs():
    action = VisionAction(
        action="click",
        target="job_card",
        coordinates=Coordinates(1, 2),
        raw={"job_cards": [{"x": 1, "y": 2, "title": "A", "company": "B"}]},
    )
    vision = FakeVision([action])
    detector = JobDetector(vision=vision)
    cards = detector.identify_visible_jobs(b"png")
    assert len(cards) == 1
    assert vision.calls == 1


def test_heuristic_slots_when_vision_returns_empty():
    from linkedin.job_detector import heuristic_job_cards

    slots = heuristic_job_cards(1280, 800, count=5)
    assert len(slots) == 5
    assert slots[0].x < 1280 * 0.35  # left rail
    assert slots[1].y > slots[0].y
    assert all(s.x == slots[0].x for s in slots)

    vision = FakeVision(
        [VisionAction(action="wait", wait_ms=200, observation="no cards listed")]
    )
    detector = JobDetector(vision=vision)
    card, action = detector.choose_next_job_action(
        b"png", image_size=(1280, 800)
    )
    assert card is not None
    assert action.action == "click"
    assert "heuristic" in (action.observation or "").lower()


def test_finish_is_not_overridden_by_heuristics():
    vision = FakeVision(
        [VisionAction(action="finish", observation="page done")]
    )
    detector = JobDetector(vision=vision)
    card, action = detector.choose_next_job_action(
        b"png", image_size=(1280, 800)
    )
    assert card is None
    assert action.action == "finish"


def test_accept_click_with_other_target():
    action = VisionAction(
        action="click",
        target="other",
        coordinates=Coordinates(220, 310),
        observation="Frontend Engineer at Globex",
        detections={"job_cards": True},
        raw={},
    )
    vision = FakeVision([action])
    detector = JobDetector(vision=vision)
    card, returned = detector.choose_next_job_action(b"png")
    assert card is not None
    assert card.x == 220
    assert "frontend" in card.title.lower()
