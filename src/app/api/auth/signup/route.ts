import { NextResponse } from "next/server";
import { hashPassword, setSessionCookie } from "@/lib/auth";
import { authCredentialsSchema } from "@/lib/profile-schema";
import { createUser, toPublicUser } from "@/lib/store";
import { ZodError } from "zod";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const credentials = authCredentialsSchema.parse(body);
    const passwordHash = await hashPassword(credentials.password);
    const user = await createUser({
      email: credentials.email,
      passwordHash,
    });
    await setSessionCookie(user);
    return NextResponse.json({ ok: true, user: toPublicUser(user) });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { ok: false, error: err.issues[0]?.message || "Invalid signup details." },
        { status: 400 },
      );
    }
    const message =
      err instanceof Error ? err.message : "Could not create account.";
    const status = message.includes("already exists") ? 409 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
