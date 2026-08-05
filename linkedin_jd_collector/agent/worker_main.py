"""
Agent worker process entrypoint.

Runs outside the Qt UI process so a native crash in mss/pyautogui/pywinauto
cannot auto-close the main window.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
import traceback
from pathlib import Path


def _ensure_import_path() -> None:
    root = Path(__file__).resolve().parents[1]
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))


def _write_jsonl(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(payload, ensure_ascii=False, default=str) + "\n")
        fh.flush()


def _heartbeat(path: Path, note: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"{time.time():.3f} {note}\n", encoding="utf-8")


def run_worker(argv: list[str] | None = None) -> int:
    _ensure_import_path()

    parser = argparse.ArgumentParser(prog="agent-worker")
    parser.add_argument("--api-key", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--events-file", required=True)
    parser.add_argument("--control-file", required=True)
    parser.add_argument("--heartbeat-file", required=True)
    parser.add_argument("--log-file", required=True)
    args = parser.parse_args(argv)

    events_path = Path(args.events_file)
    control_path = Path(args.control_file)
    heartbeat_path = Path(args.heartbeat_file)
    log_path = Path(args.log_file)

    # Fresh event stream for this run
    try:
        if events_path.exists():
            events_path.unlink()
    except OSError:
        pass
    if control_path.exists():
        try:
            control_path.unlink()
        except OSError:
            pass

    log_path.parent.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        handlers=[
            logging.FileHandler(log_path, encoding="utf-8"),
            logging.StreamHandler(sys.stderr),
        ],
        force=True,
    )
    logger = logging.getLogger("agent.worker_main")

    def emit(name: str, **payload) -> None:
        _write_jsonl(
            events_path,
            {"name": name, "payload": payload, "ts": time.time()},
        )
        _heartbeat(heartbeat_path, name)

    def poll_control() -> dict:
        if not control_path.exists():
            return {}
        try:
            return json.loads(control_path.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            return {}

    try:
        _heartbeat(heartbeat_path, "worker_boot")
        emit("log", message="Agent worker process started", level="INFO")

        os.environ["OPENROUTER_API_KEY"] = args.api_key.strip()
        os.environ["OPENROUTER_MODEL"] = args.model.strip()
        os.environ["OUTPUT_DIR"] = args.output_dir.strip()
        # Avoid Win32 hooks / pywinauto in the worker unless explicitly enabled.
        os.environ.setdefault("ENABLE_EMERGENCY_HOTKEY", "0")
        os.environ.setdefault("ENABLE_PYWINAUTO", "0")

        if sys.platform.startswith("win"):
            try:
                import pythoncom

                pythoncom.CoInitialize()
                _heartbeat(heartbeat_path, "com_ready")
            except Exception:  # noqa: BLE001
                logger.debug("CoInitialize skipped", exc_info=True)

        from agent.state_manager import StateManager
        from agent.workflow import LinkedInWorkflow, WorkflowConfig, WorkflowError
        from automation.safety import default_guard
        from storage.file_manager import FileManager
        from storage.history import HistoryStore

        _heartbeat(heartbeat_path, "imports_ok")
        default_guard.clear_emergency_stop()
        state = StateManager()
        files = FileManager(args.output_dir)
        history = HistoryStore.create(files.output_root)
        config = WorkflowConfig(output_dir=args.output_dir)

        def on_event(name: str, payload: dict) -> None:
            emit(name, **(payload or {}))
            ctrl = poll_control()
            if ctrl.get("stop"):
                state.request_stop()
                default_guard.trigger_emergency_stop("ui stop")
            if ctrl.get("pause"):
                state.request_pause()
                default_guard.pause()
            elif ctrl.get("resume"):
                state.resume()
                default_guard.resume()

        _heartbeat(heartbeat_path, "construct_workflow")
        workflow = LinkedInWorkflow(
            config=config,
            state=state,
            file_manager=files,
            history=history,
            guard=default_guard,
            on_event=on_event,
        )
        _heartbeat(heartbeat_path, "workflow_ready")
        emit("log", message="Workflow ready; starting collection loop", level="INFO")

        result = workflow.run()
        snap = result.snapshot()
        emit("worker_finished", **snap)
        _heartbeat(heartbeat_path, "worker_finished")
        return 0
    except Exception as exc:  # noqa: BLE001
        tb = traceback.format_exc()
        logger.exception("Worker process failed")
        emit(
            "worker_failed",
            error=str(exc),
            traceback=tb,
        )
        _heartbeat(heartbeat_path, f"worker_failed:{exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(run_worker())
