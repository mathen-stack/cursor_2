import { NextResponse } from "next/server";
import {
  authenticateCredentials,
  createSessionToken,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "../../../../lib/auth";
import {
  readJsonWithLimit,
  requestLimitErrorResponse,
} from "../../../../lib/request-limits";

export const runtime = "nodejs";

type LoginPayload = {
  username?: string;
  password?: string;
};

export async function POST(request: Request): Promise<Response> {
  try {
    const payload = await readJsonWithLimit<LoginPayload>(request);
    const username = payload.username?.trim() ?? "";
    const password = payload.password ?? "";
    if (!username || !password) {
      return Response.json(
        {
          error: {
            code: "INVALID_LOGIN",
            message: "Username and password are required.",
          },
        },
        { status: 400 },
      );
    }

    const user = authenticateCredentials(username, password);
    if (!user) {
      return Response.json(
        {
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Invalid username or password.",
          },
        },
        { status: 401 },
      );
    }

    const token = createSessionToken(user);
    const response = NextResponse.json({
      user: {
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      },
    });
    response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
    return response;
  } catch (error) {
    const limitResponse = requestLimitErrorResponse(error);
    if (limitResponse) return limitResponse;
    return Response.json(
      {
        error: {
          code: "LOGIN_FAILED",
          message: error instanceof Error ? error.message : "Login failed.",
        },
      },
      { status: 400 },
    );
  }
}
