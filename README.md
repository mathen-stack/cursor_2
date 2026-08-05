# LinkedIn JD Collector Agent

Windows desktop EXE that uses an OpenRouter vision AI computer-use agent to collect original LinkedIn job descriptions after the user has manually opened a job search results page.

## Status

Architecture phase complete. Application logic not implemented yet.

## Documentation

- [Production Architecture](docs/ARCHITECTURE.md)
- [Technology Stack](docs/TECH_STACK.md)
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

See [TECH_STACK.md](docs/TECH_STACK.md) for rationale, limitations, and alternatives.

## System Layers

1. **Desktop Application** — Start/Stop, progress, logs, settings
2. **AI Vision Agent** — OpenRouter vision → structured JSON commands
3. **Computer Automation Layer** — mouse, keyboard, scroll, screenshots
4. **LinkedIn Navigation Engine** — page/job loops, pagination, completion
5. **JD Extraction Layer** — select, Ctrl+C, clipboard read
6. **Storage Layer** — folders, TXT files, completed-job tracking

## Intended Folder Layout

See [Repository Folder Structure](docs/ARCHITECTURE.md#7-repository-folder-structure). Module directories are scaffolded under `app/` and awaiting implementation.
