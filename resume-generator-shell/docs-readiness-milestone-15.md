# Milestone 15: Resume Worded Readiness and External Calibration

Milestone 15 adds a deterministic evaluation layer after immutable final
assembly. It estimates whether the exact JD-specific resume is ready for an
external Resume Worded test, routes weaknesses to the responsible isolated
engine, and stores the user's actual external scores and feedback without
changing resume content.

The internal score is a quality target, not a claim about Resume Worded's
proprietary score. The exact exported resume must still be tested externally.

## Internal readiness model

`ResumeWordedReadinessEngine` evaluates eleven categories with fixed weights:

1. impact;
2. quantified achievements;
3. action verbs;
4. brevity and readability;
5. JD relevance;
6. skills coverage;
7. leadership and growth;
8. communication and collaboration;
9. repetition control;
10. ATS and formatting;
11. section completeness.

The internal release target is 95/100. A score alone is not sufficient. The
resume must also pass critical gates for:

- approved immutable assembly;
- approved Summary, Skills, Experience, and Template outputs;
- approved Experience bullets;
- at least 85% quantified-bullet coverage;
- strong direct-JD coverage;
- ATS-safe single-column structure;
- no critical repetition groups;
- a 50–80 word summary;
- a valid final-document fingerprint.

A strong run receives the label `90-plus-likely`, but the report always includes
an explicit non-guarantee disclaimer.

## Evaluation-only behavior

The readiness engine:

- consumes the final assembled resume;
- recomputes the final document fingerprint;
- reads existing engine diagnostics and validation results;
- calculates category scores and evidence;
- emits issues with an owning engine and targeted action;
- sets `contentMutated: false`;
- never rewrites, shortens, deduplicates, reorders, or regenerates content.

The orchestrator attaches the report as optional metadata after the Final
Resume Assembler has completed. Rendering continues to use only the immutable
resume document and approved source outputs.

## Targeted issue routing

Each finding identifies one responsible boundary:

- Summary Engine for summary length, pronouns, or style;
- Skills Engine for missing explicit JD skills or ungrounded inference;
- Experience Engine for impact, metrics, verbs, repetition, leadership, or
  collaboration;
- Template Engine for section selection and layout;
- Rendering for ATS parsing problems in an exported artifact;
- Orchestrator for cross-engine JD coverage or integrity failures.

The readiness engine does not apply the suggested change itself. Existing
selective-regeneration rules remain in force.

## External calibration loop

Users can record the result of testing the exact exported resume on Resume
Worded. A calibration record stores:

- generation ID, JD ID, and JD hash;
- final document fingerprint;
- internal readiness score;
- external overall score;
- optional external relevancy score;
- internal-to-external score deltas;
- categorized feedback;
- mapped owner engine and recommended action;
- tested and recorded timestamps.

Calibration is strictly generation-scoped. A record cannot be reused across a
different JD or a different document fingerprint. Feedback does not inject
keywords, bullets, titles, metrics, or assumptions into another resume.

The default store is in memory. Set `RESUME_CALIBRATION_STORE_FILE` to use
atomic JSON-file persistence.

## API and UI

New endpoints:

- `POST /api/resume/readiness` evaluates an assembled resume;
- `POST /api/resume/calibration` records an external score for an unchanged,
  approved resume;
- `GET /api/resume/calibration?generationId=...` returns only that generation's
  calibration history.

The complete resume preview displays:

- the internal readiness score;
- category scores;
- external-test readiness status;
- targeted findings and owning engines;
- a form for recording Resume Worded overall, relevancy, and feedback data.

## Verification performed

Milestone 15 includes tests and smoke checks for:

- readiness metadata attached after assembly;
- no resume-content mutation;
- eleven weighted categories;
- degraded-resume score reduction;
- quantified-impact and repetition issue routing;
- generation- and fingerprint-scoped calibration;
- cross-JD calibration rejection;
- a production full-pipeline ML resume scoring 98.9 internally;
- successful ATS-safe PDF export after readiness metadata is attached;
- strict TypeScript validation across contracts, core, engines, rendering, and
  tests;
- web and API TypeScript/JSX validation with local dependency shims.
