# Experience Engine Milestone 8

## Goal

Replace the final mock Experience-section validator with a real global
validation and selective-regeneration layer inside the full Resume Generator
project.

The Experience Engine is now real from immutable JD analysis through final
approved Experience output.

## Complete real pipeline

```text
Immutable JD and generation context
→ Atomic requirement extraction
→ Target role, seniority, and career timeline analysis
→ Automatic role assignment
→ Requirement-to-role and achievement planning
→ Direct/supporting/outcome keyword allocation
→ Unique action-verb allocation
→ Situation, Task, Action, Result, and metric generation
→ STAR coherence validation
→ Compressed-STAR bullet composition
→ Global Experience strength and repetition validation
→ Selective regeneration of failed bullets only
→ Approved Experience JSON
```

## `RealExperienceValidator`

The validator receives the original immutable JD plus every upstream artifact:
requirements, role assignments, plans, keyword packages, STAR stories, and
composed bullets. This preserves full traceability:

```text
Final bullet
→ STAR story
→ keyword package
→ achievement plan
→ atomic JD requirement
→ exact JD evidence
```

### Per-bullet validation

Every bullet is scored from 0–10 for:

- JD alignment;
- technical specificity;
- ownership;
- quantified impact;
- business value;
- distinctiveness;
- ATS language;
- role and seniority consistency;
- domain coherence;
- communication value;
- overall strength.

The validator rejects bullets that lose allocated JD, supporting, or outcome
concepts; omit measurable impact; use weak or passive language; fail role-scope
checks; or fall below the strength threshold.

### Global validation

The complete Experience section is checked for:

- minimum five bullets per role;
- exact duplicate sentences;
- repeated grammatical forms of action verbs;
- semantic repetition using normalized token similarity;
- repeated underlying achievements;
- overly similar sentence structures;
- repeated metric patterns;
- JD and requirement traceability;
- domain coherence;
- communication coverage;
- leadership and architecture evidence for senior roles;
- ATS-friendly active language.

When a duplicate group is detected, the strongest and earliest bullet is
preserved. Only the weaker duplicate is marked for regeneration.

## Selective regeneration

`RealSelectiveRegenerationController` regenerates only bullet IDs returned by
the validator.

For each attempt it:

1. locks every approved bullet and its artifacts;
2. sends only failed plans to the keyword allocator;
3. reserves approved action verbs, supporting tools, outcomes, and metric
   patterns;
4. excludes the failed bullet's prior action/supporting/outcome package so a
   real alternative is selected;
5. generates replacement STAR stories and sentence patterns;
6. merges replacements by `bulletId` without modifying approved bullets;
7. reruns full global validation.

The controller supports up to three attempts by default and reports:

```ts
interface SelectiveRegenerationSummary {
  attempted: boolean;
  attempts: number;
  regeneratedBulletIds: string[];
  preservedBulletIds: string[];
  exhaustedBulletIds: string[];
}
```

## Regeneration-aware engine contracts

The Keyword, STAR, and Bullet Composer inputs now accept optional reserved and
previous artifacts. Normal first-pass execution is unchanged.

- `reservedPackages`, `reservedStories`, and `reservedBullets` protect approved
  work;
- `previousPackages` and `previousStories` force alternatives for failed work;
- `regenerationAttempt` rotates sentence patterns and supports deterministic
  retry behavior.

## Public Experience validation output

The public contract now exposes optional detailed diagnostics while preserving
all earlier fields. The Final Assembler will still import approved Experience
content unchanged.

## Composition root

```ts
createMilestone8ExperienceEngine({
  role: { referenceDate: new Date("2026-07-27T00:00:00.000Z") },
  regeneration: { maximumAttempts: 3 },
});
```

The returned engine version is `0.8.0`.

## Tests added

`tests/experience-validation-and-regeneration.test.ts` covers:

- approval of a strong Experience section;
- exact, morphological, semantic, achievement, structural, and metric
  repetition detection;
- weak ATS language and missing metrics;
- full JD traceability and domain coherence;
- input immutability;
- context mismatch rejection;
- selective replacement of one failed bullet;
- byte-for-byte preservation of approved bullets;
- complete Milestone 8 integration;
- simultaneous isolated JD generation.

## Verification performed here

- strict TypeScript validation of the complete `@resume/engines` source using a
  temporary local type shim because registry dependencies are unavailable;
- end-to-end runtime smoke tests for machine-learning, data-engineering,
  cybersecurity, frontend, and generative-AI JDs;
- one-role and two-role generation runs;
- exact-duplicate injection followed by successful one-bullet regeneration;
- preservation checks proving approved bullets do not change;
- simultaneous cross-JD isolation checks.

The repository's native `pnpm test` suite still requires `pnpm install` on a
machine with npm registry access.

## Next milestone

Build the Experience Engine integration hardening layer:

- provider configuration and production model routing;
- persistence of generation artifacts and validation diagnostics;
- API endpoint and web preview for Experience generation;
- explicit hypothetical-content disclosure and user approval state;
- performance, retry, timeout, and observability controls.

After that boundary is stable, begin the standalone Skills Engine.
