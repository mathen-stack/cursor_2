import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE_NAME = "resume_tailor_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

export type AuthUser = {
  username: string;
  displayName: string;
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

/** Parse `user:pass,user2:pass2` from env, with a built-in demo account. */
export function listAuthUsers(): Array<{ username: string; password: string; displayName: string }> {
  const configured = process.env.RESUME_AUTH_USERS?.trim();
  const users: Array<{ username: string; password: string; displayName: string }> = [];

  if (configured) {
    for (const part of configured.split(",")) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const splitAt = trimmed.indexOf(":");
      if (splitAt <= 0) continue;
      const username = trimmed.slice(0, splitAt).trim().toLowerCase();
      const password = trimmed.slice(splitAt + 1);
      if (!username || !password) continue;
      users.push({
        username,
        password,
        displayName: username,
      });
    }
  }

  if (users.length === 0) {
    users.push({
      username: "demo",
      password: "demo123",
      displayName: "demo",
    });
  }

  return users;
}

export function authenticateCredentials(
  username: string,
  password: string,
): AuthUser | null {
  const normalized = username.trim().toLowerCase();
  const match = listAuthUsers().find((user) => user.username === normalized);
  if (!match) return null;
  const left = Buffer.from(match.password);
  const right = Buffer.from(password);
  if (left.length !== right.length) return null;
  if (!timingSafeEqual(left, right)) return null;
  return {
    username: match.username,
    displayName: match.displayName,
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
    exp: Date.now() + SESSION_TTL_MS,
  };
  const body = encodeBase64Url(JSON.stringify(payload));
  const signature = signPayload(body);
  return `${body}.${signature}`;
}

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
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
    return payload;
  } catch {
    return null;
  }
}

export function sessionCookieOptions(maxAgeSeconds = Math.floor(SESSION_TTL_MS / 1000)) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
