import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { compactProfile } from "@/lib/profile";
import { parseCandidateProfile } from "@/lib/profile-schema";
import { toPublicUser, updateUserProfile } from "@/lib/store";
import { ZodError } from "zod";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
  }
  return NextResponse.json({ ok: true, profile: user.profile });
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const profile = compactProfile(parseCandidateProfile(body));
    if (!profile.personal.name.trim()) {
      return NextResponse.json(
        { ok: false, error: "Add your name before saving." },
        { status: 400 },
      );
    }
    const updated = await updateUserProfile(user.id, profile);
    return NextResponse.json({ ok: true, user: toPublicUser(updated) });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { ok: false, error: "Profile fields are invalid." },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Could not save profile.",
      },
      { status: 400 },
    );
  }
}
