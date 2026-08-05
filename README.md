# LinkedIn JD Collector Agent

Windows desktop EXE that uses an OpenRouter vision AI computer-use agent to collect original LinkedIn job descriptions after the user has manually opened a job search results page.

## Status

Architecture and project structure are in place.  
**Implemented:**
- OpenRouter AI vision module (`ai/`)
- Mouse/keyboard automation (`automation/mouse_controller.py`, `keyboard_controller.py`)

Other modules remain stubs.

## Documentation

- [Production Architecture](docs/ARCHITECTURE.md)
- [Technology Stack](docs/TECH_STACK.md)
- [Project Structure](docs/PROJECT_STRUCTURE.md) — file-by-file explanation
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
