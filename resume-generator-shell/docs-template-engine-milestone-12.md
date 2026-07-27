# Milestone 12: Production Template Engine

Milestone 12 replaces the Template Engine placeholder inside the full resume-generator project with a real, isolated, deterministic implementation.

## Pipeline

1. Analyze the immutable JD for target role, role family, seniority, and regional page-size signals.
2. Estimate content volume from career entries, required bullet counts, education entries, summary length, and JD skill density.
3. Select only sections supported by user-provided data.
4. Apply a conventional ATS reading order: Contact, Professional Summary, Skills, Professional Experience, and Education when present.
5. Select a one- or two-page target based on content volume and seniority.
6. Select compact, balanced, or spacious density without shrinking body text below 10 points.
7. Produce a complete rendering definition covering typography, margins, spacing, alignment, section behavior, and ATS safeguards.
8. Validate the full template and assign an internal Resume Worded-style readiness score.

## ATS guarantees

Every approved template uses a single column, top-to-bottom reading order, standard section headings, ordinary text bullets, selectable text, and body-based contact information. Core content never relies on tables, text boxes, icons, graphics, headers, or footers.

## Isolation

The Template Engine receives the original JD and user profile directly. It does not consume Summary, Skills, or Experience outputs and cannot rewrite those engines' content. Every result carries the current generation context, and simultaneous JDs never share role analysis, page-size decisions, content estimates, template IDs, or validation state.

## Rendering boundary

The engine returns layout instructions only. The future Final Assembler and renderer must place approved content according to this definition without rewriting, shortening, reordering, deduplicating, or otherwise modifying Summary, Skills, or Experience outputs.
