# Architecture Notes

## Contract-first boundary

The orchestrator depends only on interfaces from `@resume/contracts`. Concrete engines are registered later.

## Immutable JD rule

Every engine input contains:

- `generationId`
- `profileId`
- `jdId`
- `jdHash`
- the original canonical JD object

Every output returns the same context. The orchestrator rejects mismatches.

## Final assembly rule

The final resume data object preserves Summary, Skills, Experience, and Template outputs exactly as approved. Rendering may position content but may not rewrite it.

## Planned Experience Engine internals

1. Requirement extraction
2. Role assignment
3. Requirement-to-role planning
4. Keyword allocation
5. STAR generation
6. Bullet composition
7. Strength and repetition validation
8. Selective regeneration

## Experience Engine implementation status

Real through Milestone 8:

1. atomic JD requirement extraction;
2. target role, seniority, and career timeline analysis;
3. automatic role assignment and progression validation;
4. requirement-to-role and achievement-theme planning;
5. role-level bullet-count planning with at least five bullets;
6. direct JD keyword extraction with exact evidence ranges;
7. relevant supporting keyword generation;
8. outcome keyword generation;
9. unique action verb allocation;
10. global keyword normalization, locking, and repetition validation;
11. Situation, Task, Action, Result, and bounded metric generation;
12. STAR coherence and metric plausibility validation;
13. compressed-STAR final bullet composition;
14. sentence-pattern variation;
15. local bullet strength, concision, quantification, and distinctiveness checks;
16. communication and leadership signal preservation during composition;
17. complete Experience-section exact, morphological, semantic, structural,
    achievement, and metric repetition validation;
18. cross-bullet JD traceability and domain-coherence validation;
19. final seniority, communication, leadership, and ATS-language validation;
20. per-bullet multi-dimensional strength diagnostics;
21. selective regeneration of only failed bullets while approved bullets remain
    byte-for-byte unchanged.

Still mocked inside the Experience Engine: none. Milestone 9 completed its
production API, persistence, telemetry, provider configuration, and preview
integration.

## Skills Engine implementation status

Real through Milestone 10:

1. direct JD skill extraction with exact evidence ranges;
2. canonical skill and alias normalization;
3. conservative supporting-skill inference with explicit trigger tracking;
4. JD priority, title proximity, and mention-frequency ranking;
5. ATS-friendly category allocation and density limits;
6. protection of critical and high-priority explicit JD skills;
7. duplicate, evidence, category, inference-grounding, and density validation;
8. deterministic skill IDs and detailed traceability records;
9. immutable-input and concurrent cross-JD isolation.

The Skills Engine is available through the full-project engine contract and
production composition root.

## Summary Engine (Milestone 11)

The Summary Engine is isolated from Experience and Skills outputs. It receives the immutable JD and user profile directly, then performs target-role detection, seniority analysis, years-of-experience determination, direct keyword allocation, 50-80 word composition, and internal readiness validation. The Final Assembler must import the approved summary unchanged.


## Template Engine (Milestone 12)

The Template Engine is isolated from Summary, Skills, and Experience outputs. It receives the immutable JD and user profile directly, analyzes target role and seniority, estimates content volume, selects supported sections, chooses Letter or A4 when the JD provides a regional signal, plans a one- or two-page target, and returns deterministic typography, margin, spacing, alignment, and ATS-safeguard instructions.

Approved templates always use a single column, top-to-bottom reading order, standard headings, selectable text, and ordinary bullets. They prohibit core-content tables, text boxes, icons, graphics, and header/footer placement. The engine validates readability, content fit, page planning, and Resume Worded-style readiness before returning an approved definition.

## Milestone 13: immutable final assembly

The full-project orchestrator creates one generation context and invokes the
Experience, Summary, Skills, and Template engines independently against the
same immutable JD. Engine outputs are accepted only when their generation,
profile, JD, and hash identifiers match and their status is `approved`.

The deterministic Final Resume Assembler then follows the Template Engine's
section order and copies approved content without editing it. It stores source
fingerprints, a final document fingerprint, structural validation results, and
per-engine timing metadata. A failed assembly check stops the run; no final AI
correction or rewriting step exists.


## Milestone 14: rendering and export integrity

Rendering consumes only approved `FinalResumeData`. A canonical ordered token
stream sits between final assembly and format adapters. HTML, TXT, DOCX, and PDF
renderers return both bytes and an emitted-token trace. The export validator
recomputes all source fingerprints and the final document fingerprint, verifies
context and section order, compares source and emitted tokens exactly, and
rejects any altered, missing, unexpected, or reordered content.

DOCX uses single-column OOXML paragraphs and native bullet numbering without
core-content tables, text boxes, headers, or footers. PDF uses selectable text,
Letter/A4 layout, automatic wrapping and pagination, and an ASCII/WinAnsi font
path with a Unicode fallback. Rendering never edits engine content.

## Milestone 15: readiness and calibration

After immutable assembly, a deterministic readiness evaluator scores impact,
quantification, verbs, brevity, JD relevance, skills, leadership, collaboration,
repetition, ATS formatting, and section completeness. It attaches evaluation
metadata only and never edits the assembled document.

The internal release gate is 95/100 plus critical integrity and quality checks.
The `90-plus-likely` label is only a pre-test estimate; external Resume Worded
results remain the source of truth for that platform.

External test records are scoped by generation ID, JD ID/hash, and exact final
document fingerprint. They may route feedback to an isolated engine, but they
cannot carry generated resume content or assumptions into another JD run.
