import { describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import {
  getAccountsDirectory,
  getDataRootDirectory,
  getDownloadDirectory,
  getProfilesDirectory,
} from "../apps/web/lib/data-paths";

describe("data paths", () => {
  it("uses tmp directories when RESUME_USE_TMP_DATA is enabled", () => {
    const previous = process.env.RESUME_USE_TMP_DATA;
    const previousDataDir = process.env.RESUME_DATA_DIR;
    const previousDownloadDir = process.env.RESUME_DOWNLOAD_DIR;
    process.env.RESUME_USE_TMP_DATA = "1";
    delete process.env.RESUME_DATA_DIR;
    delete process.env.RESUME_DOWNLOAD_DIR;
    try {
      expect(getDataRootDirectory()).toBe(
        path.join(os.tmpdir(), "resume-tailor-data"),
      );
      expect(getAccountsDirectory()).toBe(
        path.join(os.tmpdir(), "resume-tailor-data", "users"),
      );
      expect(getProfilesDirectory()).toBe(
        path.join(os.tmpdir(), "resume-tailor-data", "profiles"),
      );
      expect(getDownloadDirectory()).toBe(
        path.join(os.tmpdir(), "resume-tailor-download"),
      );
    } finally {
      if (previous === undefined) delete process.env.RESUME_USE_TMP_DATA;
      else process.env.RESUME_USE_TMP_DATA = previous;
      if (previousDataDir === undefined) delete process.env.RESUME_DATA_DIR;
      else process.env.RESUME_DATA_DIR = previousDataDir;
      if (previousDownloadDir === undefined) {
        delete process.env.RESUME_DOWNLOAD_DIR;
      } else {
        process.env.RESUME_DOWNLOAD_DIR = previousDownloadDir;
      }
    }
  });
});
