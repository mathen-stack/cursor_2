import mammoth from "mammoth";
import { extractText } from "unpdf";
import { cleanResumeExtractText } from "./base-resume-bullet-sanitize";

const MAX_BYTES = 8 * 1024 * 1024;

export type UploadedResumeFile = {
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
};

function normalizeMime(filename: string, mimeType: string): string {
  const lower = filename.toLowerCase();
  if (mimeType && mimeType !== "application/octet-stream") return mimeType;
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".txt") || lower.endsWith(".md")) return "text/plain";
  return mimeType || "application/octet-stream";
}

export async function extractResumeText(
  file: UploadedResumeFile,
): Promise<{ text: string; mimeType: string }> {
  if (file.bytes.byteLength === 0) {
    throw new Error("Uploaded resume is empty.");
  }
  if (file.bytes.byteLength > MAX_BYTES) {
    throw new Error("Resume file exceeds the 8MB upload limit.");
  }

  const mimeType = normalizeMime(file.filename, file.mimeType);
  const lower = file.filename.toLowerCase();

  if (
    mimeType === "text/plain" ||
    mimeType === "text/markdown" ||
    lower.endsWith(".txt") ||
    lower.endsWith(".md")
  ) {
    return {
      text: cleanResumeExtractText(new TextDecoder("utf-8").decode(file.bytes)),
      mimeType: "text/plain",
    };
  }

  if (
    mimeType.includes("wordprocessingml") ||
    mimeType === "application/msword" ||
    lower.endsWith(".docx") ||
    lower.endsWith(".doc")
  ) {
    if (lower.endsWith(".doc") && !lower.endsWith(".docx")) {
      throw new Error("Legacy .doc files are not supported. Upload .docx, .pdf, or .txt.");
    }
    const result = await mammoth.extractRawText({ buffer: Buffer.from(file.bytes) });
    const text = cleanResumeExtractText(result.value || "");
    if (!text) throw new Error("Could not extract text from the Word resume.");
    return { text, mimeType };
  }

  if (mimeType === "application/pdf" || lower.endsWith(".pdf")) {
    const result = await extractText(file.bytes, { mergePages: true });
    const text = cleanResumeExtractText(
      Array.isArray(result.text) ? result.text.join("\n") : String(result.text || ""),
    );
    if (!text) throw new Error("Could not extract text from the PDF resume.");
    return { text, mimeType: "application/pdf" };
  }

  throw new Error("Unsupported resume format. Upload PDF, DOCX, or TXT.");
}
