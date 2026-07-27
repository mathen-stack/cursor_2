# Milestone 11: Production Summary Engine

Milestone 11 replaces the Summary Engine placeholder inside the full resume-generator project with a real, isolated, deterministic implementation.

## Pipeline

1. Target-role and role-family detection from the immutable JD.
2. Seniority detection from the title, leadership signals, and experience requirements.
3. Years-of-experience selection using this strict order:
   - explicit JD requirement;
   - non-overlapping career timeline;
   - conservative seniority inference.
4. Direct JD keyword allocation for domains, technologies, outcomes, leadership, and collaboration.
5. 50-80 word ATS-friendly summary composition.
6. Resume Worded-style validation and readiness scoring.

## Validation

The engine validates word count, target-role presence, years of experience, direct JD keyword coverage, seniority alignment, personal pronouns, clichés, weak phrasing, keyword stuffing, sentence structure, ATS-safe language, and immutable-JD evidence.

Every output carries the original generation context. Summary runs for different JDs never share keywords, role analysis, years calculations, validation state, or generated text.
