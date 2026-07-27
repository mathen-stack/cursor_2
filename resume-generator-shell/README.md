# Resume Generator

A contract-first TypeScript monorepo for generating fully isolated,
JD-specific resumes.

## Current implementation status

- Full-project contracts and orchestration shell
- Immutable JD and generation context
- Cross-JD and cross-run isolation guards
- **Milestones 2–8:** complete Experience Engine from atomic JD extraction
  through role assignment, planning, keywords, compressed STAR generation,
  validation, and selective regeneration
- **Milestone 9 complete:** production Experience integration with API routes,
  model-provider configuration, persistence, generation history, telemetry,
  logging, health checks, and an interactive preview interface
- **Milestone 10 complete:** real Skills Engine with direct JD skill extraction,
  conservative supporting-skill inference, priority ranking, ATS categories,
  alias deduplication, validation, and complete cross-JD isolation
- **Milestone 11 complete:** production Summary Engine with JD role analysis,
  experience-year determination, direct keyword allocation, 50-80 word
  generation, and Resume Worded-style readiness validation
- **Milestone 12 complete:** production Template Engine with section selection,
  ATS-safe single-column layout, page and density planning, typography,
  spacing, margins, regional page-size selection, and complete validation
- **Milestone 13 complete:** complete parallel resume orchestration, strict
  approval and context gates, immutable final assembly, source fingerprints,
  assembly validation, full-resume API, and assembled web preview
- **Milestone 14 complete:** ATS-safe HTML, TXT, DOCX, and PDF renderers,
  canonical token tracing, source/document fingerprint verification, export
  integrity validation, download API, preview export controls, and visual QA
- **Milestone 15 complete:** deterministic Resume Worded readiness scoring,
  95+ internal quality gates, issue-to-engine routing, exact-resume external
  score calibration, generation-scoped persistence, and preview integration
- **Milestone 16 complete:** full code-quality audit, strict workspace and web
  type-check verification, all 103 automated tests passing, hyphenated
  experience-ID handling, milestone mock communication coverage, concurrent
  isolation assertion correction, and generation-specific PDF fingerprints

See `docs-experience-engine-milestone-1.md` through
`docs-experience-engine-milestone-9.md`, `docs-skills-engine-milestone-10.md`,
`docs-summary-engine-milestone-11.md`, `docs-template-engine-milestone-12.md`,
`docs-final-assembler-milestone-13.md`, and
`docs-rendering-milestone-14.md`, `docs-readiness-milestone-15.md`, and
`docs-quality-audit-milestone-16.md` for the
incremental implementation.

## Workspace

```text
apps/web                 Next.js APIs and complete assembled resume preview
packages/contracts       Shared schemas and engine/API contracts
packages/core            Context, services, persistence, orchestration, telemetry
packages/engines         Isolated Experience, Skills, Summary, and Template engines
packages/rendering       ATS-safe HTML, TXT, DOCX, and PDF rendering/export
tests                    Isolation, engine, provider, and integration tests
```

## Local setup

```bash
corepack enable
pnpm install
cp .env.example .env.local
pnpm typecheck
pnpm test
pnpm dev
```

Open `http://localhost:3000` and generate a complete JD-isolated resume.
The default provider is offline and rule-based. Configure the optional
OpenAI-compatible provider through environment variables only when needed.

The project requires npm registry access for the first dependency installation.

## Milestone 11

The production Summary Engine is implemented. It independently analyzes the original JD, determines the target role and seniority, selects JD-appropriate years of experience, allocates direct JD keywords, generates a 50-80 word ATS-friendly summary, and applies Resume Worded-style validation.

## Milestone 12

The production Template Engine is implemented. It independently analyzes the immutable JD and profile, selects supported sections, plans one- or two-page ATS-safe formatting, and returns a complete deterministic layout definition without rewriting generated content.


## Milestone 13

The complete resume orchestrator now runs the production Summary, Skills,
Experience, and Template engines independently against one immutable JD. The
Final Resume Assembler follows the approved template order and combines all
engine outputs unchanged with user-entered contact and education data. It
rejects cross-run output, unapproved engines, unsupported sections, source
mutation, or any content/order difference. The web application exposes the
complete pipeline through `POST /api/resume/generate` and a full resume preview.


## Milestone 14

The rendering package now exports the exact immutable final resume as HTML,
plain text, DOCX, or PDF. Each artifact passes context, source-fingerprint,
document-fingerprint, token-order, MIME-type, selectable-text, and ATS-structure
validation before download. The web preview exposes DOCX, PDF, and TXT export
through `POST /api/resume/export`. Set `RESUME_PDF_BACKEND=libreoffice` when
full Unicode and Word/PDF layout parity are required on a server with
LibreOffice installed.


## Milestone 15

The final orchestrator attaches an evaluation-only Resume Worded readiness
report after immutable assembly. The report uses eleven weighted quality
categories, a 95+ internal target, critical ATS and integrity gates, and
engine-specific issue routing. It never modifies resume content. Users can
record actual external overall and relevancy scores for the exact document
fingerprint through `POST /api/resume/calibration`. Calibration records remain
fully isolated by generation and JD.


## Milestone 16

The project received a complete code-level audit. Strict TypeScript checks pass
for contracts, core, engines, rendering, and the web application. The complete
103-test suite passes in the controlled audit runtime. The audit fixed
hyphenated experience-ID parsing, guaranteed collaboration coverage in legacy
milestone mocks, corrected one inverted isolation assertion, added a
generation-specific PDF fingerprint comment, removed stale TypeScript build
metadata, and added `pnpm verify` for local CI-style verification.
