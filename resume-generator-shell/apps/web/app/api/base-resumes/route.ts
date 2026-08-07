import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSessionFromCookies } from "../../../lib/auth";
import { extractResumeText } from "../../../lib/base-resume-extract";
import { parseBaseResumeText } from "../../../lib/base-resume-parser";
import {
  createBaseResume,
  listBaseResumeSummaries,
} from "../../../lib/base-resume-store";

export const runtime = "nodejs";

async function requireSession() {
  const jar = await cookies();
  const session = await getSessionFromCookies(jar);
  if (!session) {
    return {
      session: null as null,
      response: NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Login required." } },
        { status: 401 },
      ),
    };
  }
  return { session, response: null };
}

export async function GET(): Promise<Response> {
  try {
    const { session, response } = await requireSession();
    if (!session || response) return response!;
    const resumes = await listBaseResumeSummaries(session.username);
    return NextResponse.json({ resumes });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "BASE_RESUME_LIST_FAILED",
          message:
            error instanceof Error ? error.message : "Could not list base resumes.",
        },
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const { session, response } = await requireSession();
    if (!session || response) return response!;

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_UPLOAD",
            message: "Attach a resume file under the \"file\" field.",
          },
        },
        { status: 400 },
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const extractedText = await extractResumeText({
      filename: file.name || "resume.txt",
      mimeType: file.type || "application/octet-stream",
      bytes,
    });
    const extracted = parseBaseResumeText(extractedText.text);
    const title =
      String(form.get("title") || "").trim() ||
      extracted.personalInformation.fullName?.trim() ||
      file.name.replace(/\.[^.]+$/, "") ||
      "Uploaded resume";

    const record = await createBaseResume({
      username: session.username,
      title,
      originalFilename: file.name || "resume.txt",
      mimeType: extractedText.mimeType,
      rawText: extractedText.text,
      extracted,
      isFavorite: String(form.get("isFavorite") || "") === "true",
    });

    return NextResponse.json(
      {
        resume: {
          id: record.id,
          title: record.title,
          originalFilename: record.originalFilename,
          isFavorite: record.isFavorite,
          roleCount: record.extracted.experiences.length,
          stacks: record.extracted.stacks.slice(0, 12),
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        },
        extracted: record.extracted,
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "BASE_RESUME_UPLOAD_FAILED",
          message:
            error instanceof Error ? error.message : "Could not upload resume.",
        },
      },
      { status: 400 },
    );
  }
}
