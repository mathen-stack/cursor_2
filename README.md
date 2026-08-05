# LinkedIn JD Collector Agent

Windows desktop EXE that uses an OpenRouter vision AI computer-use agent to collect original LinkedIn job descriptions after the user has manually opened a job search results page.

## Status

Architecture and project structure are in place.  
**Implemented:**
- OpenRouter AI vision module (`ai/`)
- Mouse/keyboard automation (`automation/`)
- LinkedIn workflow (`agent/workflow.py`, `linkedin/job_detector.py`, `linkedin/page_navigator.py`)
- JD extraction (`linkedin/jd_detector.py`, `automation/clipboard.py`) — locate → select → Ctrl+C → exact text
- File storage (`storage/`) → `Documents/LinkedIn_JD/Company_Title_Date_Time.txt` with URL/timestamp/raw JD; duplicate-safe
- PyQt6 UI (`ui/`, `main.py`, `agent/controller.py`) — Start/Pause/Stop/Open Folder, settings, log panel
- Supporting: screenshot capture, state manager

### Run UI

```bash
cd linkedin_jd_collector
pip install -r requirements.txt
python main.py
```

### Package Windows EXE

Build on Windows (or via GitHub Actions `Windows EXE Build`):

```powershell
cd linkedin_jd_collector
powershell -ExecutionPolicy Bypass -File scripts\build_windows.ps1 -Installer
```

Outputs:
- `dist/LinkedIn_JD_Collector/LinkedIn_JD_Collector.exe`
- `dist/installer/LinkedIn_JD_Collector_Setup.exe` (with Inno Setup)

See [PACKAGING.md](docs/PACKAGING.md).

## Documentation

- [Production Architecture](docs/ARCHITECTURE.md)
- [Technology Stack](docs/TECH_STACK.md)
- [Project Structure](docs/PROJECT_STRUCTURE.md) — file-by-file explanation
- [Packaging / Windows EXE](docs/PACKAGING.md)
- [Data Flow](docs/DATA_FLOW.md)
- [AI Command Schema](docs/COMMAND_SCHEMA.md)

## Technology Stack

| Concern | Choice |
|---|---|
| Language | Python |
| Desktop UI | PyQt6 |
| Automation | PyAutoGUI + PyWinAuto |
| Screenshot | MSS + Pillow |
| AI | OpenRouter API (multimodal vision model) |
| Clipboard | Pyperclip |
| Packaging | PyInstaller → Windows EXE |

## Project layout

```
linkedin_jd_collector/
├── main.py
├── requirements.txt
├── .env
├── ui/            # PyQt6 desktop app
├── ai/            # OpenRouter vision agent
├── screen/        # MSS + Pillow capture
├── automation/    # mouse / keyboard / clipboard
├── linkedin/      # LinkedIn window/job/page/JD helpers
├── agent/         # controller, workflow FSM, state
├── storage/       # TXT files + completed-job history
└── build/         # PyInstaller EXE build
```

See [PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md) for what each file is responsible for.
