import type { UserRole } from "./auth-types";

export type AccountStatus = "pending" | "approved";

export type StoredAccount = {
  username: string;
  displayName: string;
  role: UserRole;
  status: AccountStatus;
  passwordHash: string;
  passwordSalt: string;
  updatedAt: string;
  updatedBy: string;
};

export type PublicAccount = {
  username: string;
  displayName: string;
  role: UserRole;
  status: AccountStatus;
  updatedAt: string;
  updatedBy: string;
};
