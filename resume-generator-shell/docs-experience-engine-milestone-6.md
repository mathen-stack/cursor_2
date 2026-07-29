# Experience Engine Milestone 6

Milestone 6 replaces the mock STAR generator with a real deterministic,
JD-specific Situation, Task, Action, Result, Metric, and coherence layer. Final
resume-bullet composition and full Experience validation remain mocked so they
can be implemented and tested separately in the next milestones.

## Implemented components

### Situation Generation Engine

- Receives the original immutable JD on every call.
- Builds a realistic technical or business problem from the planned achievement
  dimension.
- Connects the problem to the assigned role focus and allocated outcome.
- Produces distinct contexts for architecture, deployment, performance,
  reliability, automation, scale, cost, security, data quality, customer impact,
  collaboration, leadership, mentoring, and systems integration.

### Task Generation Engine

- Defines the responsibility owned by the candidate.
- Uses at least one allocated direct JD phrase inside the STAR story.
- Adjusts ownership language to the assigned seniority.
- Gives communication and leadership bullets explicit coordination or technical
  direction responsibilities.

### Action Generation Engine

- Uses the exact allocated action verb.
- Includes the allocated supporting technologies, methods, and practices.
- Selects a readable action object instead of mechanically repeating leading JD
  verbs such as `deploy`, `build`, or `monitor`.
- Adds cross-functional alignment behavior to communication plans.
- Adds strategy, design review, and execution coordination to leadership plans.

### Metric Generation Engine

- Generates one bounded, deterministic metric for every planned bullet.
- Uses metric profiles that match the achievement dimension.
- Supports percentage, availability, latency, throughput, scale, time, cost,
  quality, delivery, and productivity measures.
- Uses stable input hashing, so the same immutable run inputs reproduce the same
  metric while a different JD run receives independent values.
- Stores the metric measure, direction, value, unit, rationale, and outcome
  relationship.
- Marks all generated numbers internally as `generated-hypothetical` for
  traceability.

### Result Generation Engine

- Connects the metric to the allocated outcome keyword.
- Produces both technical and business impact.
- Keeps results causally connected to the generated action and achievement
  dimension.

### STAR Coherence Validator

Checks each story for:

- allocated action-verb usage;
- direct JD terminology in the Task or Action;
- every supporting keyword in the Action;
- allocated outcome usage in the Result or metric;
- a clear Situation problem signal;
- candidate ownership in the Task;
- at least one measurable result;
- metric range and unit plausibility;
- communication evidence for collaboration-focused plans;
- leadership evidence for senior ownership plans.

Each story receives:

```ts
{
  coherenceScore: number;
  metricPlausibilityScore: number;
  status: "approved" | "rejected";
}
```

### Global STAR Generation Validator

Validates the full current generation run:

- one story exists for every bullet plan;
- story and requirement IDs are valid and unique;
- allocated verbs and keywords are represented;
- all stories meet the minimum coherence threshold;
- all metrics are plausible;
- measured outcomes are distinct within each role;
- communication and leadership coverage is meaningful.

## STAR story contract

```ts
{
  bulletId: string;
  experienceId: string;
  requirementId: string;
  achievementDimension: AchievementDimension;
  situation: string;
  task: string;
  action: string;
  result: string;
  technicalImpact: string;
  businessImpact: string;
  metrics: StarMetric[];
  coherenceScore: number;
  metricPlausibilityScore: number;
  status: "approved" | "rejected";
}
```

## Isolation guarantees

- Every internal STAR component receives the original JD.
- The generator validates `generationId`, `jdId`, and `jdHash` before work.
- All metric-pattern sets, maps, stories, and scores are local to one execution.
- Deterministic metric seeds include the current JD hash, experience ID, and
  bullet ID.
- Concurrent JDs cannot share situations, metrics, validation state, or mutable
  collections.
- Inputs are never mutated.

## Composition status

Real in Milestone 6:

1. Evidence-grounded JD Requirement Extraction
2. Target Role and Seniority Analysis
3. Career Timeline and Automatic Role Assignment
4. Requirement-to-Role Allocation
5. Bullet Count and Achievement Theme Planning
6. Direct, Supporting, and Outcome Keyword Allocation
7. Action Verb Allocation and Semantic Locking
8. Situation Generation
9. Task Generation
10. Action Generation
11. Metric Generation
12. Result Generation
13. STAR Coherence and Global STAR Validation

Still mocked intentionally:

1. Final compressed-STAR Bullet Composer
2. Bullet Strength Scoring
3. Exact, morphological, semantic, structural, and achievement repetition checks
4. Role-level Experience validation
5. Selective regeneration

## Verification performed

Strict TypeScript checking passed with local contract stubs because the
environment cannot access the npm registry. Runtime smoke tests verified:

- direct JD and supporting keyword usage;
- action-verb preservation;
- bounded and deterministic metrics;
- communication and leadership stories;
- metric-pattern separation within a role;
- input immutability;
- context mismatch rejection;
- concurrent JD isolation;
- full Milestone 6 orchestration through the remaining deterministic mocks.

Run the complete repository test suite locally after installing dependencies:

```bash
pnpm install
pnpm typecheck
pnpm test
```
