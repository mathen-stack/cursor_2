import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { UserProfile } from "@resume/contracts";
import {
  assertAdmin,
  getSessionFromCookies,
  listAuthUsers,
} from "../../../../../lib/auth";
import { createEmptyProfile } from "../../../../../lib/saved-profile-store";
import {
  deleteUserProfileRecord,
  readUserProfileRecord,
  sanitizeProfileUsername,
  writeUserProfileRecord,
} from "../../../../../lib/user-profile-store";
import {
  readJsonWithLimit,
  requestLimitErrorResponse,
} from "../../../../../lib/request-limits";

export const runtime = "nodejs";

function errorResponse(error: unknown): Response {
  const status =
    error && typeof error === "object" && "status" in error
      ? Number((error as { status: number }).status)
      : 400;
  return NextResponse.json(
    {
      error: {
        code:
          status === 401
            ? "UNAUTHORIZED"
            : status === 403
              ? "FORBIDDEN"
              : "ADMIN_PROFILE_FAILED",
        message:
          error instanceof Error ? error.message : "Administrator action failed.",
      },
    },
    { status: Number.isFinite(status) ? status : 400 },
  );
}

async function requireAdmin() {
  const jar = await cookies();
  return assertAdmin(await getSessionFromCookies(jar));
}

function ensureKnownUser(username: string): string {
  const safe = sanitizeProfileUsername(username);
  const known = listAuthUsers().some((user) => user.username === safe);
  if (!known) {
    throw Object.assign(new Error("Unknown user account."), { status: 404 });
  }
  return safe;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ username: string }> },
): Promise<Response> {
  try {
    await requireAdmin();
    const { username: rawUsername } = await context.params;
    const username = ensureKnownUser(rawUsername);
    const record = await readUserProfileRecord(username);
    if (!record) {
      return NextResponse.json({
        username,
        savedAt: null,
        updatedBy: null,
        profile: createEmptyProfile(),
        hasProfile: false,
      });
    }
    return NextResponse.json({
      username: record.username,
      savedAt: record.savedAt,
      updatedBy: record.updatedBy,
      profile: record.profile,
      hasProfile: true,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ username: string }> },
): Promise<Response> {
  try {
    const admin = await requireAdmin();
    const { username: rawUsername } = await context.params;
    const username = ensureKnownUser(rawUsername);
    const payload = await readJsonWithLimit<{ profile?: UserProfile }>(request);
    if (!payload.profile) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_PROFILE",
            message: "A profile payload is required.",
          },
        },
        { status: 400 },
      );
    }
    const record = await writeUserProfileRecord({
      username,
      profile: payload.profile,
      updatedBy: admin.username,
    });
    return NextResponse.json({
      username: record.username,
      savedAt: record.savedAt,
      updatedBy: record.updatedBy,
      profile: record.profile,
      hasProfile: true,
    });
  } catch (error) {
    const limitResponse = requestLimitErrorResponse(error);
    if (limitResponse) return limitResponse;
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ username: string }> },
): Promise<Response> {
  try {
    await requireAdmin();
    const { username: rawUsername } = await context.params;
    const username = ensureKnownUser(rawUsername);
    const deleted = await deleteUserProfileRecord(username);
    return NextResponse.json({
      username,
      deleted,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
