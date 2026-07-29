import type { FinalResumeData, ResumeExportFormat } from "@resume/contracts";

export type { ResumeExportFormat } from "@resume/contracts";

export interface ResumeExportIssue {
  issueCode: string;
  severity: "warning" | "error";
  message: string;
}

export interface ResumeExportIntegrityValidation {
  generationContextApproved: boolean;
  assemblyApproved: boolean;
  sourceFingerprintsApproved: boolean;
  documentFingerprintApproved: boolean;
  sectionOrderPreserved: boolean;
  sourceTokensPreserved: boolean;
  sourceTokenOrderPreserved: boolean;
  noUnexpectedTokens: boolean;
  nonEmptyArtifact: boolean;
  mimeTypeApproved: boolean;
  atsSafeStructureApproved: boolean;
  selectableTextExpected: boolean;
  overallStatus: "approved" | "rejected";
  issues: ResumeExportIssue[];
}

export interface ResumeExportArtifact {
  format: ResumeExportFormat;
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
  byteLength: number;
  artifactChecksum: string;
  sourceDocumentFingerprint: string;
  emittedTokens: string[];
  validation: ResumeExportIntegrityValidation;
}

export interface ResumeRenderResult {
  format: ResumeExportFormat;
  bytes: Uint8Array;
  emittedTokens: string[];
  atsSafeStructure: boolean;
  selectableTextExpected: boolean;
  warnings: string[];
}

export interface ResumeFormatRenderer {
  readonly format: ResumeExportFormat;
  render(data: FinalResumeData): Promise<ResumeRenderResult>;
}

export interface ResumeRenderer {
  renderWeb(data: FinalResumeData): Promise<string>;
  renderText(data: FinalResumeData): Promise<Uint8Array>;
  renderDocx(data: FinalResumeData): Promise<Uint8Array>;
  renderPdf(data: FinalResumeData): Promise<Uint8Array>;
  export(data: FinalResumeData, format: ResumeExportFormat): Promise<ResumeExportArtifact>;
}
