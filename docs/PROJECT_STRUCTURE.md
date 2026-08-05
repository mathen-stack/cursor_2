# LinkedIn JD Collector Agent — Project Structure

Canonical source tree (structure only; **not implemented yet**):

```
linkedin_jd_collector/
├── main.py
├── requirements.txt
├── .env
├── .env.example
├── ui/
│   ├── main_window.py
│   ├── settings.py
│   └── logger.py
├── ai/
│   ├── openrouter_client.py
│   ├── vision_agent.py
│   └── prompt_templates.py
├── screen/
│   ├── screenshot.py
│   └── monitor.py
├── automation/
│   ├── mouse_controller.py
│   ├── keyboard_controller.py
│   └── clipboard.py
├── linkedin/
│   ├── linkedin_detector.py
│   ├── job_detector.py
│   ├── page_navigator.py
│   └── jd_detector.py
├── agent/
│   ├── controller.py
│   ├── workflow.py
│   └── state_manager.py
├── storage/
│   ├── file_manager.py
│   └── history.py
└── build/
    └── build_exe.py
```

---

## Root

| File | Role |
|---|---|
| `main.py` | EXE/app entrypoint. Boots PyQt6, opens `ui/main_window.py`, starts the event loop. |
| `requirements.txt` | Python dependencies for the locked stack (PyQt6, PyAutoGUI, PyWinAuto, MSS, Pillow, Pyperclip, httpx, PyInstaller, etc.). |
| `.env` | Local secrets/config (`OPENROUTER_API_KEY`, model id, output dir). Placeholder only in repo. |
| `.env.example` | Safe template operators copy to `.env`. |

---

## `ui/` — Desktop Application (PyQt6)

| File | Role |
|---|---|
| `main_window.py` | Main window shell: Start/Stop/Pause, progress area, hosts logger/settings. |
| `settings.py` | Settings form + persistence (API key, model, output path, delays, limits). |
| `logger.py` | On-screen log console; bridges background agent log events to the UI thread. |

---

## `ai/` — AI Vision Agent (OpenRouter)

| File | Role |
|---|---|
| `openrouter_client.py` | HTTP client for OpenRouter multimodal requests (screenshot + prompt → model text). |
| `vision_agent.py` | High-level planner: builds requests, validates structured JSON commands, returns actions. |
| `prompt_templates.py` | State-specific prompts (scan jobs, open job, extract JD, paginate, recover). |

---

## `screen/` — Capture

| File | Role |
|---|---|
| `screenshot.py` | Capture/crop/encode screenshots with MSS + Pillow for vision input and debug. |
| `monitor.py` | Monitor/window geometry helpers for multi-monitor coordinate safety. |

---

## `automation/` — Computer Automation Layer

| File | Role |
|---|---|
| `mouse_controller.py` | Mouse move/click/drag/scroll (PyAutoGUI), used for AI coordinate actions. |
| `keyboard_controller.py` | Hotkeys/key taps (including `Ctrl+A`, `Ctrl+C`). |
| `clipboard.py` | Read/validate clipboard text via Pyperclip after copy. |

---

## `linkedin/` — LinkedIn Navigation Helpers

| File | Role |
|---|---|
| `linkedin_detector.py` | Find/focus the browser window containing LinkedIn. |
| `job_detector.py` | Interpret vision results for left-list job cards; track pending/done cards. |
| `page_navigator.py` | Next/Previous pagination actions and page-complete detection. |
| `jd_detector.py` | Detect detail panel / “About the job” / Show more for extraction readiness. |

---

## `agent/` — Orchestration

| File | Role |
|---|---|
| `controller.py` | UI-facing controller: start/pause/stop worker, emit progress/log events. |
| `workflow.py` | Core FSM/collection loop coordinating AI, automation, LinkedIn helpers, storage. |
| `state_manager.py` | Current run state (FSM state, page/job counters, pause flags, context snapshot). |

---

## `storage/` — Persistence

| File | Role |
|---|---|
| `file_manager.py` | Create run folders; save raw JD `.txt` files and manifest/logs. |
| `history.py` | Track completed jobs / index.jsonl to skip duplicates and support resume. |

---

## `build/` — Packaging

| File | Role |
|---|---|
| `build_exe.py` | PyInstaller build script targeting `main.py` for Windows EXE output. |

---

## Mapping to architecture layers

| Architecture layer | Project packages/files |
|---|---|
| Desktop Application | `ui/*`, `main.py` |
| AI Vision Agent | `ai/*` |
| Computer Automation Layer | `automation/*`, `screen/*` |
| LinkedIn Navigation Engine | `agent/workflow.py`, `linkedin/*` |
| JD Extraction Layer | `linkedin/jd_detector.py`, `automation/keyboard_controller.py`, `automation/clipboard.py` |
| Storage Layer | `storage/*` |

---

## Status

All listed modules currently contain **documentation stubs only**. No runtime behavior is implemented yet.
