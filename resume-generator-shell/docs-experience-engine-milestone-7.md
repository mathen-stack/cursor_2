# Experience Engine Milestone 7

## Goal

Replace the mock bullet composer with a real compressed-STAR sentence composer
inside the full Resume Generator project.

Milestone 7 does not alter the approved upstream planning, keyword allocation,
or STAR-story outputs. It converts each approved STAR story into one concise,
ATS-friendly Experience bullet while preserving traceability to the immutable
JD and generation context.

## Real pipeline after this milestone

```text
Immutable JD
→ Atomic requirement extraction
→ Target role and seniority detection
→ Automatic role assignment
→ Requirement-to-role allocation
→ Bullet-count and achievement planning
→ Direct/supporting/outcome keyword allocation
→ Unique action-verb allocation
→ Situation, Task, Action, Result, and metric generation
→ STAR coherence validation
→ Compressed-STAR bullet composition
→ Sentence-quality and composition validation
→ Mock full Experience-section validator
```

The final Experience-section semantic repetition validator and selective
regeneration controller remain intentionally deferred to the next milestone.

## New components

### `RealBulletComposer`

The real composer:

- receives the original immutable JD and verifies `jdId` and `jdHash`;
- requires exactly one plan, keyword package, and approved STAR story per bullet;
- rejects mismatched experience IDs and requirement IDs;
- constructs the final bullet without mutating upstream outputs;
- preserves the allocated action verb, JD concepts, supporting methods,
  outcomes, and quantitative result;
- returns per-bullet strength and distinctiveness scores;
- rejects the complete composition output when any bullet fails its local
  sentence-quality gate.

### `SentencePatternEngine`

The engine rotates several grammatical patterns within each role:

1. action + measured result + outcome;
2. action + outcome + measured result;
3. action + measured result while advancing the outcome;
4. action + delivered impact;
5. action + metric + business impact for communication or leadership bullets.

A compact fallback pattern is used when the preferred sentence exceeds the
configured word limit.

### `SentenceQualityValidator`

Each final bullet is checked for:

- one clean sentence;
- one terminal period;
- active voice;
- allocated action verb at the beginning;
- direct JD concept coverage;
- all allocated supporting keywords;
- all allocated outcome keywords;
- quantified impact;
- no first-person pronouns;
- no weak phrases such as `responsible for` or `worked on`;
- scan-friendly length;
- communication signals for communication bullets;
- technical-direction signals for leadership bullets;
- minimum strength score of 8.0;
- minimum distinctiveness score of 8.0.

Default length bounds are 16–46 words. They are configurable through
`RealBulletComposerOptions`.

### `BulletCompositionValidator`

Global composition checks include:

- every plan was composed exactly once;
- bullet IDs are unique;
- final bullet text is not duplicated;
- all upstream STAR stories were approved;
- action verbs, JD concepts, supporting methods, and outcomes are preserved;
- every bullet is quantified;
- sentence patterns are varied within each role;
- communication and leadership coverage survives compression;
- opening phrases, achievement dimensions, metric patterns, and final text are
  sufficiently distinctive.

## Input contract improvement

The Bullet Composer now receives the original `JobDescription` object directly.
The Experience Validator input also carries the original JD so the next real
validator can enforce the same immutable-JD rule.

```ts
interface BulletComposerInput {
  context: GenerationContext;
  jobDescription: JobDescription;
  plans: BulletPlanItem[];
  keywordPackages: KeywordPackage[];
  stories: StarStory[];
}
```

## Output diagnostics

The composer returns optional detailed validation data:

```ts
interface BulletSentenceDiagnostic {
  bulletId: string;
  experienceId: string;
  sentencePattern: BulletSentencePattern;
  wordCount: number;
  sentenceCount: number;
  startsWithAllocatedActionVerb: boolean;
  directKeywordCoverage: boolean;
  supportingKeywordCoverage: boolean;
  outcomeKeywordCoverage: boolean;
  quantifiedImpactPresent: boolean;
  activeVoice: boolean;
  strengthScore: number;
  distinctivenessScore: number;
  warnings: string[];
  errors: string[];
}
```

The public Experience bullet contract remains unchanged. The assembler will
continue to receive the original validated bullet text without rewriting it.

## Composition root

Use:

```ts
createMilestone7ExperienceEngine({
  role: { referenceDate: new Date("2026-07-27T00:00:00.000Z") },
});
```

The returned Experience Engine version is `0.7.0`.

## Tests added

`tests/bullet-composition-engine.test.ts` covers:

- one sentence per STAR story;
- quantified results;
- word-count bounds;
- strength and distinctiveness thresholds;
- allocated action verbs;
- JD, supporting, and outcome concept preservation;
- sentence-pattern variation;
- communication and leadership preservation;
- input immutability;
- JD-context mismatch rejection;
- simultaneous cross-JD isolation;
- full Milestone 7 integration.

## Verification performed in the development environment

- strict TypeScript validation for contracts, core, engines, and tests;
- end-to-end runtime smoke tests for machine-learning, data-engineering,
  backend-engineering, security, and generative-AI JDs;
- simultaneous isolated generation checks;
- context mismatch rejection;
- minimum five-bullet enforcement through the full Experience pipeline.

The npm registry is unavailable in this environment, so the repository's
native `pnpm test` command still requires dependency installation on a machine
with registry access.

## Next milestone

Milestone 8 should replace the mock Experience Validator with the real global
Experience validation layer:

- exact repetition detection;
- morphological repetition detection;
- semantic and achievement repetition detection;
- structural repetition detection;
- domain and requirement coherence validation;
- metric plausibility across the complete role;
- seniority consistency;
- ATS-language checks;
- selective regeneration of only failed bullets.
