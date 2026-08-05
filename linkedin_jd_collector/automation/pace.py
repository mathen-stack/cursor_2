"""
Human-visible automation pacing.

Defaults mimic common user speed so clicks, drags, and copies are easy to
follow on screen. Override with env:

  AUTOMATION_PACE=human|fast   (default: human)
  AUTOMATION_SAFETY_DELAY=0.8  (seconds between actions; overrides pace)
"""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class AutomationPace:
    """Timings in seconds for mouse/keyboard/workflow steps."""

    name: str
    safety_delay_s: float
    move_duration_s: float
    select_drag_s: float
    after_select_s: float
    after_click_s: float
    copy_settle_s: float
    detail_wait_s: float
    between_jobs_s: float
    page_load_wait_s: float


HUMAN = AutomationPace(
    name="human",
    safety_delay_s=0.75,
    move_duration_s=0.45,
    select_drag_s=1.35,
    after_select_s=0.45,
    after_click_s=0.55,
    copy_settle_s=0.35,
    detail_wait_s=1.8,
    between_jobs_s=1.25,
    page_load_wait_s=2.5,
)

FAST = AutomationPace(
    name="fast",
    safety_delay_s=0.2,
    move_duration_s=0.12,
    select_drag_s=0.35,
    after_select_s=0.1,
    after_click_s=0.15,
    copy_settle_s=0.12,
    detail_wait_s=1.0,
    between_jobs_s=0.35,
    page_load_wait_s=1.6,
)


def resolve_pace() -> AutomationPace:
    """Return active pace from AUTOMATION_PACE (default: human)."""
    raw = (os.getenv("AUTOMATION_PACE") or "human").strip().lower()
    if raw in {"fast", "quick", "speed"}:
        pace = FAST
    else:
        pace = HUMAN

    # Optional override for the inter-action pause only.
    env_delay = (os.getenv("AUTOMATION_SAFETY_DELAY") or "").strip()
    if env_delay:
        try:
            delay = max(0.0, float(env_delay))
            return AutomationPace(
                name=pace.name,
                safety_delay_s=delay,
                move_duration_s=pace.move_duration_s,
                select_drag_s=pace.select_drag_s,
                after_select_s=pace.after_select_s,
                after_click_s=pace.after_click_s,
                copy_settle_s=pace.copy_settle_s,
                detail_wait_s=pace.detail_wait_s,
                between_jobs_s=pace.between_jobs_s,
                page_load_wait_s=pace.page_load_wait_s,
            )
        except ValueError:
            pass
    return pace
