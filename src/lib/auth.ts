import { compare, hash } from "bcryptjs";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
  verifySessionToken,
  type SessionPayload,
} from "./session";
import { findUserById, toPublicUser, type StoredUser } from "./store";

export { SESSION_COOKIE, verifySessionToken };
export type { SessionPayload };

export async function hashPassword(password: string) {
  return hash(password, 10);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return compare(password, passwordHash);
}

export async function setSessionCookie(user: Pick<StoredUser, "id" | "email">) {
  const token = await createSessionToken(user);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, sessionCookieOptions());
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", {
    ...sessionCookieOptions(),
    maxAge: 0,
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;
  const user = await findUserById(session.sub);
  if (!user) return null;
  return toPublicUser(user);
}
