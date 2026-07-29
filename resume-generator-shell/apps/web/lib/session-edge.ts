import { NextResponse, type NextRequest } from "next/server";

export const SESSION_COOKIE_NAME = "resume_tailor_session";

function authSecret(): string {
  return (
    process.env.RESUME_AUTH_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    "resume-tailor-dev-secret-change-me"
  );
}

function encodeBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (let index = 0; index < view.length; index += 1) {
    binary += String.fromCharCode(view[index]!);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (padded.length % 4)) % 4;
  const base64 = padded + "=".repeat(padLength);
  return atob(base64);
}

async function signPayload(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return encodeBase64Url(signature);
}

export async function isValidSessionToken(
  token: string | undefined | null,
): Promise<boolean> {
  if (!token) return false;
  const [body, signature] = token.split(".");
  if (!body || !signature) return false;
  const expected = await signPayload(body);
  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
  }
  if (mismatch !== 0) return false;
  try {
    const payload = JSON.parse(decodeBase64Url(body)) as {
      username?: string;
      displayName?: string;
      exp?: number;
    };
    if (
      !payload ||
      typeof payload.username !== "string" ||
      typeof payload.displayName !== "string" ||
      typeof payload.exp !== "number"
    ) {
      return false;
    }
    return payload.exp >= Date.now();
  } catch {
    return false;
  }
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function getRequestSessionState(
  request: NextRequest,
): Promise<"valid" | "invalid" | "missing"> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return "missing";
  return (await isValidSessionToken(token)) ? "valid" : "invalid";
}
