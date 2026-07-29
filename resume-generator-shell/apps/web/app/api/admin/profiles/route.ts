import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { assertAdmin, getSessionFromCookies, listAuthUsers } from "../../../../lib/auth";
import { listUserProfileSummaries } from "../../../../lib/user-profile-store";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  try {
    const jar = await cookies();
    const session = assertAdmin(await getSessionFromCookies(jar));
    const usernames = (await listAuthUsers()).map((user) => user.username);
    const profiles = await listUserProfileSummaries(usernames);
    return NextResponse.json({
      admin: session.username,
      profiles,
    });
  } catch (error) {
    const status =
      error && typeof error === "object" && "status" in error
        ? Number((error as { status: number }).status)
        : 400;
    return NextResponse.json(
      {
        error: {
          code: status === 401 ? "UNAUTHORIZED" : status === 403 ? "FORBIDDEN" : "ADMIN_LIST_FAILED",
          message:
            error instanceof Error ? error.message : "Could not list profiles.",
        },
      },
      { status: Number.isFinite(status) ? status : 400 },
    );
  }
}
