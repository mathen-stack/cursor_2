# LinkedIn JD Collector Agent — Data Flow

Companion to [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## 1. Primary Runtime Data Flow

```
┌────────┐   Start/Pause/Stop/Settings    ┌────────────────────┐
│  User  │ ─────────────────────────────▶ │ Desktop Application│
└────────┘                                └─────────┬──────────┘
     │                                              │
     │ manual: browser + LinkedIn login/search      │ start worker
     ▼                                              ▼
┌──────────────┐                          ┌─────────────────────┐
│ Browser w/   │ ◀── focus/click/scroll ─ │ Navigation Engine   │
│ LinkedIn Jobs│ ── screenshot ─────────▶ │ (FSM)               │
└──────────────┘                          └─────────┬───────────┘
                                                    │
                    ┌───────────────────────────────┼───────────────────────────────┐
                    ▼                               ▼                               ▼
           ┌────────────────┐              ┌────────────────┐              ┌────────────────┐
           │ AI Vision Agent│              │ Automation     │              │ JD Extraction  │
           │ (OpenRouter)   │              │ Layer          │              │ Layer          │
           └───────┬────────┘              └────────▲───────┘              └───────┬────────┘
                   │ JSON commands                  │                              │
                   └────────────────────────────────┘                              │
                                                                                   ▼
                                                                          ┌────────────────┐
                                                                          │ Storage Layer  │
                                                                          │ TXT + index    │
                                                                          └───────┬────────┘
                                                                                  │
                                                                                  ▼
                                                                          Progress / Logs UI
```

---

## 2. Sequence: Process One Job

```
UI                Engine              VisionAI           Automation         Extraction         Storage
│                   │                    │                   │                  │                 │
│ Start             │                    │                   │                  │                 │
│──────────────────▶│                    │                   │                  │                 │
│                   │ locate window      │                   │                  │                 │
│                   │───────────────────▶│                   │                  │                 │
│                   │ screenshot         │                   │                  │                 │
│                   │───────────────────────────────────────▶│                  │                 │
│                   │ image              │                   │                  │                 │
│                   │───────────────────▶│                   │                  │                 │
│                   │ click job_card JSON│                   │                  │                 │
│                   │◀───────────────────│                   │                  │                 │
│                   │ execute click      │                   │                  │                 │
│                   │───────────────────────────────────────▶│                  │                 │
│                   │ wait + rescan      │                   │                  │                 │
│                   │───────────────────▶│                   │                  │                 │
│                   │ prepare JD actions │                   │                  │                 │
│                   │◀───────────────────│                   │                  │                 │
│                   │ extract            │                   │                  │                 │
│                   │──────────────────────────────────────────────────────────▶│                 │
│                   │                    │                   │ select/Ctrl+C    │                 │
│                   │                    │                   │◀─────────────────│                 │
│                   │                    │                   │ clipboard text   │                 │
│                   │                    │                   │─────────────────▶│                 │
│                   │ raw JD             │                   │                  │                 │
│                   │◀─────────────────────────────────────────────────────────│                 │
│                   │ save                                                    │────────────────▶│
│ JobSaved event    │                                                         │                 │
│◀──────────────────│                                                         │                 │
```

---

## 3. Sequence: Page Completion & Pagination

```
PageProcessor
  │ all cards on page marked done
  ▼
VisionAI.plan(state=PAGINATE)
  │
  ├─ action=next_page + next_button coords
  │     → Automation.click
  │     → wait for list refresh (screenshot delta / AI confirm)
  │     → JobCardTracker.reset_page()
  │     → SCAN_PAGE
  │
  └─ action=all_done (next disabled/absent)
        → NavigationEngine → COMPLETE
        → UI shows finished summary
```

---

## 4. Artifact Flow

| Artifact | Created by | Consumed by | Lifetime |
|---|---|---|---|
| Window screenshot (PNG/JPEG) | `ScreenshotService` | `VisionAgent` | Ephemeral (optional debug retain) |
| `ActionCommand` JSON | `VisionAgent` | `ActionExecutor` / Engine | Ephemeral (logged) |
| Clipboard text | OS / `ClipboardReader` | `JdFileWriter` | Ephemeral |
| `{nnn}_{title}_{company}.txt` | `JdFileWriter` | User / later tools | Durable |
| `index.jsonl` row | `IndexStore` | `JobTracker`, resume logic | Durable |
| `manifest.json` | `FolderManager` | Operator / audit | Durable |
| UI events | `AppEventBus` | Progress/Logs | Ephemeral |

---

## 5. Control-Plane vs Data-Plane

**Control-plane**

- Start / Pause / Stop  
- Settings load/save  
- Emergency kill-switch  
- `NEED_USER` acknowledgements  

**Data-plane**

- Screenshots → OpenRouter → JSON commands → OS inputs  
- Clipboard → TXT files → index/tracker  

These planes meet only at the `NavigationEngine` and `AppEventBus`.
