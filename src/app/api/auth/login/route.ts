import { NextResponse } from "next/server";
import { setSessionCookie, verifyPassword } from "@/lib/auth";
import { authCredentialsSchema } from "@/lib/profile-schema";
import { findUserByEmail, toPublicUser } from "@/lib/store";
import { ZodError } from "zod";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const credentials = authCredentialsSchema.parse(body);
    const user = await findUserByEmail(credentials.email);
    if (!user || !(await verifyPassword(credentials.password, user.passwordHash))) {
      return NextResponse.json(
        { ok: false, error: "Invalid email or password." },
        { status: 401 },
      );
    }
    await setSessionCookie(user);
    return NextResponse.json({ ok: true, user: toPublicUser(user) });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { ok: false, error: err.issues[0]?.message || "Invalid login details." },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "Could not sign in." },
      { status: 400 },
    );
  }
}
