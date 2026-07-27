# Milestone 13: Final Resume Assembler and Complete Orchestrator

Milestone 13 connects the production Summary, Skills, Experience, and Template
engines through one JD-isolated orchestration path and adds a deterministic
final assembler.

## Immutable assembly rule

The assembler does not generate, rewrite, shorten, repair, deduplicate, filter,
or reorder resume content. It follows the approved Template Engine section
order and copies:

- user-entered contact information;
- the exact Summary Engine summary;
- the exact ordered Skills Engine categories;
- the exact Experience Engine roles and final bullets;
- user-entered education information.

The complete source engine outputs remain embedded in `FinalResumeData` for
traceability. The presentation document contains a deterministic, rendering-ready
view of those outputs.

## Assembly validation

The final assembler checks:

1. all outputs carry the same `generationId`, `profileId`, `jdId`, and `jdHash`;
2. every engine output is approved;
3. assembled section selection and ordering match the Template Engine exactly;
4. contact and education match the user profile exactly;
5. summary, skills, roles, and bullets match their engine outputs exactly;
6. no source object was mutated during assembly;
7. no unsupported optional section enters the final document.

Any failed structural check rejects assembly. There is no final correction or
content-rewriting engine.

## Complete orchestration

The `ResumeOrchestrator` creates one immutable generation context and executes
all four content engines independently in parallel. It records engine versions,
statuses, and durations, rejects cross-JD output, rejects unapproved output, and
passes only approved components to the assembler.

## Web integration

The web application now provides:

- `POST /api/resume/generate`;
- complete profile, career, education, and JD input;
- a final assembled resume preview using the selected template definition;
- visible generation ID, assembly status, template, and duration.

The previous Experience-only API remains available for lower-level testing.

## Next milestone

Milestone 14 should implement rendering adapters for DOCX, PDF, and plain text,
plus export validation that confirms selectable text, reading order, content
integrity, page fit, and absence of clipping.
