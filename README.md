# Resume Generator

Contract-first, JD-isolated resume generator built **bottom-up** from Milestones 1–16.

Given a candidate profile and one immutable job description, four independent engines (Experience, Skills, Summary, Template) produce approved section outputs. A Final Assembler copies them unchanged into a final resume; renderers export HTML / TXT / DOCX / PDF with integrity checks; a readiness layer scores the result without rewriting content.

## Project location

```text
resume-generator-shell/
```

## Milestone map (bottom → top)

| # | Focus |
|---|--------|
| 1 | Experience Engine orchestration shell + mocks + isolation |
| 2 | Real requirement extractor (evidence-grounded) |
| 3 | Target role / seniority / role assignment |
| 4 | Bullet planning & requirement-to-role allocation |
| 5 | Keyword / action-verb allocation + locks |
| 6 | Compressed STAR story generation |
| 7 | Bullet composition |
| 8 | Global validation + selective regeneration |
| 9 | Production Experience API, persistence, preview UI |
| 10 | Skills Engine |
| 11 | Summary Engine |
| 12 | Template Engine |
| 13 | Parallel orchestrator + Final Assembler |
| 14 | ATS-safe HTML / TXT / DOCX / PDF export |
| 15 | Resume Worded readiness + calibration |
| 16 | Full quality audit (`pnpm verify`) |

See `resume-generator-shell/docs-*-milestone-*.md` and `docs-architecture.md`.

## Quick start

```bash
cd resume-generator-shell
corepack enable
pnpm install
cp .env.example .env.local
pnpm typecheck
pnpm test
pnpm dev
```

Open `http://localhost:3000`. Default provider is offline / rule-based.

## Workspace layout

```text
apps/web            Next.js APIs + resume preview
packages/contracts  Shared Zod schemas and engine contracts
packages/core       Context, orchestration, stores, readiness
packages/engines    Experience / Skills / Summary / Template
packages/rendering  HTML, TXT, DOCX, PDF export
tests               Isolation, engine, and integration tests
```
