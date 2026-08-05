"""
Job card detection helpers for the left job list.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Any, Callable

from ai.vision_agent import Coordinates, VisionAction, VisionAgent

logger = logging.getLogger(__name__)


@dataclass
class JobCard:
    """A detected job card click target."""

    x: int
    y: int
    title: str = "job"
    company: str = "company"
    index: int | None = None

    @property
    def signature(self) -> str:
        base = f"{self.title.strip().lower()}|{self.company.strip().lower()}"
        if self.index is not None:
            return f"{base}|idx:{self.index}"
        return f"{base}|@{self.x},{self.y}"


@dataclass
class JobDetector:
    """
    Uses vision results to identify job cards and choose the next click target.
    """

    vision: VisionAgent
    completed_signatures: set[str] = field(default_factory=set)
    page_cards: list[JobCard] = field(default_factory=list)
    _page_processed: set[str] = field(default_factory=set)

    def reset_page(self) -> None:
        logger.info("JobDetector reset_page")
        self.page_cards.clear()
        self._page_processed.clear()

    def mark_completed(self, signature: str) -> None:
        self.completed_signatures.add(signature)
        self._page_processed.add(signature)

    def parse_job_cards(self, action: VisionAction) -> list[JobCard]:
        """Extract job card list from a vision action payload when present."""
        raw = action.raw or {}
        cards: list[JobCard] = []

        raw_cards = raw.get("job_cards") or raw.get("metadata", {}).get("job_cards")
        if isinstance(raw_cards, list):
            for i, item in enumerate(raw_cards):
                if not isinstance(item, dict):
                    continue
                coords = item.get("coordinates") if isinstance(item.get("coordinates"), dict) else item
                try:
                    x = int(round(float(coords.get("x"))))
                    y = int(round(float(coords.get("y"))))
                except (TypeError, ValueError, AttributeError):
                    continue
                cards.append(
                    JobCard(
                        x=x,
                        y=y,
                        title=str(item.get("title") or f"job_{i+1}"),
                        company=str(item.get("company") or "company"),
                        index=i,
                    )
                )

        # Fallback: single click target that is a job card
        if not cards and action.target == "job_card" and action.coordinates:
            title, company = self._parse_title_company(action.observation or "")
            cards.append(
                JobCard(
                    x=action.coordinates.x,
                    y=action.coordinates.y,
                    title=title,
                    company=company,
                    index=len(self._page_processed),
                )
            )

        if cards:
            self.page_cards = cards
            logger.info("Detected %s job card(s)", len(cards))
        return cards

    def next_unprocessed(self) -> JobCard | None:
        for card in self.page_cards:
            if card.signature in self.completed_signatures:
                continue
            if card.signature in self._page_processed:
                continue
            return card
        return None

    def identify_visible_jobs(
        self,
        screenshot: bytes,
        *,
        extra_context: str = "",
    ) -> list[JobCard]:
        """
        Ask the AI to identify visible job cards on the current page.
        """
        context = (
            "Identify all visible job cards in the left job list. "
            "Return action=click on the first unprocessed job_card with coordinates. "
            "Include a job_cards array when possible: "
            '[{"x":..,"y":..,"title":"..","company":".."}, ...]. '
            f"Already completed: {sorted(self.completed_signatures)[-30:]}. "
            f"{extra_context}"
        )
        action = self.vision.analyze_screenshot(screenshot, extra_context=context)
        cards = self.parse_job_cards(action)
        return cards

    def choose_next_job_action(
        self,
        screenshot: bytes,
        *,
        extra_context: str = "",
    ) -> tuple[JobCard | None, VisionAction]:
        """
        Determine the next job to open.

        Returns (job_card_or_none, vision_action).
        """
        pending = self.next_unprocessed()
        if pending is not None:
            synthetic = VisionAction(
                action="click",
                target="job_card",
                coordinates=Coordinates(pending.x, pending.y),
                observation=f"Using cached card {pending.title}",
                detections={"job_cards": True},
                raw={"job_cards": [pending.__dict__]},
            )
            return pending, synthetic

        context = (
            "Click the next unprocessed job card in the left list. "
            "If all visible jobs on this page were processed, scroll the job list "
            "or use action=next_page / action=finish as appropriate. "
            f"Completed signatures: {sorted(self.completed_signatures)[-30:]}. "
            f"{extra_context}"
        )
        action = self.vision.analyze_screenshot(screenshot, extra_context=context)
        self.parse_job_cards(action)

        if action.action == "click" and action.target == "job_card" and action.coordinates:
            title, company = self._parse_title_company(action.observation or "")
            card = JobCard(
                x=action.coordinates.x,
                y=action.coordinates.y,
                title=title,
                company=company,
                index=len(self._page_processed),
            )
            if card.signature in self.completed_signatures:
                logger.info("AI suggested already-completed job; treating as none")
                return None, action
            return card, action

        return None, action

    @staticmethod
    def _parse_title_company(observation: str) -> tuple[str, str]:
        # Best-effort parse from free text: "Title at Company" or "Title | Company"
        text = observation.strip()
        if not text:
            return "job", "company"
        m = re.search(r"([^\n|]+)\s+\|\s+([^\n]+)", text)
        if m:
            return m.group(1).strip()[:80], m.group(2).strip()[:80]
        m = re.search(r"([^\n]+?)\s+at\s+([^\n]+)", text, flags=re.IGNORECASE)
        if m:
            return m.group(1).strip()[:80], m.group(2).strip()[:80]
        return text[:60] or "job", "company"
