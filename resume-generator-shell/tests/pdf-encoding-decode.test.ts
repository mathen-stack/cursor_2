import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  decodeEncodedPdfDocument,
  decodeEncodedPdfText,
  looksLikeEncodedPdfText,
  sanitizeEncodedField,
} from "../apps/web/lib/pdf-encoding-decode";
import { extractResumeText } from "../apps/web/lib/base-resume-extract";
import { parseBaseResumeText } from "../apps/web/lib/base-resume-parser";

describe("pdf encoding decode", () => {
  it("detects and decodes custom-encoded PDF bullet cipher", () => {
    const garbled =
      "J==bëí~ÄäáëÜÉÇ=êçÄìëí=ãçåáíçêáåÖ=Ñê~ãÉïçêâë=Ñçê=^f=ãçÇÉäë=íê~áåÉÇ=çå=^tp=p~ÖÉj~âÉêI=êÉÇìÅáåÖ";
    expect(looksLikeEncodedPdfText(garbled)).toBe(true);
    const decoded = decodeEncodedPdfText(garbled);
    expect(decoded).toMatch(/^•\s*Established robust monitoring frameworks for AI/i);
    expect(decoded).toMatch(/AWS SageMaker/i);
    expect(decoded).not.toMatch(/=|ë|ãç/);
  });

  it("decodes FPS / CNN / CI\/CD tokens correctly", () => {
    expect(
      decodeEncodedPdfText(
        "=aÉäáîÉêÉÇ=êÉ~äJíáãÉ=ÇÉíÉÅíáçå=ö=PR=cmp=Äó=áåíÉÖê~íáåÖ=léÉå`sI=ccãéÉÖI=~åÇ",
      ),
    ).toMatch(/Delivered real-time detection @ 45 FPS by integrating OpenCV, FFmpeg/i);

    expect(
      decodeEncodedPdfText(
        "J==aÉëáÖåÉÇ=~=ÜóÄêáÇ=ÉåëÉãÄäÉ=Åä~ëëáÑáÉê=E`kk=H=qê~åëÑçêãÉê=ÑìëáçåF=íÜ~í=~ÅÜáÉîÉÇ=VTKVB",
      ),
    ).toMatch(/Designed a hybrid ensemble classifier \(CNN \+ Transformer fusion\).*95\.9%/i);
  });

  it("leaves normal English text alone", () => {
    const normal =
      "Optimized state management and REST API through adaptive batching and caching.";
    expect(looksLikeEncodedPdfText(normal)).toBe(false);
    expect(decodeEncodedPdfText(normal)).toBe(normal);
  });

  it("decodes cipher text even when spaces were inserted between glyphs", () => {
    const spaced =
      "a É ä á î É ê É Ç = ê É ~ ä J í á ã É = Ç É í É Å í á ç å = ö = P R = c m p";
    expect(decodeEncodedPdfText(spaced)).toMatch(
      /Delivered real-time detection @ 45 FPS/i,
    );
  });

  it("sanitizes corrupt header fields to a safe fallback", () => {
    expect(
      sanitizeEncodedField("=aÉäáîÉêÉÇ=êÉ~äJíáãÉ=ÇÉíÉÅíáçå=ö=PR=cmp", "Professional"),
    ).toMatch(/Delivered real-time detection/i);
    expect(sanitizeEncodedField("===ëáÉçãå===", "Professional")).toBe("Professional");
    expect(sanitizeEncodedField("SENIOR AI/ML ENGINEER", "Professional")).toBe(
      "SENIOR AI/ML ENGINEER",
    );
  });

  it("maps React/Redux/gRPC/js tokens from the custom encoding", () => {
    expect(decodeEncodedPdfText("oÉ~Åí")).toMatch(/^React$/i);
    expect(decodeEncodedPdfText("oÉÇìñ")).toMatch(/^Redux$/i);
    expect(decodeEncodedPdfText("Öom`")).toMatch(/^gRPC$/i);
    expect(decodeEncodedPdfText("Kàë")).toMatch(/^\.js$/i);
  });

  it("does not create fake experiences from margin-date bullet leaks", async () => {
    const { parseBaseResumeText } = await import("../apps/web/lib/base-resume-parser");
    const parsed = parseBaseResumeText(`PROFESSIONAL EXPERIENCE
SENIOR AI/ML ENGINEER | SPARKCOGNITION (US) | JULY 2023 - PRESENT
- Built monitoring frameworks for AI models
high-volume traffic | low latency, decreasing 2018 - Present
- Optimized inference latency
AI/ML OPS ENGINEER | THOUGHT MACHINE (UK) | OCTOBER 2020 - JUNE 2023
- Transformed ML pipeline infrastructure
`);
    expect(parsed.experiences).toHaveLength(2);
    expect(parsed.experiences.map((e) => e.role?.toUpperCase())).toEqual([
      "SENIOR AI/ML ENGINEER",
      "AI/ML OPS ENGINEER",
    ]);
    expect(
      parsed.experiences.some((e) => /latency|decreasing|high-volume/i.test(e.role || "")),
    ).toBe(false);
  });

  it("decodes Stephen resume PDF bullets into readable English", async () => {
    const pdfPath = resolve(
      "/home/ubuntu/.cursor/projects/workspace/uploads/stephen-mccranie_66e0.pdf",
    );
    const bytes = new Uint8Array(readFileSync(pdfPath));
    const extracted = await extractResumeText({
      filename: "stephen-mccranie.pdf",
      mimeType: "application/pdf",
      bytes,
    });

    expect(extracted.text).toMatch(/Established robust monitoring frameworks/i);
    expect(extracted.text).toMatch(/Vision Transformers/i);
    expect(extracted.text).not.toMatch(/bëí~ÄäáëÜÉÇ|J=•=/);

    const parsed = parseBaseResumeText(extracted.text);
    const allBullets = parsed.experiences.flatMap((exp) => exp.bullets);
    expect(allBullets.some((b) => /monitoring frameworks|deepfake|MLflow|BigQuery/i.test(b))).toBe(
      true,
    );
    expect(allBullets.every((b) => !/[=]{2,}|bëí~|ãçåáíçêáåÖ/.test(b))).toBe(true);

    const doc = decodeEncodedPdfDocument(extracted.text);
    expect(doc).toMatch(/Stephen|PROFESSIONAL/i);
  });
});
