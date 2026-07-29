import type { FinalResumeData, FinalResumeSection } from "@resume/contracts";
import { fingerprint } from "@resume/core";
import { createCanonicalResume } from "../canonical/canonical-resume";
import type {
  ResumeExportIntegrityValidation,
  ResumeExportIssue,
  ResumeExportFormat,
  ResumeRenderResult,
} from "../types";

const MIME_TYPES: Record<ResumeExportFormat, string> = {
  html: "text/html; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
};

function sameArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function contextMatches(data: FinalResumeData): boolean {
  const expected = data.context;
  return [data.summary.context, data.skills.context, data.experience.context, data.template.context].every(
    (context) =>
      context.generationId === expected.generationId &&
      context.profileId === expected.profileId &&
      context.jdId === expected.jdId &&
      context.jdHash === expected.jdHash,
  );
}

export class ResumeExportIntegrityValidator {
  validate(
    data: FinalResumeData,
    result: ResumeRenderResult,
    mimeType: string,
  ): ResumeExportIntegrityValidation {
    const canonical = createCanonicalResume(data);
    const issues: ResumeExportIssue[] = [];
    const generationContextApproved = contextMatches(data);
    const assemblyApproved = data.assemblyValidation.overallStatus === "approved";
    const sourceFingerprintsApproved =
      data.document.sourceFingerprints.profile === fingerprint(data.profile) &&
      data.document.sourceFingerprints.summary === fingerprint(data.summary) &&
      data.document.sourceFingerprints.skills === fingerprint(data.skills) &&
      data.document.sourceFingerprints.experience === fingerprint(data.experience) &&
      data.document.sourceFingerprints.template === fingerprint(data.template);
    const { contentFingerprint: _contentFingerprint, ...documentWithoutFingerprint } = data.document;
    const documentFingerprintApproved =
      fingerprint(documentWithoutFingerprint) === data.document.contentFingerprint;
    const sectionOrderPreserved = sameArray(
      data.document.sectionOrder,
      data.document.sections.map((section: FinalResumeSection) => section.id),
    );
    const sourceTokensPreserved =
      canonical.tokens.length === result.emittedTokens.length &&
      canonical.tokens.every((token) => result.emittedTokens.includes(token));
    const sourceTokenOrderPreserved = sameArray(canonical.tokens, result.emittedTokens);
    const noUnexpectedTokens = result.emittedTokens.every((token) => canonical.tokens.includes(token));
    const nonEmptyArtifact = result.bytes.length > 0;
    const mimeTypeApproved = mimeType === MIME_TYPES[result.format];
    const atsSafeStructureApproved = result.atsSafeStructure;
    const selectableTextExpected = result.selectableTextExpected;

    const checks: Array<[boolean, string, string]> = [
      [generationContextApproved, "EXPORT_CONTEXT_MISMATCH", "One or more source engine outputs belong to a different generation context."],
      [assemblyApproved, "EXPORT_ASSEMBLY_NOT_APPROVED", "The final resume assembly is not approved."],
      [sourceFingerprintsApproved, "EXPORT_SOURCE_FINGERPRINT_MISMATCH", "One or more source engine outputs changed after final assembly."],
      [documentFingerprintApproved, "EXPORT_DOCUMENT_FINGERPRINT_MISMATCH", "The assembled resume document changed after fingerprinting."],
      [sectionOrderPreserved, "EXPORT_SECTION_ORDER_CHANGED", "The assembled section order is inconsistent."],
      [sourceTokensPreserved, "EXPORT_SOURCE_CONTENT_MISSING", "One or more source content tokens were omitted during rendering."],
      [sourceTokenOrderPreserved, "EXPORT_SOURCE_ORDER_CHANGED", "Source content token order changed during rendering."],
      [noUnexpectedTokens, "EXPORT_UNEXPECTED_CONTENT", "The renderer emitted content that does not belong to the assembled resume."],
      [nonEmptyArtifact, "EXPORT_EMPTY_ARTIFACT", "The rendered artifact is empty."],
      [mimeTypeApproved, "EXPORT_MIME_TYPE_INVALID", "The export MIME type does not match its format."],
      [atsSafeStructureApproved, "EXPORT_ATS_STRUCTURE_UNSAFE", "The renderer did not confirm an ATS-safe single-column structure."],
      [selectableTextExpected, "EXPORT_TEXT_NOT_SELECTABLE", "The renderer did not confirm selectable text."],
    ];
    for (const [approved, issueCode, message] of checks) {
      if (!approved) issues.push({ issueCode, severity: "error", message });
    }
    for (const warning of result.warnings) {
      issues.push({ issueCode: "EXPORT_RENDERER_WARNING", severity: "warning", message: warning });
    }
    return {
      generationContextApproved,
      assemblyApproved,
      sourceFingerprintsApproved,
      documentFingerprintApproved,
      sectionOrderPreserved,
      sourceTokensPreserved,
      sourceTokenOrderPreserved,
      noUnexpectedTokens,
      nonEmptyArtifact,
      mimeTypeApproved,
      atsSafeStructureApproved,
      selectableTextExpected,
      overallStatus: issues.some((issue) => issue.severity === "error") ? "rejected" : "approved",
      issues,
    };
  }
}

export function mimeTypeFor(format: ResumeExportFormat): string {
  return MIME_TYPES[format];
}
