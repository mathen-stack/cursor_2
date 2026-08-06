"""Tests for screenshot→screen coordinate mapping."""

from __future__ import annotations

from screen.screenshot import ScreenshotResult


def test_to_screen_identity():
    shot = ScreenshotResult(image_bytes=b"x", width=100, height=50)
    assert shot.to_screen(10, 20) == (10, 20)


def test_to_screen_scaled_and_offset():
    # Image was resized 2x smaller; origin offset on monitor
    shot = ScreenshotResult(
        image_bytes=b"x",
        width=800,
        height=600,
        scale_x=2.0,
        scale_y=2.0,
        offset_left=100,
        offset_top=50,
        source_width=1600,
        source_height=1200,
    )
    assert shot.to_screen(10, 20) == (120, 90)
    assert shot.to_screen_region(0, 0, 10, 10) == (100, 50, 120, 70)
