# Experience Engine Milestone 4

Milestone 4 replaces the mock Bullet Planner with a real deterministic planning
layer. It does not write resume bullets yet.

## Implemented components

### Role Bullet Count Planner

- Enforces at least five bullets for every role.
- Plans six bullets for the most recent role by default.
- May plan six bullets for a substantial second-most-recent role when the JD
  contains enough distinct experience requirements.
- Caps planned role depth at seven bullets.
- Records the reason for every role's target count.

### Requirement-to-Role Allocator

- Receives the original immutable JD on every call.
- Excludes education and years-of-experience qualifications from primary
  Experience-bullet planning.
- Scores each atomic JD requirement against every automatically assigned role.
- Uses requirement priority, necessity, role focus, career chronology,
  seniority, and target-role relevance.
- Allocates each experience-eligible JD requirement to a primary career entry.
- Ensures every career entry has JD-grounded planning material.
- Uses only local run state, so concurrent JDs cannot share allocations.

### Achievement Theme Planner

- Produces the exact target number of plans for every role.
- Creates deterministic bullet IDs and sequence numbers.
- Assigns a distinct achievement dimension to every bullet within a role.
- Covers architecture, production delivery, optimization, reliability,
  automation, scalability, data quality, security, business impact,
  communication, leadership, and mentoring where appropriate.
- Reserves a communication/collaboration achievement for every role.
- Reserves senior-level ownership or leadership coverage for senior and higher
  roles.
- Uses supporting requirement IDs when a collaboration or leadership signal
  complements a technical primary requirement.
- Reuses a grounding requirement only when the JD contains fewer atomic
  experience requirements than the planned bullet count. Reused grounding
  always receives a different achievement dimension and an explicit warning.

### Planning Validator

Validates the complete plan globally before downstream generation:

- all assigned experiences are planned;
- target and minimum bullet counts are satisfied;
- all bullet IDs are unique;
- all requirement references are valid;
- every role contains communication coverage;
- achievement dimensions do not repeat within a role;
- all critical experience requirements are covered;
- uncovered high-priority requirements are reported for possible Summary or
  Skills allocation;
- reused grounding is visible rather than silently hidden.

## New planning metadata

Each plan now includes:

```ts
{
  bulletId: string;
  experienceId: string;
  sequence: number;
  requirementId: string;
  supportingRequirementIds: string[];
  requirementAllocationKind: "primary" | "supporting" | "reused-grounding";
  achievementDimension: AchievementDimension;
  achievementTheme: string;
  roleFocusArea: string;
  communicationFocused: boolean;
  leadershipFocused: boolean;
  planningRationale: string;
}
```

## Isolation guarantees

The planner verifies `jdId` and `jdHash` before processing. Every planning
operation is stateless and constructs new arrays, maps, sets, allocations, and
validation results for the current generation only. It never mutates the JD,
role assignments, or requirements.

## Composition status

Real in Milestone 4:

1. Evidence-grounded JD Requirement Extraction
2. Target Role and Seniority Analysis
3. Career Timeline and Automatic Role Assignment
4. Bullet Count Planning
5. Requirement-to-Role Allocation
6. Achievement Theme Planning
7. Global Planning Validation

Still mocked intentionally:

1. Direct JD Keyword Allocation
2. Supporting Keyword Generation
3. Outcome Keyword Generation
4. Action Verb Allocation
5. STAR Generation
6. Bullet Composition
7. Final Experience Strength and Repetition Validation

## Verification performed

The source was checked with strict TypeScript settings using local contract
stubs because registry access is unavailable in the execution environment. A
runtime smoke test verified:

- a Senior Data Engineer JD completes the full Milestone 4 pipeline;
- the most recent role receives six bullets;
- two-role planning produces 11 plans;
- every role includes communication coverage;
- achievement dimensions remain unique within each role;
- critical requirements are covered;
- a sparse JD uses explicit `reused-grounding` plans without theme repetition.

Run the complete repository tests locally after installing dependencies:

```bash
pnpm install
pnpm typecheck
pnpm test
```
