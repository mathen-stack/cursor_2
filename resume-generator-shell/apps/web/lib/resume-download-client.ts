import type { FinalResumeData } from "@resume/contracts";

export function resumeFilenameFromFullName(fullName: string, format: string): string {
  const stem =
    fullName
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "resume";
  return `${stem}.${format}`;
}

function resumeWithProfileFullName(
  resume: FinalResumeData,
  fullName: string,
): FinalResumeData {
  const trimmed = fullName.trim();
  if (!trimmed) return resume;
  return {
    ...resume,
    profile: {
      ...resume.profile,
      personalInformation: {
        ...resume.profile.personalInformation,
        fullName: trimmed,
      },
    },
  };
}

function filenameFromContentDisposition(
  header: string | null,
): string | undefined {
  if (!header) return undefined;
  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].trim());
    } catch {
      // fall through
    }
  }
  const plainMatch = /filename="([^"]+)"/i.exec(header);
  if (plainMatch?.[1]) return plainMatch[1];
  const bareMatch = /filename=([^;]+)/i.exec(header);
  return bareMatch?.[1]?.trim().replace(/^["']|["']$/g, "");
}

function triggerBlobAutoDownload(bytes: ArrayBuffer, filename: string): void {
  const isPdf = filename.toLowerCase().endsWith(".pdf");
  const blob = new Blob([bytes], {
    type: isPdf ? "application/pdf" : "application/octet-stream",
  });
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

export async function downloadResumeFile(
  resume: FinalResumeData,
  format: "docx" | "pdf" | "txt",
  profileFullName?: string,
): Promise<{ filename: string }> {
  const namedResume = resumeWithProfileFullName(
    resume,
    profileFullName ?? resume.profile.personalInformation.fullName,
  );
  const filename = resumeFilenameFromFullName(
    namedResume.profile.personalInformation.fullName,
    format,
  );

  const response = await fetch("/api/resume/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resume: namedResume, format }),
  });
  if (!response.ok) {
    const payload = (await response.json()) as { error?: { message?: string } };
    throw new Error(payload.error?.message ?? "Resume download failed.");
  }

  const bytes = await response.arrayBuffer();
  const savedName =
    filenameFromContentDisposition(response.headers.get("Content-Disposition")) ??
    filename;
  triggerBlobAutoDownload(bytes, savedName);
  return { filename: savedName };
}
