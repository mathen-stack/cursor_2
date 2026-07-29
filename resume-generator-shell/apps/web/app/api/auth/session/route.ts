import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken } from "../../../../lib/auth";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value;
  const session = verifySessionToken(token);
  if (!session) {
    return Response.json({ user: null }, { status: 401 });
  }
  return Response.json({
    user: {
      username: session.username,
      displayName: session.displayName,
    },
  });
}
