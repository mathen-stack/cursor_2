import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { FinalResumeData } from "@resume/contracts";
import { createCanonicalResume } from "../canonical/canonical-resume";
import { AtsDocxRenderer } from "../docx/docx-renderer";
import type { ResumeFormatRenderer, ResumeRenderResult } from "../types";

const execFileAsync = promisify(execFile);

export interface LibreOfficePdfRendererOptions {
  binary?: string;
  timeoutMs?: number;
}

export class LibreOfficePdfRenderer implements ResumeFormatRenderer {
  readonly format = "pdf" as const;
  private readonly binary: string;
  private readonly timeoutMs: number;

  constructor(
    options: LibreOfficePdfRendererOptions = {},
    private readonly docxRenderer = new AtsDocxRenderer(),
  ) {
    this.binary = options.binary ?? "soffice";
    this.timeoutMs = options.timeoutMs ?? 45_000;
  }

  async render(data: FinalResumeData): Promise<ResumeRenderResult> {
    const canonical = createCanonicalResume(data);
    const docx = await this.docxRenderer.render(data);
    const directory = await mkdtemp(join(tmpdir(), "resume-pdf-"));
    const docxPath = join(directory, "resume.docx");
    const pdfPath = join(directory, "resume.pdf");
    try {
      await writeFile(docxPath, docx.bytes);
      await execFileAsync(
        this.binary,
        ["--headless", "--convert-to", "pdf", "--outdir", directory, docxPath],
        {
          timeout: this.timeoutMs,
          windowsHide: true,
          env: { ...process.env, HOME: directory },
        },
      );
      const bytes = new Uint8Array(await readFile(pdfPath));
      if (bytes.length < 100 || new TextDecoder("latin1").decode(bytes.slice(0, 5)) !== "%PDF-") {
        throw new Error("LibreOffice did not produce a valid PDF artifact.");
      }
      return {
        format: this.format,
        bytes,
        emittedTokens: [...canonical.tokens],
        atsSafeStructure: true,
        selectableTextExpected: true,
        warnings: [],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown LibreOffice conversion error.";
      throw new Error(`LibreOffice PDF rendering failed: ${message}`);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}
