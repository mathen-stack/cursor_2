import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDownloadDirectory } from "./data-paths";

/**
 * Folder where finished resumes are written.
 * On Vercel this uses /tmp because the deployment filesystem is read-only.
 */
export function getResumeDownloadDirectory(): string {
  return getDownloadDirectory();
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
