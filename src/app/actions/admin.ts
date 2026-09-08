"use server";

import { z } from "zod";
import { requireAdmin } from "@/app/actions/auth";
import { hashPassword } from "@/lib/password";
import { parseProfileDraft } from "@/lib/profile";
import {
  createUser,
  deleteUser,
  profileFromUser,
  saveUserProfile,
  updateUserAccount,
  type PublicUser,
  type UserRole,
} from "@/lib/users";
import type { CandidateProfile } from "@/lib/types";

const accountSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters."),
  email: z.email("Enter a valid email."),
  role: z.enum(["admin", "user"]),
  password: z.string().optional(),
});

export async function createAccount(input: {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}): Promise<PublicUser> {
  await requireAdmin();
  const parsed = accountSchema
    .extend({
      password: z.string().min(8, "Password must be at least 8 characters."),
    })
    .safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || "Invalid account.");
  }
  const user = await createUser({
    name: parsed.data.name,
    email: parsed.data.email,
    passwordHash: await hashPassword(parsed.data.password),
    role: parsed.data.role,
  });
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    profile: profileFromUser(user),
  };
}

export async function updateAccount(
  userId: string,
  input: {
    name: string;
    email: string;
    role: UserRole;
    password?: string;
  },
): Promise<PublicUser> {
  const { user: admin } = await requireAdmin();
  const parsed = accountSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || "Invalid account.");
  }
  if (parsed.data.password && parsed.data.password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
  if (admin.id === userId && parsed.data.role !== "admin") {
    throw new Error("You cannot remove your own administrator access.");
  }
  return updateUserAccount(userId, {
    name: parsed.data.name,
    email: parsed.data.email,
    role: parsed.data.role,
    passwordHash: parsed.data.password
      ? await hashPassword(parsed.data.password)
      : undefined,
  });
}

export async function removeAccount(userId: string): Promise<void> {
  const { user: admin } = await requireAdmin();
  if (admin.id === userId) {
    throw new Error("You cannot delete your own account.");
  }
  await deleteUser(userId);
}

export async function saveAccountProfile(
  userId: string,
  profile: CandidateProfile,
): Promise<void> {
  await requireAdmin();
  const parsed = parseProfileDraft(profile);
  if (!parsed) throw new Error("Invalid profile.");
  await saveUserProfile(userId, parsed);
}

