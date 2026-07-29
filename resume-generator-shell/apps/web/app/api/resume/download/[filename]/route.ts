import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { getResumeDownloadDirectory } from "../../../../../lib/resume-download-store";

export const runtime = "nodejs";

const ALLOWED_EXTENSIONS = new Set([".pdf", ".docx", ".txt", ".html"]);

export async function GET(
  _request: Request,
  context: { params: Promise<{ filename: string }> },
): Promise<Response> {
  try {
    const { filename: rawName } = await context.params;
    const filename = path.basename(decodeURIComponent(rawName));
    const extension = path.extname(filename).toLowerCase();
    if (!filename || !ALLOWED_EXTENSIONS.has(extension)) {
      return Response.json(
        {
          error: {
            code: "INVALID_DOWNLOAD_NAME",
            message: "A valid resume filename is required.",
          },
        },
        { status: 400 },
      );
    }

    const filePath = path.join(getResumeDownloadDirectory(), filename);
    await access(filePath);
    const bytes = await readFile(filePath);
    return new Response(bytes, {
      status: 200,
      headers: {
        // octet-stream + attachment forces a file download (no PDF tab/window).
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(bytes.byteLength),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json(
      {
        error: {
          code: "DOWNLOAD_NOT_FOUND",
          message: "Resume file was not found in the download folder.",
        },
      },
      { status: 404 },
    );
  }
}
