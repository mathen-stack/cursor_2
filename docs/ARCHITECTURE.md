# LinkedIn JD Collector Agent — Production Architecture

**Product:** LinkedIn JD Collector Agent  
**Platform:** Windows Desktop EXE  
**AI Provider:** OpenRouter (vision-capable model)  
**Approach:** Computer-use agent (screenshot → vision plan → OS actuation)  
**Non-goals:** LinkedIn API, backend scraping, JD parsing/summarization, manual copy/paste

---

## 1. System Overview

The system is a local Windows application that takes over after the user has manually logged into LinkedIn and opened a job search results page. It runs a closed perception–planning–action loop:

1. Capture the LinkedIn browser window.
2. Send screenshot(s) to OpenRouter vision.
3. Receive structured JSON commands.
4. Execute mouse/keyboard actions locally.
5. Copy each job’s original “About the job” text via clipboard.
6. Persist raw JD text to disk and continue until all pages are done.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        DESKTOP APPLICATION (EXE)                         │
│  Start / Stop / Pause   │   Progress   │   Logs   │   Settings           │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │ control / status / events
┌───────────────────────────────▼──────────────────────────────────────────┐
│                     LINKEDIN NAVIGATION ENGINE (FSM)                     │
│         page loop  →  job loop  →  extract  →  paginate  →  complete     │
└───────┬─────────────────────┬─────────────────────┬──────────────────────┘
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐   ┌──────────────────┐   ┌────────────────────┐
│ AI VISION     │   │ COMPUTER         │   │ JD EXTRACTION      │
│ AGENT         │   │ AUTOMATION LAYER │   │ LAYER              │
│ OpenRouter    │   │ mouse/keyboard/  │   │ select → Ctrl+C →  │
│ structured    │   │ scroll/focus     │   │ clipboard → text   │
│ JSON commands │   └────────▲─────────┘   └─────────┬──────────┘
└───────┬───────┘            │                       │
        │ screenshots        │ actions               │ raw JD text
        ▼                    │                       ▼
┌───────────────┐            │             ┌────────────────────┐
│ Screen /      │────────────┘             │ STORAGE LAYER      │
│ Window Capture│                          │ folders / TXT /    │
└───────────────┘                          │ completed-job index│
                                           └────────────────────┘
```

---

## 2. Architecture Diagram (Layered)

```
+--------------------------------------------------------------------------+
|                         PRESENTATION LAYER                               |
|  desktop_app/                                                            |
|  +---------------+ +--------------+ +------------+ +-------------------+ |
|  | ControlPanel  | | ProgressView | | LogConsole | | SettingsManager   | |
|  +-------+-------+ +------+-------+ +-----+------+ +---------+---------+ |
+----------|---------------|-------------|-------------|-----------|-------+
           |               |             |             |
+----------v---------------v-------------v-------------v-------------------+
|                         ORCHESTRATION LAYER                              |
|  navigation/                                                             |
|  +--------------------------------------------------------------------+  |
|  |              LinkedInNavigationEngine (FSM Orchestrator)           |  |
|  |  INIT -> LOCATE_WINDOW -> SCAN_PAGE -> OPEN_JOB -> WAIT_DETAIL ->  |  |
|  |  EXTRACT_JD -> SAVE -> NEXT_JOB -> PAGINATE -> COMPLETE            |  |
|  |  (+ PAUSED | ERROR | NEED_USER)                                    |  |
|  +----------------------------------+---------------------------------+  |
+-------------------------------------|------------------------------------+
                                      |
         +----------------------------+----------------------------+
         |                            |                            |
+--------v---------+  +---------------v--------+  +----------------v-----+
| AI VISION AGENT  |  | COMPUTER AUTOMATION    |  | JD EXTRACTION LAYER  |
| ai_agent/        |  | LAYER  automation/     |  | extraction/          |
|                  |  |                        |  |                      |
| - PromptBuilder  |  | - MouseController      |  | - TextSelector      |
| - OpenRouter     |  | - KeyboardController   |  | - ClipboardReader    |
|   Client         |  | - ScrollController     |  | - ClipboardValidator |
| - Response       |  | - WindowManager        |  |                      |
|   Validator      |  | - ScreenshotService    |  | (raw text only)      |
| - LayoutParser   |  | - ActionExecutor       |  |                      |
+--------+---------+  +---------------+--------+  +----------+-----------+
         |                            |                      |
         | HTTPS                      | Win32 / OS APIs      |
         v                            v                      v
  OpenRouter API               Browser Window         +----------------+
  (vision model)               (Chrome/Edge/...)      | STORAGE LAYER  |
                                                      | storage/       |
                                                      | - FolderMgr    |
                                                      | - JdFileWriter |
                                                      | - JobTracker   |
                                                      | - IndexStore   |
                                                      +----------------+
```

---

## 3. Component Descriptions (Six Required Layers)

### 3.1 Desktop Application

| Module | Responsibility |
|---|---|
| `ControlPanel` | Start / Stop / Pause / Resume agent lifecycle |
| `ProgressView` | Show current page, job index, saved count, FSM state |
| `LogConsole` | Stream timestamped operational logs (info/warn/error) |
| `SettingsManager` | Persist OpenRouter key, model, output root, delays, limits |
| `AppEventBus` | Push agent events to UI without blocking the automation thread |
| `EmergencyStop` | Global hotkey (e.g. `Ctrl+Shift+Esc`) to halt actuation immediately |

**Does not:** call OpenRouter directly for planning, click UI elements, or write JD files.

---

### 3.2 AI Vision Agent

| Module | Responsibility |
|---|---|
| `ScreenshotPacketBuilder` | Attach window screenshot (+ optional region crops) to the request |
| `PromptBuilder` | State-specific prompts (scan list / wait detail / extract / paginate) |
| `OpenRouterClient` | HTTPS chat/completions with image inputs |
| `ResponseValidator` | Parse + schema-validate structured JSON commands |
| `LayoutUnderstanding` | Detect browser window, job cards, JD section, Next/Prev buttons |
| `ConfidenceGate` | Reject low-confidence plans; request replan or pause |

**AI is responsible only for:**

- Screen understanding
- UI element detection
- Action planning as structured JSON

**AI must not:** invent JD text, summarize, or call OS APIs.

Provider: **OpenRouter API** (vision-capable model).

Canonical command example:

```json
{
  "action": "click",
  "target": "job_card",
  "coordinates": {
    "x": 450,
    "y": 300
  }
}
```

Full schema: [COMMAND_SCHEMA.md](./COMMAND_SCHEMA.md).

---

### 3.3 Computer Automation Layer

| Module | Responsibility |
|---|---|
| `WindowManager` | Enumerate/find LinkedIn browser window; focus; report bounds |
| `ScreenshotService` | Capture window bitmap; encode PNG/JPEG for AI |
| `MouseController` | Mouse movement, clicking, drag-select |
| `KeyboardController` | Keyboard shortcuts including `Ctrl+C`, `Ctrl+A` |
| `ScrollController` | Scrolling on job list or detail panel |
| `ActionExecutor` | Translate validated JSON command → OS input with delays/jitter |
| `InputGuard` | Enforce pause flag, kill-switch, max actions/sec |

**Does not:** decide *what* to click; only executes validated plans.

---

### 3.4 LinkedIn Navigation Engine

| Module | Responsibility |
|---|---|
| `NavigationEngine` | Own the FSM; drive the full multi-page collection run |
| `PageProcessor` | Process every job on the current page |
| `JobCardTracker` | Track which cards on the page are pending/done |
| `PaginationController` | Move between pages via Next/Previous detection |
| `CompletionDetector` | Detect when collection is complete |
| `RetryPolicy` | Per-state retries, backoff, escalation to `NEED_USER` |

#### FSM (production states)

```
INIT
  → LOCATE_WINDOW
      → SCAN_PAGE          (AI detects job cards)
          → OPEN_JOB       (click next unprocessed card)
              → WAIT_DETAIL
                  → PREPARE_JD   (scroll to About the job / Show more)
                      → EXTRACT_JD
                          → SAVE_JD
                              → NEXT_JOB ──(more jobs)──→ OPEN_JOB
                                         └─(page done)─→ PAGINATE
                                              ├─ next available → SCAN_PAGE
                                              └─ no next        → COMPLETE
  NEED_USER / PAUSED / ERROR  ← any state on anomaly
```

---

### 3.5 JD Extraction Layer

| Module | Responsibility |
|---|---|
| `JdSectionFocuser` | Ensure “About the job” is in view |
| `ShowMoreExpander` | Click “Show more” when JD is collapsed |
| `TextSelector` | Select JD text (region select and/or focused `Ctrl+A`) |
| `ClipboardReader` | Issue `Ctrl+C`, wait, read clipboard |
| `ClipboardValidator` | Ensure clipboard changed and is non-empty |
| `RawJdPayload` | Pass-through object: raw text + naming metadata |

**Does not:** paraphrase, summarize, translate, or structurally parse JD content.

---

### 3.6 Storage Layer

| Module | Responsibility |
|---|---|
| `FolderManager` | Create run folder tree under configured output root |
| `JdFileWriter` | Save raw JD `.txt` files atomically |
| `JobTracker` | Track completed jobs to avoid duplicates |
| `IndexStore` | Append-only `index.jsonl` of run metadata |
| `RunManifest` | Store run settings snapshot, start/end time, counts |

#### Runtime output layout

```
{output_root}/
  runs/
    2026-08-05_014500/
      manifest.json
      index.jsonl
      jds/
        001_software_engineer_example_corp.txt
        002_data_analyst_acme.txt
      logs/
        agent.log
      debug/                    # optional, settings-gated
        step_00012.png
```

---

## 4. Data Flow

Detailed sequences: [DATA_FLOW.md](./DATA_FLOW.md).

### 4.1 End-to-end collection flow

```
User
 │  (manual) open browser → login LinkedIn → search/filter → results page
 ▼
Desktop Application ──Start──▶ NavigationEngine
                                  │
                                  │ 1) locate + focus LinkedIn window
                                  ▼
                            ScreenshotService ──image──▶ AI Vision Agent
                                  ▲                         │
                                  │                         │ structured JSON
                                  │                         ▼
                                  │                   ResponseValidator
                                  │                         │
                                  │                         ▼
                                  │                   ActionExecutor ──▶ OS mouse/keyboard
                                  │                         │
                                  │                         │ UI changes
                                  └──────── re-capture ─────┘
                                                 │
                         (when action = extract path)
                                                 ▼
                                      JD Extraction Layer
                                       select → Ctrl+C → clipboard
                                                 │
                                                 ▼
                                           Storage Layer
                                        write TXT + update index
                                                 │
                                                 ▼
                                      Progress/Logs → Desktop UI
```

### 4.2 Per-job micro-flow

| Step | Producer | Consumer | Payload |
|---|---|---|---|
| 1 | `ScreenshotService` | `OpenRouterClient` | PNG/JPEG + FSM state |
| 2 | `AI Vision Agent` | `NavigationEngine` | JSON command (`click` job_card) |
| 3 | `ActionExecutor` | Browser | Click |
| 4 | `ScreenshotService` | `AI Vision Agent` | Verify detail loaded / About the job |
| 5 | `AI Vision Agent` | `ActionExecutor` | scroll / show_more / select_region / hotkey |
| 6 | `ClipboardReader` | `JdFileWriter` | raw text string |
| 7 | `JobTracker` | `PageProcessor` | mark job complete |
| 8 | `AppEventBus` | UI | progress + log events |

### 4.3 Pagination flow

```
PageProcessor reports page complete
        │
        ▼
AI asked: detect next_button / prev_button + enabled state
        │
        ├─ next enabled → click next_button → wait list refresh → SCAN_PAGE
        └─ next disabled/absent → all_done → COMPLETE
```

---

## 5. Module Responsibilities (Summary Matrix)

| Layer | Owns | Does not own |
|---|---|---|
| Desktop Application | UX, lifecycle, settings, log display | Vision planning, OS clicks, file formats beyond config |
| AI Vision Agent | Layout understanding, element detection, JSON plans | Mouse/keyboard, clipboard, disk writes |
| Computer Automation | Screenshots, focus, clicks, scrolls, hotkeys | Deciding targets, storing JDs |
| LinkedIn Navigation Engine | Page/job loops, pagination, completion, retries | Model HTTP, raw file I/O details |
| JD Extraction | Selection, copy, clipboard validation, raw payload | AI prompts, pagination policy |
| Storage | Folders, TXT persistence, completed-job tracking | UI, automation |

---

## 6. Cross-Cutting Production Concerns

### 6.1 Threading model

- **UI thread:** Desktop Application only.
- **Agent worker thread:** NavigationEngine + AI + Automation + Extraction + Storage.
- Communication via thread-safe queue / event bus.
- Stop/Pause are cooperative flags checked between actions.

### 6.2 Reliability

- Schema validation on every AI response.
- Screenshot hash loop detection (stuck UI).
- Per-job and per-page action budgets.
- Clipboard change detection before save.
- Idempotent saves via `JobTracker` signatures (title+company+page+index hash).

### 6.3 Security

- OpenRouter API key stored locally (DPAPI-protected preferred on Windows); never written to JD files or debug logs.
- Debug screenshots optional and local-only.
- No LinkedIn credentials stored by the app (user logs in manually).

### 6.4 Observability

- Structured logs: `timestamp, state, action, target, confidence, result`.
- Progress counters: pages done, jobs saved, errors, need_user count.
- Optional step screenshots for failed actions.

### 6.5 Packaging

- Python app bundled with PyInstaller to Windows EXE.
- External: valid display session, user-installed browser, network access to OpenRouter.

---

## 7. Repository Folder Structure

```
linkedin-jd-collector-agent/
├── README.md
├── docs/
│   ├── ARCHITECTURE.md              # this document
│   ├── DATA_FLOW.md                 # sequence-oriented companion
│   └── COMMAND_SCHEMA.md            # JSON command contract
├── app/
│   ├── __init__.py
│   ├── main.py                      # EXE entrypoint
│   ├── desktop_app/                 # (1) Desktop Application
│   │   ├── __init__.py
│   │   ├── app_window.py
│   │   ├── control_panel.py
│   │   ├── progress_view.py
│   │   ├── log_console.py
│   │   ├── settings_manager.py
│   │   └── event_bus.py
│   ├── ai_agent/                    # (2) AI Vision Agent
│   │   ├── __init__.py
│   │   ├── openrouter_client.py
│   │   ├── prompt_builder.py
│   │   ├── response_validator.py
│   │   ├── command_schema.py
│   │   └── vision_agent.py
│   ├── automation/                  # (3) Computer Automation Layer
│   │   ├── __init__.py
│   │   ├── window_manager.py
│   │   ├── screenshot_service.py
│   │   ├── mouse_controller.py
│   │   ├── keyboard_controller.py
│   │   ├── scroll_controller.py
│   │   ├── action_executor.py
│   │   └── input_guard.py
│   ├── navigation/                  # (4) LinkedIn Navigation Engine
│   │   ├── __init__.py
│   │   ├── fsm.py
│   │   ├── navigation_engine.py
│   │   ├── page_processor.py
│   │   ├── job_card_tracker.py
│   │   ├── pagination_controller.py
│   │   └── completion_detector.py
│   ├── extraction/                  # (5) JD Extraction Layer
│   │   ├── __init__.py
│   │   ├── jd_extractor.py
│   │   ├── text_selector.py
│   │   ├── clipboard_reader.py
│   │   └── clipboard_validator.py
│   ├── storage/                     # (6) Storage Layer
│   │   ├── __init__.py
│   │   ├── folder_manager.py
│   │   ├── jd_file_writer.py
│   │   ├── job_tracker.py
│   │   └── index_store.py
│   ├── core/                        # shared domain types & config
│   │   ├── __init__.py
│   │   ├── config.py
│   │   ├── models.py
│   │   ├── errors.py
│   │   └── constants.py
│   └── worker/
│       ├── __init__.py
│       └── agent_worker.py
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
│       └── screenshots/
├── resources/
│   ├── app.ico
│   └── default_config.json
├── scripts/
│   ├── build_exe.ps1
│   └── run_dev.ps1
├── requirements.txt
├── pyproject.toml
└── .env.example
```

---

## 8. Interface Contracts Between Layers

```
DesktopApplication
  → AgentWorker.start(config) / pause() / stop()
  ← events: StateChanged, LogLine, JobSaved, NeedUser, Completed

NavigationEngine
  → VisionAgent.plan(state, screenshot, context) -> ActionCommand
  → ActionExecutor.execute(command) -> ActionResult
  → JdExtractor.extract(context) -> RawJdPayload
  → Storage.save(payload) -> JobRecord

VisionAgent
  → OpenRouterClient.complete(messages) -> raw JSON
  → ResponseValidator.validate(raw) -> ActionCommand

JdExtractor
  → ActionExecutor (select/hotkey)
  → ClipboardReader.read() -> str

Storage
  → FolderManager.ensure_run_dirs()
  → JdFileWriter.write(text, meta) -> path
  → JobTracker.mark_done(signature)
  → IndexStore.append(record)
```

---

## 9. Production Runtime Sequence (Happy Path)

1. User configures settings and clicks **Start**.
2. `AgentWorker` launches `NavigationEngine`.
3. `WindowManager` finds LinkedIn browser window; focuses it.
4. Engine enters `SCAN_PAGE`; screenshot sent to OpenRouter.
5. AI returns job card coordinates for unprocessed cards.
6. Engine clicks card → waits → verifies detail panel.
7. AI locates “About the job” (and Show more if needed).
8. Extraction layer selects/copies; clipboard validated.
9. Storage writes TXT + index; UI progress updates.
10. Repeat jobs until page done.
11. AI detects Next; engine paginates; repeat from step 4.
12. AI/`CompletionDetector` signals `all_done` → UI shows Complete.

---

## 10. Failure & Escalation Model

| Condition | System response |
|---|---|
| Window not found / ambiguous | `NEED_USER` + UI instruction |
| Low AI confidence | Re-screenshot + replan (N times) then pause |
| Detail panel timeout | Reclick job card; then pause |
| Clipboard unchanged | Retry select/copy; then pause |
| CAPTCHA / login interstitial | `need_user` action → Pause |
| Repeated identical screenshots | Error: stuck loop → Stop |
| OpenRouter HTTP/API errors | Retry with backoff; then Error state |
| Disk write failure | Error state; preserve in-memory tracker |

---

## 11. Definition of Production-Ready

- All six layers implemented and wired through `NavigationEngine`.
- Structured JSON command contract enforced.
- Multi-page collection with completion detection.
- Duplicate job suppression via `JobTracker`.
- Pause / Stop / emergency kill-switch working.
- Settings persisted; API key not leaked into logs/files.
- Windows EXE packaging via PyInstaller.
- Unit tests for FSM, validator, tracker; fixture-based vision contract tests.

---

## 12. Next Implementation Order (when coding begins)

1. `core` models + config
2. `automation` primitives
3. `ai_agent` OpenRouter + schema
4. `storage` + `extraction`
5. `navigation` FSM
6. `desktop_app` + `worker`
7. packaging + hardening

**No application logic is implemented in this document phase.**
