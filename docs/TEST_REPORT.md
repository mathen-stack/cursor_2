# Complete Testing Report — LinkedIn JD Collector Agent

Scenario exercised (automated with mocked OS/AI + code audit):

1. User opens Chrome  
2. User opens LinkedIn  
3. User filters jobs  
4. User starts application  
5. AI detects LinkedIn  
6. Agent clicks jobs  
7. Agent copies JD  
8. Agent saves files  
9. Agent moves to next page  
10. Agent finishes  

Live Chrome/LinkedIn UI cannot be driven in this Linux CI host; findings below combine code audit with a full mocked scenario integration test (`tests/integration/test_full_scenario.py`). Windows EXE smoke launch is covered by GitHub Actions.

---

## Bugs found & fixed

| Issue | Impact | Fix |
|---|---|---|
| Screenshot resize without coordinate remap | Clicks miss UI on large monitors | `ScreenshotResult.to_screen` + `MappedMouse` |
| No LinkedIn presence check at start | Agent clicks blindly if wrong page | `LinkedInDetector` before job loop |
| Failed jobs not skipped | Infinite retry on same bad card | `JobDetector.mark_skipped` after max attempts |
| Unstable job signatures (`idx` shifts) | Reprocessing / weak dedupe | Prefer URL or title\|company; bucketed xy |
| Tiny/blocker clipboard accepted as JD | Bad TXT files (login prompts) | `validate_raw_jd_text` min length + blocker snippets |
| `max_jobs` still paginated | Extra AI/page work after goal met | Complete immediately when max reached |
| `pages_completed` incremented before Next success | Wrong stats | Increment only after successful navigation |
| No CAPTCHA/login escalation action | Agent thrashes on blockers | `need_user` action + workflow halt |
| Low-confidence clicks executed | Unreliable AI mistakes | Confidence gate in `VisionAgent` |

---

## Remaining risks (not fully eliminable)

| Risk | Why | Mitigation now / next |
|---|---|---|
| AI mis-clicks job cards | Vision grounding errors | Confidence gate, retries, logging |
| Ctrl+A copies wrong panel | Focus can land outside JD | Prefer drag `select` region; reject short clipboard |
| LinkedIn UI A/B changes | Layout drift | Vision-first design; prompt hardening |
| Multi-monitor DPI quirks | Win32 scaling edge cases | Mapper uses capture offsets/scales; needs field soak |
| Rate limits / OpenRouter latency | Many vision calls/page | Cached job cards; fewer detail polls |
| Unsigned Windows EXE SmartScreen | First-run warning | Code signing (future) |

---

## Unreliable actions (improved)

- Job click → mapped coordinates  
- Detail wait → still AI-bound; capped attempts  
- JD copy → sentinel clipboard change + length checks  
- Next page → requires coords; waits for job list reload  

---

## Missing cases now covered

- LinkedIn not open / login wall → `need_user` / error event  
- Duplicate JD → history skip  
- Empty/short clipboard → retry then skip job  
- Multi-page run → integration scenario test  
- Stop before start → STOPPED without crash  

---

## Performance notes

- Vision calls dominate runtime (expected).  
- Caching identified `job_cards` avoids re-asking for each click when list known.  
- Screenshots still resized to max width 1600 for API cost, with correct remapping.  
- Safety delay remains configurable via `AUTOMATION_SAFETY_DELAY`.  

---

## Test results

```text
Unit + integration suite: pass (see CI / local pytest)
Windows EXE build + smoke launch: pass (GitHub Actions windows-latest)
```
