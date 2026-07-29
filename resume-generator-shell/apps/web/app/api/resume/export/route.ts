import type { FinalResumeData, ResumeExportFormat } from "@resume/contracts";
import {
  readJsonWithLimit,
  requestLimitErrorResponse,
} from "../../../../lib/request-limits";
import { saveResumeToDownloadFolder } from "../../../../lib/resume-download-store";
import { getResumeRenderer } from "../../../../lib/resume-rendering-service";

export const runtime = "nodejs";

const FORMATS = new Set<ResumeExportFormat>(["html", "txt", "docx", "pdf"]);

interface ExportPayload {
  resume?: FinalResumeData;
  format?: ResumeExportFormat;
  /** When true, write to download/ and return JSON — no browser Save As dialog. */
  saveOnly?: boolean;
}

function isExportPayload(
  value: unknown,
): value is Required<Pick<ExportPayload, "resume" | "format">> & ExportPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as ExportPayload;
  return Boolean(
    payload.resume &&
      payload.format &&
      FORMATS.has(payload.format) &&
      payload.resume.context?.generationId &&
      payload.resume.context?.profileId &&
      payload.resume.context?.jdId &&
      payload.resume.context?.jdHash &&
      payload.resume.document?.contentFingerprint,
  );
}

export async function POST(request: Request): Promise<Response> {
  try {
    const payload = await readJsonWithLimit<unknown>(request);
    if (!isExportPayload(payload)) {
      return Response.json(
        {
          error: {
            code: "INVALID_EXPORT_REQUEST",
            message: "A generated resume and valid export format are required.",
          },
        },
        { status: 400 },
      );
    }
    const artifact = await getResumeRenderer().export(payload.resume, payload.format);
    const savedPath = await saveResumeToDownloadFolder(artifact.filename, artifact.bytes);

    if (payload.saveOnly) {
      return Response.json(
        {
          saved: true,
          filename: artifact.filename,
          savedPath,
          format: artifact.format,
          byteLength: artifact.byteLength,
          artifactChecksum: artifact.artifactChecksum,
        },
        {
          status: 200,
          headers: {
            "Cache-Control": "no-store",
            "X-Resume-Saved-Path": savedPath,
          },
        },
      );
    }

    const body = Buffer.from(artifact.bytes);
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${artifact.filename}"`,
        "Content-Length": String(artifact.byteLength),
        "X-Content-Type-Options": "nosniff",
        "X-Resume-Checksum": artifact.artifactChecksum,
        "X-Resume-Source-Fingerprint": artifact.sourceDocumentFingerprint,
        "X-Resume-Export-Status": artifact.validation.overallStatus,
        "X-Resume-Saved-Path": savedPath,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const limitResponse = requestLimitErrorResponse(error);
    if (limitResponse) return limitResponse;
    return Response.json(
      {
        error: {
          code: error instanceof Error ? error.name : "EXPORT_FAILED",
          message: error instanceof Error ? error.message : "Resume export failed.",
        },
      },
      { status: 400 },
    );
  }
}
