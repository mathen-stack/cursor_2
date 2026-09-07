import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "rt_session";
const SESSION_DAYS = 30;

export type SessionPayload = {
  sub: string;
  email: string;
};

function getSecretKey() {
  const secret =
    process.env.AUTH_SECRET || "dev-insecure-resume-tailor-change-AUTH_SECRET";
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(user: { id: string; email: string }) {
  return new SignJWT({ email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(getSecretKey());
}

export async function verifySessionToken(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    const sub = typeof payload.sub === "string" ? payload.sub : "";
    const email = typeof payload.email === "string" ? payload.email : "";
    if (!sub || !email) return null;
    return { sub, email };
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  };
}
