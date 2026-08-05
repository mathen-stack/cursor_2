"""Unit tests for OpenRouter vision JSON parsing/validation (no live API)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from ai.vision_agent import (
    VisionJSONError,
    extract_json_object,
    validate_action_payload,
)


def test_extract_json_object_pure():
    data = extract_json_object('{"action":"click","target":"job_card","coordinates":{"x":1,"y":2}}')
    assert data["action"] == "click"


def test_extract_json_object_fenced():
    text = """Here you go:
```json
{"action": "wait", "wait_ms": 500}
```
"""
    data = extract_json_object(text)
    assert data["action"] == "wait"
    assert data["wait_ms"] == 500


def test_validate_click_action():
    action = validate_action_payload(
        {
            "action": "click",
            "target": "job_card",
            "coordinates": {"x": 300, "y": 450},
            "confidence": 0.9,
            "observation": "Unprocessed job card",
            "detections": {
                "linkedin_page": True,
                "job_list": True,
                "job_cards": True,
                "selected_job": False,
                "about_the_job": False,
                "next_button": True,
                "previous_button": False,
            },
        }
    )
    assert action.action == "click"
    assert action.target == "job_card"
    assert action.coordinates is not None
    assert action.coordinates.x == 300
    assert action.coordinates.y == 450
    assert action.detections["job_cards"] is True
    assert action.to_dict()["coordinates"] == {"x": 300, "y": 450}


def test_validate_click_requires_coordinates():
    with pytest.raises(VisionJSONError):
        validate_action_payload({"action": "click", "target": "job_card"})


def test_validate_invalid_action():
    with pytest.raises(VisionJSONError):
        validate_action_payload({"action": "explode"})


def test_validate_target_aliases_and_unknown():
    action = validate_action_payload(
        {
            "action": "click",
            "target": "job",
            "coordinates": {"x": 10, "y": 20},
        }
    )
    assert action.target == "job_card"

    soft = validate_action_payload(
        {
            "action": "click",
            "target": "weird_label",
            "coordinates": {"x": 11, "y": 22},
        }
    )
    assert soft.target == "other"


def test_validate_wait_defaults():
    action = validate_action_payload({"action": "wait"})
    assert action.wait_ms == 800


def test_validate_scroll_defaults():
    action = validate_action_payload({"action": "scroll"})
    assert action.scroll is not None
    assert action.scroll.dy == -400


def test_validate_copy_and_finish_and_next():
    copy = validate_action_payload({"action": "copy"})
    assert copy.target == "about_the_job"

    nxt = validate_action_payload(
        {"action": "next_page", "coordinates": {"x": 10, "y": 20}}
    )
    assert nxt.target == "next_button"

    done = validate_action_payload({"action": "finish", "observation": "done"})
    assert done.action == "finish"


def test_example_payload_from_spec():
    example = {
        "action": "click",
        "target": "job_card",
        "coordinates": {"x": 300, "y": 450},
    }
    action = validate_action_payload(example)
    assert action.to_dict()["action"] == "click"
    assert json.dumps(action.to_dict()["coordinates"]) == '{"x": 300, "y": 450}'
