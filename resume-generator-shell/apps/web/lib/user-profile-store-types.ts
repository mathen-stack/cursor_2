import type { UserProfile } from "@resume/contracts";

export type StoredUserProfileRecord = {
  version: 1;
  username: string;
  savedAt: string;
  updatedBy: string;
  profile: UserProfile;
};

export type UserProfileSummary = {
  username: string;
  savedAt: string;
  updatedBy: string;
  fullName: string;
  email: string;
  hasProfile: boolean;
};
