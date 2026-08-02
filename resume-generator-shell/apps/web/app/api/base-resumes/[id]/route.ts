import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSessionFromCookies } from "../../../../lib/auth";
import {
  deleteBaseResume,
  readBaseResume,
  setBaseResumeFavorite,
} from "../../../../lib/base-resume-store";
import {
  readJsonWithLimit,
  requestLimitErrorResponse,
} from "../../../../lib/request-limits";

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

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { session, response } = await requireSession();
    if (!session || response) return response!;
    const { id } = await context.params;
    const resume = await readBaseResume(session.username, id);
    if (!resume) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Base resume not found." } },
        { status: 404 },
      );
    }
    return NextResponse.json({ resume });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "BASE_RESUME_LOAD_FAILED",
          message:
            error instanceof Error ? error.message : "Could not load base resume.",
        },
      },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { session, response } = await requireSession();
    if (!session || response) return response!;
    const { id } = await context.params;
    const payload = await readJsonWithLimit<{ isFavorite?: boolean }>(request);
    if (typeof payload.isFavorite !== "boolean") {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "Provide isFavorite boolean.",
          },
        },
        { status: 400 },
      );
    }
    const resume = await setBaseResumeFavorite({
      username: session.username,
      id,
      isFavorite: payload.isFavorite,
    });
    if (!resume) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Base resume not found." } },
        { status: 404 },
      );
    }
    return NextResponse.json({
      resume: {
        id: resume.id,
        title: resume.title,
        originalFilename: resume.originalFilename,
        isFavorite: resume.isFavorite,
        roleCount: resume.extracted.experiences.length,
        stacks: resume.extracted.stacks.slice(0, 12),
        createdAt: resume.createdAt,
        updatedAt: resume.updatedAt,
      },
    });
  } catch (error) {
    const limitResponse = requestLimitErrorResponse(error);
    if (limitResponse) {
      return new NextResponse(limitResponse.body, {
        status: limitResponse.status,
        headers: limitResponse.headers,
      });
    }
    return NextResponse.json(
      {
        error: {
          code: "BASE_RESUME_UPDATE_FAILED",
          message:
            error instanceof Error ? error.message : "Could not update base resume.",
        },
      },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { session, response } = await requireSession();
    if (!session || response) return response!;
    const { id } = await context.params;
    const deleted = await deleteBaseResume(session.username, id);
    if (!deleted) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Base resume not found." } },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "BASE_RESUME_DELETE_FAILED",
          message:
            error instanceof Error ? error.message : "Could not delete base resume.",
        },
      },
      { status: 500 },
    );
  }
}
