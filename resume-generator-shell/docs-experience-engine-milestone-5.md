# Experience Engine Milestone 5

Milestone 5 replaces the mock keyword allocator with a real deterministic,
JD-grounded global allocation layer. It still does not generate final STAR
stories or production resume sentences.

## Implemented components

### Direct JD Keyword Engine

- Receives the original immutable JD on every allocation call.
- Extracts concise, verbatim phrases from the allocated primary and supporting
  JD requirements.
- Stores exact evidence ranges for every direct keyword.
- Prioritizes phrases that align with the atomic normalized requirement.
- Separates task phrases from explicitly named tools where possible.
- Avoids nested or near-duplicate direct phrases in the same package.
- Uses controlled direct-keyword reuse only when no unused grounded phrase is
  available for a planned bullet.

### Relevant Supporting Keyword Engine

- Selects tools, methods, platforms, and engineering practices that explain how
  the assigned JD responsibility can be performed.
- Distinguishes tools explicitly named in the JD from strongly inferred methods.
- Gives the highest priority to an explicit tool when it appears in the current
  allocated requirement rather than borrowing unrelated tools from elsewhere in
  the JD.
- Uses communication-specific supporting methods for collaboration plans and
  leadership-specific methods for senior ownership plans.
- Prevents supporting keyword concepts from repeating within a role.

### Outcome Keyword Engine

- Assigns an outcome concept to every planned bullet.
- Connects the outcome to the achievement dimension and requirement category.
- Covers reliability, latency, throughput, data quality, cost efficiency,
  delivery speed, stakeholder alignment, customer value, security posture, and
  leadership impact.
- Prevents outcome concepts from repeating within a role.

### Action Verb Engine

- Assigns one strong, ownership-focused action verb to every planned bullet.
- Matches verbs to architecture, deployment, optimization, reliability,
  security, data, collaboration, and leadership work.
- Applies seniority safeguards before selecting leadership-heavy verbs.
- Prevents grammatical action-verb reuse within a role.

### Keyword Normalization and Semantic Locking

- Normalizes grammatical variants and common semantic aliases.
- Creates canonical keys for direct keywords, supporting keywords, outcome
  keywords, and action verbs.
- Maintains a per-role lock store scoped only to the current generation run.
- Detects repetition across direct, supporting, and outcome keyword kinds.
- Prevents an outcome from reusing a direct or supporting concept selected for the same bullet.
- Allows only explicitly recorded controlled reuse of direct JD wording.

### Global Keyword Allocation Validator

Validates the complete role-level allocation before STAR generation:

- every bullet plan has exactly one keyword package;
- all package IDs and requirement references are valid;
- all direct keywords are present verbatim in the original JD;
- action verbs are unique within each role;
- supporting and outcome concepts are distinct within each role;
- no unapproved keyword concept repeats across allocation kinds;
- communication packages contain collaboration or stakeholder language;
- leadership packages contain leadership, strategy, mentoring, or governance
  language;
- controlled direct-keyword reuse is visible as a warning rather than hidden.

## Planning refinements included

Milestone 5 also strengthens earlier real sub-engines where the keyword layer
exposed integration weaknesses:

- role-title-only JD segments are no longer treated as requirements;
- action sentences that name tools retain both the actual responsibility and
  the individual tool requirements;
- collaboration and leadership intent takes precedence over incidental domain
  words during requirement classification;
- tool and technical-skill requirements are treated as supporting evidence
  rather than primary achievements when enough responsibility requirements are
  available;
- dedicated collaboration and leadership requirements are reserved for their
  corresponding bullet-plan slots;
- sparse-JD reuse prefers technical requirements instead of repeating
  collaboration or leadership requirements unnecessarily.

## Keyword package contract

Each planned bullet now receives:

```ts
{
  bulletId: string;
  experienceId: string;
  requirementId: string;
  achievementDimension: AchievementDimension;
  actionVerb: string;
  actionVerbCanonicalKey: string;
  directKeywords: string[];
  directKeywordEvidence: DirectKeywordEvidence[];
  supportingKeywords: string[];
  supportingKeywordDetails: SupportingKeywordDetail[];
  outcomeKeywords: string[];
  outcomeKeywordDetails: OutcomeKeywordDetail[];
  allocationRationale: string;
}
```

The allocator also returns immutable lock records and a global validation
report for the current JD-specific run.

## Isolation guarantees

- The allocator validates `generationId`, `jdId`, and `jdHash` before work.
- All maps, sets, canonical keys, locks, and warnings are created inside the
  current call.
- No keyword, action verb, package, or lock state is stored globally.
- Concurrent JDs cannot share allocation state.
- Original JDs, requirements, assignments, and bullet plans are never mutated.

## Composition status

Real in Milestone 5:

1. Evidence-grounded JD Requirement Extraction
2. Target Role and Seniority Analysis
3. Career Timeline and Automatic Role Assignment
4. Requirement-to-Role Allocation
5. Bullet Count and Achievement Theme Planning
6. Direct JD Keyword Extraction
7. Supporting Keyword Generation
8. Outcome Keyword Generation
9. Action Verb Allocation
10. Global Keyword Locking and Validation

Still mocked intentionally:

1. Situation Generation
2. Task Generation
3. Action Generation
4. Result and Metric Generation
5. STAR Coherence Validation
6. Final Bullet Composition
7. Final Experience Strength and Repetition Validation
8. Selective Regeneration

## Verification performed

The Experience Engine source passed strict TypeScript checking with local
contract stubs because the environment cannot reach the npm registry. Runtime
smoke tests verified:

- machine-learning, data-engineering, backend, and security JDs;
- one-role and multi-role allocations;
- at least five packages per role;
- exact direct-keyword evidence ranges;
- unique verbs, supporting concepts, and outcomes within roles;
- cross-kind keyword repetition detection;
- dedicated collaboration and leadership allocation;
- sparse-JD controlled reuse;
- context mismatch rejection;
- concurrent generation isolation;
- full Milestone 5 orchestration through the downstream deterministic mocks.

Run the complete repository test suite locally after installing dependencies:

```bash
pnpm install
pnpm typecheck
pnpm test
```
