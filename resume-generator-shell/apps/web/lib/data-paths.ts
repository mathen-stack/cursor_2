import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

function usesEphemeralWritableFs(): boolean {
  return (
    process.env.VERCEL === "1" ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME?.trim()) ||
    process.env.RESUME_USE_TMP_DATA === "1"
  );
}

function projectDataRoot(): string {
  const cwd = process.cwd();
  if (/[/\\]apps[/\\]web$/.test(cwd)) {
    return path.resolve(cwd, "..", "..", "data");
  }
  if (existsSync(path.join(cwd, "resume-generator-shell", "package.json"))) {
    return path.resolve(cwd, "resume-generator-shell", "data");
  }
  return path.resolve(cwd, "data");
}

function projectDownloadRoot(): string {
  const cwd = process.cwd();
  if (/[/\\]apps[/\\]web$/.test(cwd)) {
    return path.resolve(cwd, "..", "..", "download");
  }
  if (existsSync(path.join(cwd, "resume-generator-shell", "package.json"))) {
    return path.resolve(cwd, "resume-generator-shell", "download");
  }
  return path.resolve(cwd, "download");
}

/** Writable app data root (accounts, profiles). Uses /tmp on Vercel. */
export function getDataRootDirectory(): string {
  const configured = process.env.RESUME_DATA_DIR?.trim();
  if (configured) return path.resolve(configured);
  if (usesEphemeralWritableFs()) {
    return path.join(os.tmpdir(), "resume-tailor-data");
  }
  return projectDataRoot();
}

export function getAccountsDirectory(): string {
  return path.join(getDataRootDirectory(), "users");
}

export function getProfilesDirectory(): string {
  return path.join(getDataRootDirectory(), "profiles");
}

export function getBaseResumesDirectory(): string {
  return path.join(getDataRootDirectory(), "base-resumes");
}

export function getDownloadDirectory(): string {
  const configured = process.env.RESUME_DOWNLOAD_DIR?.trim();
  if (configured) return path.resolve(configured);
  if (usesEphemeralWritableFs()) {
    return path.join(os.tmpdir(), "resume-tailor-download");
  }
  return projectDownloadRoot();
}
