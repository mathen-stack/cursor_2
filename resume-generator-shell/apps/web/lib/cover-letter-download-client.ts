import { resumeFilenameFromFullName } from "./resume-download-client";

function triggerTextDownload(text: string, filename: string): void {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 10_000);
}

/**
 * Generate a cover letter from the JD (+ optional base resume) and download TXT.
 */
export async function downloadCoverLetterFile(input: {
  jobDescriptionText: string;
  baseResumeId?: string;
  fullName?: string;
}): Promise<{ filename: string }> {
  const response = await fetch("/api/cover-letter/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jobDescriptionText: input.jobDescriptionText,
      ...(input.baseResumeId ? { baseResumeId: input.baseResumeId } : {}),
      locale: "en-US",
    }),
  });
  const payload = (await response.json()) as {
    coverLetter?: string;
    error?: { message?: string };
  };
  if (!response.ok || !payload.coverLetter) {
    throw new Error(payload.error?.message ?? "Could not generate cover letter.");
  }

  const stem = resumeFilenameFromFullName(
    input.fullName?.trim() || "cover-letter",
    "txt",
  ).replace(/\.txt$/i, "");
  const filename = `${stem}-cover-letter.txt`;
  triggerTextDownload(payload.coverLetter, filename);
  return { filename };
}
