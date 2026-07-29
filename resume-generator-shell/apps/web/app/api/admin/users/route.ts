import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { assertAdmin, getSessionFromCookies } from "../../../../lib/auth";
import type { UserRole } from "../../../../lib/auth-types";
import {
  createStoredAccount,
  listPublicAccounts,
} from "../../../../lib/user-account-store";
import {
  readJsonWithLimit,
  requestLimitErrorResponse,
} from "../../../../lib/request-limits";

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
              : status === 409
                ? "USERNAME_TAKEN"
                : "ADMIN_USERS_FAILED",
        message:
          error instanceof Error ? error.message : "Administrator action failed.",
      },
    },
    { status: Number.isFinite(status) ? status : 400 },
  );
}

export async function GET(): Promise<Response> {
  try {
    const jar = await cookies();
    assertAdmin(await getSessionFromCookies(jar));
    const users = await listPublicAccounts();
    return NextResponse.json({ users });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const jar = await cookies();
    const admin = assertAdmin(await getSessionFromCookies(jar));
    const payload = await readJsonWithLimit<{
      username?: string;
      password?: string;
      role?: UserRole;
    }>(request);
    const account = await createStoredAccount({
      username: payload.username ?? "",
      password: payload.password ?? "",
      updatedBy: admin.username,
      ...(payload.role ? { role: payload.role } : {}),
    });
    return NextResponse.json({ account }, { status: 201 });
  } catch (error) {
    const limitResponse = requestLimitErrorResponse(error);
    if (limitResponse) return limitResponse;
    return errorResponse(error);
  }
}
