import { createHmac, timingSafeEqual } from "node:crypto";
import type { UserRole } from "./auth-types";
import {
  findStoredAccount,
  listStoredAccounts,
  verifyPassword,
} from "./user-account-store";

export type { UserRole } from "./auth-types";

export const SESSION_COOKIE_NAME = "resume_tailor_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

export type AuthUser = {
  username: string;
  displayName: string;
  role: UserRole;
};

export type SessionPayload = AuthUser & {
  exp: number;
};

function authSecret(): string {
  return (
    process.env.RESUME_AUTH_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    "resume-tailor-dev-secret-change-me"
  );
}

export async function listAuthUsers(): Promise<AuthUser[]> {
  const users = await listStoredAccounts();
  return users.map((user) => ({
    username: user.username,
    displayName: user.displayName,
    role: user.role,
  }));
}

export async function authenticateCredentials(
  username: string,
  password: string,
): Promise<
  | { ok: true; user: AuthUser }
  | { ok: false; reason: "invalid" | "pending" }
> {
  const match = await findStoredAccount(username);
  if (!match) return { ok: false, reason: "invalid" };
  if (!verifyPassword(password, match.passwordHash, match.passwordSalt)) {
    return { ok: false, reason: "invalid" };
  }
  if (match.status === "pending") {
    return { ok: false, reason: "pending" };
  }
  return {
    ok: true,
    user: {
      username: match.username,
      displayName: match.displayName,
      role: match.role,
    },
  };
}

function encodeBase64Url(value: string | Buffer): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + "=".repeat(padLength), "base64").toString("utf8");
}

function signPayload(payload: string): string {
  return encodeBase64Url(
    createHmac("sha256", authSecret()).update(payload).digest(),
  );
}

export function createSessionToken(user: AuthUser): string {
  const payload: SessionPayload = {
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const body = encodeBase64Url(JSON.stringify(payload));
  const signature = signPayload(body);
  return `${body}.${signature}`;
}

export function verifySessionToken(
  token: string | undefined | null,
): SessionPayload | null {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = signPayload(body);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return null;
  }
  try {
    const payload = JSON.parse(decodeBase64Url(body)) as SessionPayload;
    if (
      !payload ||
      typeof payload.username !== "string" ||
      typeof payload.displayName !== "string" ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }
    if (payload.exp < Date.now()) return null;
    return {
      username: payload.username,
      displayName: payload.displayName,
      role: payload.role === "admin" ? "admin" : "user",
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

export function sessionCookieOptions(
  maxAgeSeconds = Math.floor(SESSION_TTL_MS / 1000),
) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export async function getSessionFromCookies(
  cookieStore: { get: (name: string) => { value: string } | undefined },
): Promise<SessionPayload | null> {
  return verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
}

export function assertAdmin(session: SessionPayload | null): SessionPayload {
  if (!session) {
    throw Object.assign(new Error("Login required."), { status: 401 });
  }
  if (session.role !== "admin") {
    throw Object.assign(new Error("Administrator access required."), {
      status: 403,
    });
  }
  return session;
}
