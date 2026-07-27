# Milestone 14: ATS-Safe Rendering and Export Integrity

Milestone 14 adds production rendering adapters for HTML, plain text, DOCX,
and PDF. Rendering is downstream of immutable final assembly. It may position
and style approved content, but it may not rewrite, shorten, deduplicate,
filter, reorder, or silently normalize resume content.

## Canonical rendering model

`createCanonicalResume` converts the final assembled document into a stable
ordered line and token stream. Every renderer must return the exact token trace
it emitted. Export validation compares this trace with the assembled source,
including duplicates and order.

The canonical model covers:

- contact name and details;
- section headings in Template Engine order;
- the exact Summary Engine text;
- ordered skill categories and skills;
- assigned roles, companies, dates, and exact Experience Engine bullets;
- user-entered education.

## Renderers

### DOCX

The DOCX renderer creates a standards-based OOXML package without third-party
runtime dependencies. It uses:

- one document column;
- normal paragraphs rather than core-content tables or text boxes;
- ordinary Word bullet numbering;
- selectable Unicode text;
- template-controlled page size, margins, typography, spacing, alignment, and
  section borders;
- no important content in headers or footers.

### PDF

The portable PDF renderer creates selectable text directly. It uses standard
Helvetica/Helvetica Bold with WinAnsi encoding for common resume text and a
Unicode CID fallback for characters outside WinAnsi. It supports Letter and A4,
automatic wrapping, page breaks, hanging bullet indentation, and template-based
spacing.

For full Unicode and Word/PDF layout parity, deployments can set
`RESUME_PDF_BACKEND=libreoffice`. The optional LibreOffice adapter converts the
validated DOCX in an isolated temporary directory and returns the resulting
selectable-text PDF. The portable adapter remains the dependency-free default
and does not copy or expose font files.

### Plain text and HTML

Plain text preserves top-to-bottom ATS reading order and uses ASCII hyphens for
bullet prefixes. HTML uses semantic headings, paragraphs, lists, and articles
with a single-column print stylesheet.

## Export integrity gate

Every export is rejected unless all checks pass:

1. Summary, Skills, Experience, and Template outputs match the current
   generation context.
2. Final assembly is approved.
3. Stored source fingerprints still match the profile and all engine outputs.
4. The final document fingerprint still matches the assembled document.
5. Template section order is unchanged.
6. Every canonical source token appears exactly once in the expected sequence,
   including legitimate duplicate values.
7. No unexpected content is emitted.
8. The artifact is non-empty and has the correct MIME type.
9. The renderer confirms selectable text and ATS-safe single-column structure.

The export artifact records its filename, MIME type, byte length, checksum,
source document fingerprint, token trace, validation result, and warnings.

## Web integration

The completed-resume preview now offers DOCX, PDF, and TXT export buttons.
`POST /api/resume/export` returns the approved artifact with download headers
and integrity metadata:

- `X-Resume-Checksum`;
- `X-Resume-Source-Fingerprint`;
- `X-Resume-Export-Status`.

The endpoint rejects altered or cross-generation resume data.

## Verification performed

The milestone includes tests for:

- all four formats;
- DOCX and PDF signatures;
- exact token and order preservation;
- omitted-content rejection;
- post-assembly tampering rejection;
- concurrent export isolation.

DOCX was unzipped, converted with LibreOffice, and visually inspected. Portable
PDF output was rendered to PNG, text-extracted, and visually inspected. Both
one-page and two-page fixtures were checked for clipping, overlap, broken
bullets, reading-order problems, and missing text.
