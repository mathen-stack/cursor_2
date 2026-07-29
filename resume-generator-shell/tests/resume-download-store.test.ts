import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { saveResumeToDownloadFolder } from "../apps/web/lib/resume-download-store";

describe("resume download store", () => {
  it("writes resume bytes into a local download folder using the file basename", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "resume-shell-"));
    const previousCwd = process.cwd();
    try {
      writeFileSync(
        path.join(root, "package.json"),
        JSON.stringify({ name: "resume-generator" }),
      );
      mkdirSync(path.join(root, "download"), { recursive: true });
      process.chdir(root);

      const bytes = new Uint8Array([1, 2, 3, 4]);
      const saved = await saveResumeToDownloadFolder(
        "download/alex-morgan.docx",
        bytes,
      );

      expect(path.basename(saved)).toBe("alex-morgan.docx");
      expect(path.basename(path.dirname(saved))).toBe("download");
      expect(readFileSync(saved)).toEqual(Buffer.from(bytes));
    } finally {
      process.chdir(previousCwd);
      rmSync(root, { recursive: true, force: true });
    }
  });
});
