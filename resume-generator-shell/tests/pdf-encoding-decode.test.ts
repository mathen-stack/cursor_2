import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  decodeEncodedPdfDocument,
  decodeEncodedPdfText,
  looksLikeEncodedPdfText,
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
