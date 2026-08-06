"""Smoke test for isolated worker CLI parsing / early failure path."""

from __future__ import annotations

from pathlib import Path

from agent.worker_main import run_worker


def test_worker_main_reports_failure_without_valid_backends(tmp_path: Path, monkeypatch):
    events = tmp_path / "events.jsonl"
    control = tmp_path / "control.json"
    heartbeat = tmp_path / "hb.txt"
    log_file = tmp_path / "worker.log"

    # Force workflow construction to fail quickly after imports.
    import agent.worker_main as wm

    class Boom(Exception):
        pass

    def boom_workflow(*args, **kwargs):
        raise Boom("forced init failure")

    monkeypatch.setattr(
        "agent.workflow.LinkedInWorkflow",
        boom_workflow,
        raising=False,
    )

    # Patch after imports inside run_worker by stubbing the class on the module
    # that run_worker imports from.
    import agent.workflow as workflow_mod

    monkeypatch.setattr(workflow_mod, "LinkedInWorkflow", boom_workflow)

    code = run_worker(
        [
            "--api-key",
            "sk-test",
            "--model",
            "test/model",
            "--output-dir",
            str(tmp_path / "out"),
            "--events-file",
            str(events),
            "--control-file",
            str(control),
            "--heartbeat-file",
            str(heartbeat),
            "--log-file",
            str(log_file),
        ]
    )
    assert code == 1
    assert events.exists()
    text = events.read_text(encoding="utf-8")
    assert "worker_failed" in text
