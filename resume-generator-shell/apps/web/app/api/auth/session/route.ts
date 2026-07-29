import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
  verifySessionToken,
} from "../../../../lib/auth";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value;
  const session = verifySessionToken(token);
  if (!session) {
    const response = NextResponse.json({ user: null }, { status: 401 });
    if (token) {
      response.cookies.set(SESSION_COOKIE_NAME, "", {
        ...sessionCookieOptions(0),
        maxAge: 0,
      });
    }
    return response;
  }
  return NextResponse.json({
    user: {
      username: session.username,
      displayName: session.displayName,
      role: session.role,
    },
  });
}
