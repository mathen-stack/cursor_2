# Resume Generator Audit Report

Date: 2026-07-27  
Branch base: `cursor/resume-generation-audit-4dff`  
Working branch: `cursor/resume-ats-harden-983b`

## 1. Repository architecture

Workspace root (`main`) only contained `README.md`. The production TypeScript
monorepo lives under `resume-generator-shell/`:

| Area | Path |
| --- | --- |
| Web app + API | `apps/web` |
| Shared contracts | `packages/contracts` |
| Orchestration, assembly, readiness, persistence | `packages/core` |
| Experience / Skills / Summary / Template engines | `packages/engines` |
| HTML / TXT / DOCX / PDF export | `packages/rendering` |
| Regression + isolation suites | `tests/` |

Composition root (production):

- `apps/web/lib/resume-service.ts` wires production engines only
- `apps/web/lib/experience-service.ts` wires production experience engine
- Default model provider is deterministic `rule-based` unless
  `EXPERIENCE_MODEL_PROVIDER=openai-compatible` is configured

## 2. Real implementations found

- Experience Engine: requirement extraction → role assignment → planning →
  keywords → STAR → composition → validation → selective regeneration
- Skills / Summary / Template engines with independent JD intake
- Immutable Final Resume Assembler (byte-for-byte source preservation)
- Readiness Engine (scores and routes; does not rewrite)
- Rendering: HTML, TXT, DOCX, portable PDF (+ optional LibreOffice)
- Persistence: in-memory default; optional JSON file stores
- Calibration store scoped by generation identifiers

## 3. Mocks and placeholders

- Milestone mock factories (`create-milestone-*`, `create-mock-experience-engine`)
  exist for incremental development and are exported from `@resume/engines`
- Production web composition roots do **not** wire mocks
- Offline `RuleBasedRequirementModel` is the intentional deterministic provider
  for local/dev/test and default production when no LLM key is configured

## 4. Contract inconsistencies

- Template contract allows optional sections (`certifications`, `projects`, etc.)
  that assembler/renderers do not yet materialize
- Export / readiness / calibration API payloads use partial runtime checks rather
  than full Zod schemas for `FinalResumeData`
- Context helper was named `assertContextMatch` (alias
  `assertGenerationContextMatches` added during hardening)

## 5. Isolation risks

- In-memory stores are process-local and keyed primarily by `generationId`
- JSON file stores lack multi-process locking
- API run listing previously had no `profileId` filter (hardened)
- Client-submitted resume objects can be exported without server-side run lookup;
  integrity still depends on fingerprint/context validators

## 6. Quality risks

- Generated roles, metrics, and tools are hypothetical and require user review
- Dense JDs can force controlled requirement reuse
- Portable PDF uses CID/font substitution for some Unicode glyphs
- Export integrity compares renderer-emitted tokens, not bytes reverse-parsed
  from DOCX/PDF

## 7. Security risks

- No end-user authentication by default (demo mode)
- LibreOffice child process previously inherited full `process.env` (hardened)
- Request bodies previously unbounded (size limit helper added)
- Secrets must remain in server env only; OpenAI adapter does not put API keys
  in request bodies

## 8. Test gaps (pre-hardening)

Mandatory areas already covered: Software Mind fixture, concurrent JD isolation,
assembler immutability, selective regeneration preservation, export formats,
readiness critical failures, keyword grounding, role progression.

Gaps addressed in this pass:

- Empty / mismatched generation context rejection depth
- Two users + same JD isolation
- Cross-domain concurrent leakage (frontend vs ML)
- Input object immutability
- Generations history API profile filtering
- Request size limit enforcement

## 9. Build / dependency status (baseline before hardening)

```text
pnpm install   → success
pnpm typecheck → success
pnpm test      → 22 files / 117 tests (then 24 / 119 after quality merges)
pnpm build     → success
```

## 10. Prioritized repair order used

1. Preserve working contracts from audit tip
2. Merge complementary quality fixes (direct-keyword representation, summary
   keyword-stuffing)
3. Strengthen context assertion + alias
4. Harden API surface (size limits, generations routes, profile filters)
5. Sanitize LibreOffice environment inheritance
6. Fix frontend-stack fallback leak into non-frontend JDs
7. Fix STAR "effort to" boilerplate recycling into visible bullets
8. Pin role-family core stack keywords into summaries (React/Next/TS)
9. Add mandatory isolation / security regression tests
10. Re-run `pnpm verify` and Software Mind inspection

## 11. Bugs fixed in this hardening pass

| Bug | Root cause | Fix |
| --- | --- | --- |
| React.js leaked into concurrent ML resumes | Hardcoded `"scalable React.js and TypeScript interfaces"` fallback in bullet composition | Domain-neutral `cleanFallback` from tools/focus/theme |
| `"the effort to deliver…"` visible in bullets | STAR task boilerplate recycled via `shortFallback` | Exclude effort/ownership boilerplate; force clean fallback |
| Software Mind summary omitted Next.js | Technical keyword ranking favored higher-occurrence CSS libs | Role-family core-stack boost for React/Next/TypeScript |
| Empty generation IDs accepted by context assert | `assertContextMatch` only compared equality | Reject missing/empty identifiers; export alias |
| LibreOffice inherited API secrets | `env: { ...process.env }` | Allow-listed `createLibreOfficeEnv` |
| Generation history not filterable by profile | Store `list()` had no profile filter | Optional `profileId` on list APIs + `/api/generations` |