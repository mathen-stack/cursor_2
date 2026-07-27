# Experience Engine Milestone 3

Milestone 3 replaces only the mock Target Role and Role Assignment stage with a
real, deterministic, JD-grounded engine. Requirement extraction remains real
from Milestone 2. Bullet planning, keyword allocation, STAR generation, bullet
composition, and final experience validation remain mocked so the new behavior
can be tested in isolation.

## Implemented

- Explicit target-title detection from the original immutable JD
- Role-family inference when the JD does not state a formal title
- ATS-normalized title aliases such as `ML Engineer` to
  `Machine Learning Engineer`
- Seniority detection for entry, junior, mid, senior, lead, staff, principal,
  and engineering-manager roles
- Required-years extraction from JD phrases such as `5+ years`
- Career-date parsing for `YYYY`, `YYYY-MM`, month-and-year, and `Present`
- Chronology calculation independent of the order of user input
- Non-overlapping total-experience calculation
- Automatic, natural role progression across all career entries
- JD-grounded focus areas and requirement IDs for every assigned role
- Deterministic validation of complete assignment, target-role placement,
  career progression, chronology, evidence, and focus-area grounding
- Context, JD-hash, duplicate-ID, malformed-date, and input-immutability guards
- Concurrent JD isolation for role analysis and assignment
- Milestone 3 Experience Engine composition root

## Public composition root

```ts
import { createMilestone3ExperienceEngine } from "@resume/engines";

const engine = createMilestone3ExperienceEngine({
  // Optional deterministic date for tests. Omit in production.
  referenceDate: new Date("2026-07-27T00:00:00Z"),
});

const result = await engine.execute(input);
```

## Example progression

For a Senior Machine Learning Engineer JD and three career entries, the engine
can assign:

```text
Most recent: Senior Machine Learning Engineer
Previous:    Machine Learning Engineer
Oldest:      Software Engineer
```

For a Staff Machine Learning Engineer JD and four career entries:

```text
Most recent: Staff Machine Learning Engineer
Previous:    Senior Machine Learning Engineer
Earlier:     Machine Learning Engineer
Oldest:      Software Engineer
```

The engine assigns titles from chronology, target role family, and JD
seniority. It does not reuse a title analysis from another generation run.

## Target role output

```ts
{
  targetRole: "Senior Data Engineer",
  baseRole: "Data Engineer",
  roleFamily: "data-engineering",
  seniority: "senior",
  explicitTitleFound: true,
  confidence: 0.98,
  requiredYears: 5,
  evidence: [
    { sourceText: "Data Engineer", reason: "explicit-title" },
    { sourceText: "Senior", reason: "seniority-signal" }
  ]
}
```

## Role assignment output

Every assignment contains:

- experience ID
- assigned ATS-recognizable title
- seniority
- chronology rank
- duration in months
- most-recent flag
- JD-grounded focus areas
- source requirement IDs
- assignment rationale

## Verification completed in the build environment

- Strict TypeScript validation of all Experience Engine source using a local
  contracts declaration shim
- Explicit Senior Machine Learning Engineer title detection
- Inferred Data Engineer detection when no title is stated
- Staff and Principal seniority normalization
- Required-years extraction
- Unsorted career-history chronology
- Senior-to-mid-to-foundational role progression
- Staff-level four-role progression
- Malformed date rejection
- JD evidence validation
- Focus-area grounding validation
- Concurrent ML and Data Engineering run isolation
- Full Milestone 3 pipeline smoke test with five downstream mock bullets

The complete pnpm/Vitest suite still requires normal npm registry access to
install workspace dependencies.

## Next milestone

Implement the Requirement-to-Role Allocation, Bullet Count Planning, and
Achievement Theme Planning stage. This stage will replace only the mock Bullet
Planner and will plan at least five distinct bullet achievements per role
without generating keywords or STAR sentences yet.
