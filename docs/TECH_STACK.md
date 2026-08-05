# LinkedIn JD Collector Agent — Technology Stack

**Target:** Windows EXE desktop application  
**Primary language:** Python  

This document locks the production stack, explains selection rationale, lists limitations, and notes viable alternatives.

---

## 1. Stack Summary

| Concern | Choice |
|---|---|
| Language | Python 3.11+ |
| Desktop UI | PyQt6 |
| Mouse/keyboard automation | PyAutoGUI |
| Windows UI / window automation | PyWinAuto |
| Screenshot | MSS (+ Pillow for encode/transform) |
| AI provider | OpenRouter API |
| Vision model | Multimodal vision model via OpenRouter |
| Clipboard | Pyperclip |
| Packaging | PyInstaller |
| HTTP client (supporting) | `httpx` (recommended) |
| Config / env (supporting) | `python-dotenv` + local JSON/DPAPI for secrets |

---

## 2. Technology Decisions

### 2.1 Language — Python

**Why selected**

- Fastest path to glue vision AI, desktop UI, OS automation, and packaging in one codebase.
- Rich ecosystem for screenshots, input control, Win32 helpers, and HTTP.
- Matches the architecture already designed around a Python orchestration loop.
- Easier iteration on prompts, FSM logic, and validation than C#/C++ for this agent pattern.

**Limitations**

- GIL and interpreter overhead: fine for sequential UI automation, not for high-frequency parallel input.
- EXE size and cold start are larger than native apps.
- Some Win32 edge cases still need `ctypes` / `pywin32` escapes.
- Needs a Windows runtime environment with a real desktop session (not a headless service).

**Alternatives**

| Alternative | Tradeoff |
|---|---|
| C# / WPF / WinUI | Stronger native Windows UX and Win32 interop; slower AI/prototyping loop |
| Electron + Node | Familiar UI web stack; weaker reliable OS input/window control |
| AutoHotkey | Excellent hotkeys/macros; poor structured app architecture and AI integration |
| Go / Rust | Smaller binaries; thinner ecosystem for desktop agent + vision orchestration |

---

### 2.2 Desktop UI — PyQt6

**Why selected**

- Production-grade Windows desktop UI toolkit with mature widgets (controls, logs, settings forms, progress).
- Clear UI-thread vs worker-thread model (`QThread` / signals-slots), which fits Start/Stop agent orchestration.
- Better long-term maintainability than Tkinter for a multi-panel operator console.
- Can display live logs, progress counters, and settings without a web runtime.

**Limitations**

- Heavier dependency and larger packaged EXE than Tkinter/CustomTkinter.
- Licensing considerations: PyQt6 is GPL/commercial; for closed-source distribution, evaluate license or switch to PySide6.
- Styling modern UX takes more work than web frontends.
- Must keep all UI updates on the Qt main thread.

**Alternatives**

| Alternative | Tradeoff |
|---|---|
| **PySide6** (Qt for Python) | Near API-compatible; LGPL-friendly for many commercial cases |
| CustomTkinter | Lighter; weaker threading/component model for complex operator UIs |
| Dear PyGui | Fast; less conventional desktop app patterns |
| Electron / Tauri shell | Rich UI; more moving parts for local automation app |

**Recommendation note:** Keep PyQt6 as specified; if commercial licensing becomes a blocker, swap UI layer to **PySide6** with minimal code change.

---

### 2.3 Automation — PyAutoGUI + PyWinAuto

#### PyAutoGUI

**Why selected**

- Simple, reliable primitives for mouse move/click, scroll, and keyboard shortcuts (`Ctrl+C`, `Ctrl+A`).
- Ideal execution backend for AI-produced coordinates and hotkey commands.
- Cross-checked widely for desktop RPA-style flows.

**Limitations**

- Coordinate-based; sensitive to DPI scaling, multi-monitor layouts, and window moves.
- Failsafe (mouse corner abort) can surprise users if not configured intentionally.
- Not a semantic Windows UI Automation API — cannot natively “find button by AutomationId”.
- Timing is brittle without explicit waits/retries from the Navigation Engine.

**Alternatives**

| Alternative | Tradeoff |
|---|---|
| `pynput` | Good input hooks; slightly lower-level |
| Win32 `SendInput` via `ctypes`/`pywin32` | Most control; more code to maintain |
| `keyboard` / `mouse` packages | Narrower scope; less all-in-one |

#### PyWinAuto

**Why selected**

- Complements PyAutoGUI with Windows-aware window enumeration, focus, and UI Automation backend access.
- Useful for detecting/activating the LinkedIn browser window (Chrome/Edge) before screenshots and clicks.
- Helps reduce “wrong window” failures that pure coordinate tools cannot solve alone.

**Limitations**

- Browser *page content* (LinkedIn DOM inside Chromium) is not reliably controllable via Win32 UIA the way native apps are.
- Therefore LinkedIn job cards / JD text are still handled by vision + coordinates, not PyWinAuto selectors.
- Backend differences (`uia` vs `win32`) can behave inconsistently across browser hosts.
- Overusing PyWinAuto for in-page elements would violate the “no backend scrape / no DOM dependency” product rule.

**Division of responsibility**

| Tool | Use for |
|---|---|
| PyWinAuto | Find/focus browser window, window rectangle, top-level dialogs |
| PyAutoGUI | Clicks, moves, scrolls, hotkeys inside the focused window |

**Alternatives**

| Alternative | Tradeoff |
|---|---|
| `pygetwindow` + PyAutoGUI only | Simpler; weaker window/control introspection |
| Raw `win32gui` / `win32com` | Maximum control; more boilerplate |
| Playwright/Selenium | Powerful DOM control; **rejected** (LinkedIn API/DOM scraping style, not computer-use) |

---

### 2.4 Screenshot — MSS + Pillow

#### MSS

**Why selected**

- Very fast multi-monitor screen capture on Windows.
- Low overhead for the perception loop (capture → encode → OpenRouter).
- Can capture monitor regions corresponding to the target window bounds.

**Limitations**

- Captures pixels only; no accessibility metadata.
- Must combine with window rect from PyWinAuto/Win32 for “window-only” crops.
- Protected/fullscreen exclusive content and some overlay paths may not capture as expected.
- Rapid capture still needs throttling to control CPU and API cost.

#### Pillow

**Why selected**

- Standard image pipeline: crop, resize, compress, convert to PNG/JPEG for OpenRouter.
- Useful for debug artifacts and reducing payload size before upload.
- Complements MSS (MSS grabs; Pillow prepares).

**Limitations**

- Resize/compression can hurt OCR/UI-detail recognition if over-aggressive.
- Extra memory copies if not careful with capture→encode path.

**Alternatives**

| Alternative | Tradeoff |
|---|---|
| `pyautogui.screenshot()` (Pillow/ImageGrab under the hood) | Convenient; usually slower than MSS |
| `ImageGrab` / Qt `QScreen.grabWindow` | Viable; couples capture to UI toolkit |
| Windows Graphics Capture API | Modern/efficient; more native code complexity |
| OpenCV | Strong processing; heavier dependency for this use case |

---

### 2.5 AI — OpenRouter API + multimodal vision model

**Why selected**

- Single API gateway to multimodal vision models without wiring each provider SDK.
- Fits the architecture: send screenshot(s) + state prompt → receive structured JSON commands.
- Model flexibility: swap vision models without rewriting the automation stack.
- Keeps AI responsibility limited to perception/planning; Python owns actuation and storage.

**Limitations**

- Requires network access and a valid API key.
- Latency/cost per screenshot step; multi-page runs can be expensive without region crops and state-specific prompts.
- Model may hallucinate coordinates or controls; must enforce JSON schema + confidence gates + retries.
- Behavior varies by chosen model; prompt/schema must stay provider-agnostic.
- Rate limits and provider outages pause collection (`ERROR` / backoff).

**Model guidance**

- Use a **multimodal vision model** hosted through OpenRouter (image-in, text/JSON-out).
- Prefer models with strong UI/layout grounding for buttons/lists/panels.
- Keep model id configurable in Settings (no hardcode lock-in).

**Alternatives**

| Alternative | Tradeoff |
|---|---|
| OpenAI / Anthropic / Google APIs directly | Fewer gateway layers; less model portability |
| Local vision model (e.g. via Ollama) | Privacy/offline; typically weaker UI grounding + harder EXE ops |
| Classic CV + OCR only (no LLM) | Cheaper; brittle against LinkedIn UI changes |
| DOM/automation browsers | Not aligned with computer-use product constraints |

---

### 2.6 Clipboard — Pyperclip

**Why selected**

- Minimal, dependable clipboard read/write for Windows.
- Perfect for the required path: select JD → `Ctrl+C` → read clipboard → save raw text.
- Tiny dependency surface for packaging.

**Limitations**

- Global clipboard: concurrent user copy actions can race the agent.
- Does not itself perform selection; depends on Automation + AI focus quality.
- Large clipboard contents and non-text formats need validation before save.
- On some systems, clipboard access timing requires a short wait after `Ctrl+C`.

**Alternatives**

| Alternative | Tradeoff |
|---|---|
| `ctypes` / Win32 clipboard APIs | More control (CF_UNICODETEXT); more code |
| Qt clipboard (`QClipboard`) | Ties extraction to UI toolkit thread considerations |
| PowerShell clip commands | Process overhead; poorer UX in-loop |

---

### 2.7 Packaging — PyInstaller

**Why selected**

- Mature Python → Windows EXE packaging path.
- Can ship onefile or onedir builds including PyQt6, MSS, and automation deps.
- Fits operator distribution: double-click EXE, local settings, no Python install required for end users.

**Limitations**

- Large artifact size (Qt + AI HTTP stack + imaging).
- Antivirus false positives occasionally on frozen binaries.
- Hidden-import / dynamic-import issues need explicit PyInstaller hooks.
- Debugging production issues is harder than running from source.
- Must include VC++ runtime expectations and test on clean Windows machines.

**Alternatives**

| Alternative | Tradeoff |
|---|---|
| Nuitka | Often faster/smaller; more complex build pipeline |
| cx_Freeze | Viable; less common defaults for Qt apps |
| Briefcase / Beeware | App-focused packaging; heavier paradigm shift |
| Ship Python + venv | Simpler for devs; worse for non-technical operators |

---

## 3. Supporting Libraries (recommended)

| Library | Role | Why |
|---|---|---|
| `httpx` | OpenRouter HTTP client | Modern timeouts/retries; clean JSON posts for multimodal payloads |
| `pydantic` | Command schema validation | Strict structured JSON validation for AI responses |
| `python-dotenv` | Local secret loading in dev | Simple `.env` for `OPENROUTER_API_KEY` |
| `pywin32` (optional) | DPI/window helpers if PyWinAuto gaps appear | Escape hatch for Win32 specifics |

These do not replace the mandated stack; they harden production behavior.

---

## 4. Mapping Stack → Architecture Layers

| Architecture layer | Technologies |
|---|---|
| Desktop Application | PyQt6 |
| AI Vision Agent | OpenRouter API + multimodal vision model (+ `httpx`/`pydantic`) |
| Computer Automation Layer | PyAutoGUI, PyWinAuto, MSS, Pillow |
| LinkedIn Navigation Engine | Python FSM (stdlib + core models) |
| JD Extraction Layer | PyAutoGUI hotkeys + Pyperclip |
| Storage Layer | Python stdlib `pathlib` / JSONL |
| Distribution | PyInstaller → Windows EXE |

---

## 5. Known Stack Risks & Mitigations

| Risk | Mitigation |
|---|---|
| DPI/multi-monitor coordinate drift | Capture window rect via PyWinAuto; use window-relative coords; calibrate with screenshot size |
| PyQt6 licensing for closed source | Confirm license posture or migrate UI to PySide6 |
| Clipboard races | Clear/mark sentinel, verify clipboard changed, retry extract |
| Vision coordinate errors | Schema validation, confidence threshold, replan loop, action budgets |
| PyInstaller missing modules | Explicit hooks for PyQt6, MSS, pywinauto backends; CI build smoke test |
| LinkedIn UI changes | Vision-first design (no DOM selectors) absorbs layout churn better than scrapers |

---

## 6. Decision Status

**Accepted stack for implementation:**

- Python + PyQt6 + PyAutoGUI + PyWinAuto + MSS + Pillow + OpenRouter multimodal vision + Pyperclip + PyInstaller

No application logic is implemented in this stack-selection phase.
