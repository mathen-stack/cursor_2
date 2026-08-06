"""
Job card detection helpers for the left job list.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Any, Callable

from ai.vision_agent import Coordinates, VisionAction, VisionAgent, VisionAgentError, VisionJSONError

logger = logging.getLogger(__name__)


@dataclass
class JobCard:
    """A detected job card click target."""

    x: int
    y: int
    title: str = "job"
    company: str = "company"
    index: int | None = None
    url: str | None = None

    @property
    def signature(self) -> str:
        """
        Stable identity for dedupe/skip.

        Prefer URL, then title|company (not shifting list index), then coarse
        coordinates so retries on the same card do not create a new identity.
        """
        if self.url:
            normalized = self.url.strip().split("?")[0].rstrip("/").lower()
            if normalized:
                return f"url:{normalized}"
        title = self.title.strip().lower()
        company = self.company.strip().lower()
        if title and title != "job" and company and company != "company":
            return f"job:{title}|{company}"
        # Bucket coordinates to reduce jitter from tiny AI coordinate drift
        return f"xy:{self.x // 8 * 8},{self.y // 8 * 8}"


def heuristic_job_cards(
    width: int,
    height: int,
    *,
    count: int = 8,
) -> list[JobCard]:
    """
    Deterministic left-rail click targets when vision fails to list cards.

    LinkedIn Jobs desktop layout: cards sit in the left ~25–35% of the window.
    """
    width = max(400, int(width))
    height = max(400, int(height))
    x = max(90, int(width * 0.22))
    start_y = max(170, int(height * 0.26))
    step = max(72, int(height * 0.095))
    cards: list[JobCard] = []
    for i in range(count):
        y = start_y + i * step
        if y >= height - 40:
            break
        cards.append(
            JobCard(
                x=x,
                y=y,
                title=f"job_slot_{i+1}",
                company="linkedin",
                index=i,
            )
        )
    logger.info(
        "Built %s heuristic job slots at x=%s start_y=%s step=%s (img=%sx%s)",
        len(cards),
        x,
        start_y,
        step,
        width,
        height,
    )
    return cards


@dataclass
class JobDetector:
    """
    Uses vision results to identify job cards and choose the next click target.
    """

    vision: VisionAgent
    completed_signatures: set[str] = field(default_factory=set)
    page_cards: list[JobCard] = field(default_factory=list)
    _page_processed: set[str] = field(default_factory=set)
    _heuristic_seeded: bool = False

    def reset_page(self) -> None:
        logger.info("JobDetector reset_page")
        self.page_cards.clear()
        self._page_processed.clear()
        self._heuristic_seeded = False

    def mark_completed(self, signature: str) -> None:
        self.completed_signatures.add(signature)
        self._page_processed.add(signature)

    def mark_skipped(self, signature: str) -> None:
        """Skip a card for this page (failed extraction) without saving."""
        self._page_processed.add(signature)
        logger.info("Marked skipped for page sig=%s", signature)

    def _sort_top_to_bottom(self) -> None:
        """Keep left-list cards ordered top → bottom like a human scan."""
        self.page_cards.sort(
            key=lambda c: (
                c.y,
                c.index if c.index is not None else 10_000,
                c.x,
            )
        )

    def seed_heuristic_cards(self, width: int, height: int) -> list[JobCard]:
        """Add left-list click slots if we still have no usable cards."""
        if self.next_unprocessed() is not None:
            return list(self.page_cards)
        cards = heuristic_job_cards(width, height)
        # Keep any already-processed heuristic slots out of rotation
        for card in cards:
            if card.signature in self._page_processed or card.signature in self.completed_signatures:
                continue
            if not any(c.signature == card.signature for c in self.page_cards):
                self.page_cards.append(card)
        self._heuristic_seeded = True
        self._sort_top_to_bottom()
        return list(self.page_cards)

    def parse_job_cards(self, action: VisionAction) -> list[JobCard]:
        """Extract job card list from a vision action payload when present."""
        raw = action.raw or {}
        cards: list[JobCard] = []

        raw_cards = (
            raw.get("job_cards")
            or raw.get("jobs")
            or raw.get("cards")
            or (raw.get("metadata") or {}).get("job_cards")
            or (raw.get("detections") or {}).get("job_cards")
        )
        # detections.job_cards is often a bool — ignore non-lists
        if isinstance(raw_cards, list):
            for i, item in enumerate(raw_cards):
                if not isinstance(item, dict):
                    continue
                coords = (
                    item.get("coordinates")
                    if isinstance(item.get("coordinates"), dict)
                    else item
                )
                try:
                    x = int(round(float(coords.get("x"))))
                    y = int(round(float(coords.get("y"))))
                except (TypeError, ValueError, AttributeError):
                    continue
                url = item.get("url")
                cards.append(
                    JobCard(
                        x=x,
                        y=y,
                        title=str(item.get("title") or item.get("name") or f"job_{i+1}"),
                        company=str(item.get("company") or item.get("org") or "company"),
                        index=i,
                        url=str(url).strip() if url else None,
                    )
                )

        # Fallback: single click target that looks like a job card
        if not cards and action.coordinates and (
            action.target in {"job_card", "job_list", "selected_job", "other", None}
            or action.detections.get("job_cards")
            or action.detections.get("job_list")
        ):
            if action.action in {"click", "wait", "copy"} or action.target == "job_card":
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
            # Merge into page cache, always top → bottom.
            for card in cards:
                if not any(c.signature == card.signature for c in self.page_cards):
                    self.page_cards.append(card)
            self._sort_top_to_bottom()
            logger.info("Detected %s job card(s) (page cache=%s)", len(cards), len(self.page_cards))
        return cards

    def next_unprocessed(self) -> JobCard | None:
        self._sort_top_to_bottom()
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
        image_size: tuple[int, int] | None = None,
    ) -> list[JobCard]:
        """
        Ask the AI to identify visible job cards on the current page.
        Falls back to heuristic left-rail slots when vision returns nothing.
        """
        context = (
            "HUMAN WORKFLOW — LEFT LIST ONLY:\n"
            "LinkedIn Jobs is a split view. Job cards are ONLY in the LEFT column.\n"
            "List every visible left-list job card TOP TO BOTTOM (highest y first in "
            "the array = top of screen). "
            "Return action=click target=job_card on the TOPMOST unprocessed card, "
            "and include job_cards:\n"
            '[{"x":..,"y":..,"title":"..","company":".."}, ...] ordered top→bottom.\n'
            "Do NOT click the right detail panel. "
            "Do NOT return finish/wait if any left-list cards are visible. "
            f"Already completed: {sorted(self.completed_signatures)[-30:]}. "
            f"{extra_context}"
        )
        try:
            action = self.vision.analyze_screenshot(screenshot, extra_context=context)
            cards = self.parse_job_cards(action)
        except (VisionJSONError, VisionAgentError) as exc:
            logger.warning("Vision identify_visible_jobs failed: %s", exc)
            cards = []

        if not cards and image_size is not None:
            self.seed_heuristic_cards(image_size[0], image_size[1])
            cards = [c for c in self.page_cards if c.signature not in self._page_processed]
        self._sort_top_to_bottom()
        return cards

    def choose_next_job_action(
        self,
        screenshot: bytes,
        *,
        extra_context: str = "",
        image_size: tuple[int, int] | None = None,
    ) -> tuple[JobCard | None, VisionAction]:
        """
        Determine the next job to open (top → bottom in the left list).

        Returns (job_card_or_none, vision_action).
        """
        pending = self.next_unprocessed()
        if pending is not None:
            synthetic = VisionAction(
                action="click",
                target="job_card",
                coordinates=Coordinates(pending.x, pending.y),
                observation=(
                    f"Next left-list job top→bottom: {pending.title} @ {pending.company}"
                ),
                detections={"job_cards": True},
                raw={"job_cards": [pending.__dict__]},
            )
            return pending, synthetic

        context = (
            "HUMAN WORKFLOW — pick ONE next job from the LEFT list, TOP TO BOTTOM.\n"
            "Click the next unprocessed job card in the LEFT column only "
            "(action=click target=job_card with coordinates on the card center).\n"
            "If more cards exist below the fold in the LEFT list, "
            "action=scroll dy=-500 over the left list (not the right panel).\n"
            "Only use next_page after every job on this page was opened/copied.\n"
            "Only use finish when there is truly no Next and no cards left.\n"
            f"Completed signatures: {sorted(self.completed_signatures)[-30:]}. "
            f"{extra_context}"
        )
        try:
            action = self.vision.analyze_screenshot(screenshot, extra_context=context)
        except (VisionJSONError, VisionAgentError) as exc:
            logger.warning("Vision choose_next_job_action failed: %s", exc)
            if image_size is not None:
                self.seed_heuristic_cards(image_size[0], image_size[1])
                pending = self.next_unprocessed()
                if pending is not None:
                    return pending, VisionAction(
                        action="click",
                        target="job_card",
                        coordinates=Coordinates(pending.x, pending.y),
                        observation=f"Heuristic fallback after vision error: {exc}",
                        detections={"job_cards": True},
                    )
            return None, VisionAction(
                action="wait",
                wait_ms=500,
                observation=f"Vision error: {exc}",
            )

        self.parse_job_cards(action)

        if action.action == "click" and action.coordinates:
            # Accept near-miss targets from small VL models.
            if action.target in {
                "job_card",
                "job_list",
                "selected_job",
                "other",
                None,
            } or action.detections.get("job_cards"):
                title, company = self._parse_title_company(action.observation or "")
                url = None
                raw = action.raw or {}
                if isinstance(raw.get("url"), str):
                    url = raw["url"]
                elif isinstance(raw.get("metadata"), dict) and raw["metadata"].get("url"):
                    url = str(raw["metadata"]["url"])
                card = JobCard(
                    x=action.coordinates.x,
                    y=action.coordinates.y,
                    title=title,
                    company=company,
                    index=None,
                    url=url,
                )
                if (
                    card.signature in self.completed_signatures
                    or card.signature in self._page_processed
                ):
                    logger.info("AI suggested already-handled job; trying heuristics")
                else:
                    if not any(c.signature == card.signature for c in self.page_cards):
                        self.page_cards.append(card)
                    return card, action

        # Vision gave scroll/wait with no card — seed heuristics once.
        # Do NOT override finish/next_page: those mean the page/run is done.
        if (
            self.next_unprocessed() is None
            and image_size is not None
            and action.action in {"wait", "scroll"}
            and not self._heuristic_seeded
        ):
            self.seed_heuristic_cards(image_size[0], image_size[1])
            pending = self.next_unprocessed()
            if pending is not None:
                return pending, VisionAction(
                    action="click",
                    target="job_card",
                    coordinates=Coordinates(pending.x, pending.y),
                    observation="Heuristic left-list slot (vision did not return cards)",
                    detections={"job_cards": True},
                )

        pending = self.next_unprocessed()
        if pending is not None:
            return pending, VisionAction(
                action="click",
                target="job_card",
                coordinates=Coordinates(pending.x, pending.y),
                observation=f"Using cached/heuristic card {pending.title}",
                detections={"job_cards": True},
            )

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
