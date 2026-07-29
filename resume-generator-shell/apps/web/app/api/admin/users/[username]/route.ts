import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { assertAdmin, getSessionFromCookies } from "../../../../../lib/auth";
import type { UserRole } from "../../../../../lib/auth-types";
import type { AccountStatus } from "../../../../../lib/user-account-store";
import {
  deleteStoredAccount,
  updateStoredAccount,
} from "../../../../../lib/user-account-store";
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
              : status === 404
                ? "NOT_FOUND"
                : status === 409
                  ? "USERNAME_TAKEN"
                  : "ADMIN_USER_UPDATE_FAILED",
        message:
          error instanceof Error ? error.message : "Administrator action failed.",
      },
    },
    { status: Number.isFinite(status) ? status : 400 },
  );
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ username: string }> },
): Promise<Response> {
  try {
    const jar = await cookies();
    const admin = assertAdmin(await getSessionFromCookies(jar));
    const { username } = await context.params;
    const payload = await readJsonWithLimit<{
      username?: string;
      password?: string;
      role?: UserRole;
      status?: AccountStatus;
    }>(request);

    const result = await updateStoredAccount({
      username,
      updatedBy: admin.username,
      ...(payload.username ? { nextUsername: payload.username } : {}),
      ...(payload.password ? { password: payload.password } : {}),
      ...(payload.role ? { role: payload.role } : {}),
      ...(payload.status ? { status: payload.status } : {}),
    });

    return NextResponse.json(result);
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
    const jar = await cookies();
    const admin = assertAdmin(await getSessionFromCookies(jar));
    const { username } = await context.params;
    const account = await deleteStoredAccount({
      username,
      deletedBy: admin.username,
    });
    return NextResponse.json({ account });
  } catch (error) {
    return errorResponse(error);
  }
}
