import {
  AtsPdfRenderer,
  LibreOfficePdfRenderer,
  ProductionResumeRenderer,
} from "@resume/rendering";

interface RenderingGlobal {
  __resumeRenderer?: ProductionResumeRenderer;
}

const globalRenderer = globalThis as typeof globalThis & RenderingGlobal;

export function getResumeRenderer(): ProductionResumeRenderer {
  if (!globalRenderer.__resumeRenderer) {
    const backend = process.env.RESUME_PDF_BACKEND ?? "portable";
    const pdfRenderer = backend === "libreoffice"
      ? new LibreOfficePdfRenderer({
          binary: process.env.LIBREOFFICE_BINARY || "soffice",
          timeoutMs: Number(process.env.RESUME_PDF_TIMEOUT_MS ?? "45000"),
        })
      : new AtsPdfRenderer();
    globalRenderer.__resumeRenderer = new ProductionResumeRenderer({ pdfRenderer });
  }
  return globalRenderer.__resumeRenderer;
}
