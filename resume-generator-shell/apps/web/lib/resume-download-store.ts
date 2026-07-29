import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Project-local folder where finished resumes are written:
 * `resume-generator-shell/download`.
 */
export function getResumeDownloadDirectory(): string {
  const cwd = process.cwd();
  if (/[/\\]apps[/\\]web$/.test(cwd)) {
    return path.resolve(cwd, "..", "..", "download");
  }
  if (existsSync(path.join(cwd, "resume-generator-shell", "package.json"))) {
    return path.resolve(cwd, "resume-generator-shell", "download");
  }
  return path.resolve(cwd, "download");
}

export async function saveResumeToDownloadFolder(
  filename: string,
  bytes: Uint8Array,
): Promise<string> {
  const safeName = path.basename(filename);
  const directory = getResumeDownloadDirectory();
  await mkdir(directory, { recursive: true });
  const filePath = path.join(directory, safeName);
  await writeFile(filePath, bytes);
  return filePath;
}
