import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { UserProfile } from "@resume/contracts";
import { getSessionFromCookies } from "../../../lib/auth";
import { createEmptyProfile } from "../../../lib/saved-profile-store";
import {
  readUserProfileRecord,
  writeUserProfileRecord,
} from "../../../lib/user-profile-store";
import {
  readJsonWithLimit,
  requestLimitErrorResponse,
} from "../../../lib/request-limits";

export const runtime = "nodejs";

async function requireSession() {
  const jar = await cookies();
  const session = await getSessionFromCookies(jar);
  if (!session) {
    return {
      session: null,
      response: NextResponse.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Login required.",
          },
        },
        { status: 401 },
      ),
    };
  }
  return { session, response: null };
}

export async function GET(): Promise<Response> {
  const { session, response } = await requireSession();
  if (!session || response) return response!;

  const record = await readUserProfileRecord(session.username);
  if (!record) {
    return Response.json({
      username: session.username,
      savedAt: null,
      updatedBy: null,
      profile: createEmptyProfile(),
    });
  }
  return Response.json({
    username: record.username,
    savedAt: record.savedAt,
    updatedBy: record.updatedBy,
    profile: record.profile,
  });
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const { session, response } = await requireSession();
    if (!session || response) return response!;

    const payload = await readJsonWithLimit<{ profile?: UserProfile }>(request);
    if (!payload.profile) {
      return Response.json(
        {
          error: {
            code: "INVALID_PROFILE",
            message: "A profile payload is required.",
          },
        },
        { status: 400 },
      );
    }
    if (!payload.profile.personalInformation?.fullName?.trim()) {
      return Response.json(
        {
          error: {
            code: "INVALID_PROFILE",
            message: "Enter your full name before saving the profile.",
          },
        },
        { status: 400 },
      );
    }

    const record = await writeUserProfileRecord({
      username: session.username,
      profile: payload.profile,
      updatedBy: session.username,
    });

    return Response.json({
      username: record.username,
      savedAt: record.savedAt,
      updatedBy: record.updatedBy,
      profile: record.profile,
    });
  } catch (error) {
    const limitResponse = requestLimitErrorResponse(error);
    if (limitResponse) return limitResponse;
    return Response.json(
      {
        error: {
          code: "PROFILE_SAVE_FAILED",
          message:
            error instanceof Error ? error.message : "Could not save profile.",
        },
      },
      { status: 400 },
    );
  }
}
