import type { FinalResumeData } from "@resume/contracts";
import { AtsDocxRenderer } from "./docx/docx-renderer";
import { AtsHtmlRenderer } from "./html-renderer";
import { AtsPdfRenderer } from "./pdf/pdf-renderer";
import { AtsTextRenderer } from "./text-renderer";
import type {
  ResumeExportArtifact,
  ResumeExportFormat,
  ResumeFormatRenderer,
  ResumeRenderer,
} from "./types";
import { checksumHex } from "./utils/binary";
import {
  mimeTypeFor,
  ResumeExportIntegrityValidator,
} from "./validation/export-integrity-validator";

const EXTENSIONS: Record<ResumeExportFormat, string> = {
  html: "html",
  txt: "txt",
  docx: "docx",
  pdf: "pdf",
};

function transliterateFilename(value: string): string {
  const replacements: Record<string, string> = {
    "Ł": "L", "ł": "l", "Đ": "D", "đ": "d", "Ø": "O", "ø": "o",
    "Æ": "AE", "æ": "ae", "Œ": "OE", "œ": "oe", "ß": "ss",
    "Þ": "Th", "þ": "th", "Ð": "D", "ð": "d",
  };
  return Array.from(value).map((character) => replacements[character] ?? character).join("");
}

function safeFilenamePart(value: string): string {
  return transliterateFilename(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function filenameStem(data: FinalResumeData): string {
  const name = safeFilenamePart(data.profile.personalInformation.fullName);
  const role = safeFilenamePart(data.summary.targetRole.title);
  return [name || "candidate", role || "resume"].join("-");
}

export interface ProductionResumeRendererOptions {
  renderers?: ResumeFormatRenderer[];
  pdfRenderer?: ResumeFormatRenderer;
}

export class ProductionResumeRenderer implements ResumeRenderer {
  private readonly renderers: Map<ResumeExportFormat, ResumeFormatRenderer>;

  constructor(
    options: ProductionResumeRendererOptions = {},
    private readonly validator = new ResumeExportIntegrityValidator(),
  ) {
    const renderers = options.renderers ?? [
      new AtsHtmlRenderer(),
      new AtsTextRenderer(),
      new AtsDocxRenderer(),
      options.pdfRenderer ?? new AtsPdfRenderer(),
    ];
    this.renderers = new Map(renderers.map((renderer) => [renderer.format, renderer]));
  }

  async export(data: FinalResumeData, format: ResumeExportFormat): Promise<ResumeExportArtifact> {
    const renderer = this.renderers.get(format);
    if (!renderer) throw new Error(`No renderer is registered for ${format}.`);
    const result = await renderer.render(data);
    const mimeType = mimeTypeFor(format);
    const validation = this.validator.validate(data, result, mimeType);
    if (validation.overallStatus !== "approved") {
      const messages = validation.issues
        .filter((issue) => issue.severity === "error")
        .map((issue) => issue.message)
        .join(" ");
      throw new Error(`Resume export rejected. ${messages}`.trim());
    }
    return {
      format,
      filename: `${filenameStem(data)}.${EXTENSIONS[format]}`,
      mimeType,
      bytes: result.bytes,
      byteLength: result.bytes.length,
      artifactChecksum: checksumHex(result.bytes),
      sourceDocumentFingerprint: data.document.contentFingerprint,
      emittedTokens: result.emittedTokens,
      validation,
    };
  }

  async renderWeb(data: FinalResumeData): Promise<string> {
    const artifact = await this.export(data, "html");
    return new TextDecoder().decode(artifact.bytes);
  }

  async renderText(data: FinalResumeData): Promise<Uint8Array> {
    return (await this.export(data, "txt")).bytes;
  }

  async renderDocx(data: FinalResumeData): Promise<Uint8Array> {
    return (await this.export(data, "docx")).bytes;
  }

  async renderPdf(data: FinalResumeData): Promise<Uint8Array> {
    return (await this.export(data, "pdf")).bytes;
  }
}
