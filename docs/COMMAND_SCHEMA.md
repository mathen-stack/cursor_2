# AI Vision Agent — Structured JSON Command Schema

Provider: **OpenRouter API** (vision-capable model).  
Consumer: `ResponseValidator` → `NavigationEngine` / `ActionExecutor`.

---

## 1. Canonical Command Object

```json
{
  "action": "click",
  "target": "job_card",
  "coordinates": {
    "x": 450,
    "y": 300
  },
  "confidence": 0.86,
  "observation": "Left list shows 7 job cards; card 3 is unprocessed",
  "keys": null,
  "scroll": null,
  "wait_ms": null,
  "select": null,
  "metadata": {
    "job_index": 3,
    "job_title": "Software Engineer",
    "company": "Example Corp",
    "page_hint": 2,
    "about_job_visible": false,
    "show_more_visible": false,
    "next_enabled": true,
    "prev_enabled": true
  }
}
```

---

## 2. Field Reference

| Field | Type | Required | Description |
|---|---|---|---|
| `action` | string enum | yes | Command verb |
| `target` | string enum | conditional | Semantic UI target |
| `coordinates` | `{x:number,y:number}` | conditional | Window-relative pixels |
| `confidence` | number 0..1 | recommended | Planner confidence |
| `observation` | string | recommended | Short UI summary (not JD text) |
| `keys` | string[] | for `hotkey` | e.g. `["ctrl","c"]` |
| `scroll` | `{dx:number,dy:number}` | for `scroll` | Scroll deltas |
| `wait_ms` | number | for `wait` | Milliseconds to wait |
| `select` | `{x1,y1,x2,y2}` | for `select_region` | Drag-select box |
| `metadata` | object | optional | Extra UI/job signals |

---

## 3. `action` Enum

| action | Requires | Meaning |
|---|---|---|
| `click` | `target`, `coordinates` | Left click |
| `move` | `coordinates` | Move pointer |
| `scroll` | `coordinates`, `scroll` | Scroll at point |
| `hotkey` | `keys` | Keyboard shortcut |
| `type` | text in metadata | Reserved |
| `wait` | `wait_ms` | Settle delay |
| `select_region` | `select` | Drag text selection |
| `done_job` | — | Current job finished |
| `done_page` | — | Current page finished |
| `next_page` | usually `coordinates` of next | Go to next page |
| `all_done` | — | Collection complete |
| `need_user` | `observation` | Human intervention required |
| `noop` | — | Re-observe next tick |

---

## 4. `target` Enum

| target | Used for detecting / acting on |
|---|---|
| `browser_window` | LinkedIn-containing browser window |
| `job_card` | Left-rail job list card |
| `jd_section` | “About the job” region |
| `show_more` | Expand collapsed JD |
| `next_button` | Pagination Next |
| `prev_button` | Pagination Previous |
| `other` | Misc UI (modals, close, etc.) |

---

## 5. Coordinate Convention

- Origin: top-left of the **captured browser client area**.
- Units: integer pixels.
- `ActionExecutor` maps to absolute screen coordinates using live window bounds.
- Out-of-bounds values are rejected or clamped (production: reject + replan).

---

## 6. Validation Rules (production)

1. Response must be a single JSON object (no markdown fences preferred; strip if present).
2. `action` must be in the enum.
3. Coordinate-bearing actions must include finite `x`,`y`.
4. `hotkey` must include non-empty `keys`.
5. `confidence < threshold` (default 0.55) → discard and replan.
6. `observation` must not contain fabricated full JD content intended for storage.
7. Unknown fields are ignored; missing required fields fail validation.

---

## 7. Example Commands

### Click a job card

```json
{
  "action": "click",
  "target": "job_card",
  "coordinates": { "x": 450, "y": 300 },
  "confidence": 0.91,
  "observation": "Unprocessed job card at list position 3"
}
```

### Expand JD and copy

```json
{
  "action": "click",
  "target": "show_more",
  "coordinates": { "x": 980, "y": 720 },
  "confidence": 0.88,
  "observation": "About the job is truncated; Show more is visible"
}
```

```json
{
  "action": "hotkey",
  "target": "jd_section",
  "keys": ["ctrl", "c"],
  "confidence": 0.8,
  "observation": "JD section focused; copy original text"
}
```

### Paginate

```json
{
  "action": "next_page",
  "target": "next_button",
  "coordinates": { "x": 860, "y": 980 },
  "confidence": 0.84,
  "metadata": { "next_enabled": true, "prev_enabled": true }
}
```

### Completion

```json
{
  "action": "all_done",
  "confidence": 0.9,
  "observation": "Next button disabled; no further pages",
  "metadata": { "next_enabled": false }
}
```
