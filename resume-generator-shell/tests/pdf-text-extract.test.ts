import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { StructuredTextItem } from "unpdf";
import { extractResumeText } from "../apps/web/lib/base-resume-extract";
import {
  extractExactPdfText,
  reconstructTextFromPdfItems,
} from "../apps/web/lib/pdf-text-extract";

function item(
  partial: Partial<StructuredTextItem> & Pick<StructuredTextItem, "str" | "x" | "y">,
): StructuredTextItem {
  return {
    width: partial.width ?? Math.max(partial.str.length * 5, 1),
    height: partial.height ?? 11,
    fontSize: partial.fontSize ?? 11,
    fontFamily: partial.fontFamily ?? "sans-serif",
    dir: partial.dir ?? "ltr",
    hasEOL: partial.hasEOL ?? false,
    ...partial,
  };
}

describe("exact PDF text reconstruction", () => {
  it("rebuilds reading order, bullets, and section gaps from positioned items", () => {
    const text = reconstructTextFromPdfItems([
      [
        item({ str: "Alex Morgan", x: 200, y: 740, fontSize: 18, width: 120 }),
        item({ str: "\uF0B7", x: 50, y: 700, fontSize: 11, width: 6 }),
        item({
          str: "Built React apps with TypeScript",
          x: 62,
          y: 700,
          fontSize: 11,
          width: 220,
        }),
        item({ str: "and Next.js.", x: 62, y: 686, fontSize: 11, width: 80 }),
        item({ str: "EXPERIENCE", x: 50, y: 640, fontSize: 12, width: 90 }),
      ],
    ]);

    expect(text).toContain("Alex Morgan");
    expect(text).toMatch(/•\s*Built React apps with TypeScript/);
    expect(text).toContain("and Next.js.");
    expect(text).toContain("EXPERIENCE");
    expect(text.indexOf("Built React")).toBeLessThan(text.indexOf("EXPERIENCE"));
  });

  it("reads left column before right column on two-column pages", () => {
    const text = reconstructTextFromPdfItems([
      [
        item({ str: "Left A", x: 40, y: 700, width: 40 }),
        item({ str: "Right A", x: 320, y: 700, width: 45 }),
        item({ str: "Left B", x: 40, y: 680, width: 40 }),
        item({ str: "Right B", x: 320, y: 680, width: 45 }),
        item({ str: "Left C", x: 40, y: 660, width: 40 }),
        item({ str: "Right C", x: 320, y: 660, width: 45 }),
        item({ str: "Left D", x: 40, y: 640, width: 40 }),
        item({ str: "Right D", x: 320, y: 640, width: 45 }),
        item({ str: "Left E", x: 40, y: 620, width: 40 }),
        item({ str: "Right E", x: 320, y: 620, width: 45 }),
        item({ str: "Left F", x: 40, y: 600, width: 40 }),
        item({ str: "Right F", x: 320, y: 600, width: 45 }),
      ],
    ]);

    expect(text.indexOf("Left A")).toBeLessThan(text.indexOf("Right A"));
    expect(text.indexOf("Left F")).toBeLessThan(text.indexOf("Right A"));
  });

  it("extracts readable text from a real resume PDF", async () => {
    const pdfPath = resolve(__dirname, "../download/alex-morgan.pdf");
    const fileBytes = readFileSync(pdfPath);
    const exact = await extractExactPdfText(new Uint8Array(fileBytes));
    expect(exact).toMatch(/Alex Morgan/i);
    expect(exact).toMatch(/PROFESSIONAL SUMMARY|SUMMARY/i);
    expect(exact.length).toBeGreaterThan(200);

    const viaUpload = await extractResumeText({
      filename: "alex-morgan.pdf",
      mimeType: "application/pdf",
      bytes: new Uint8Array(fileBytes),
    });
    expect(viaUpload.mimeType).toBe("application/pdf");
    expect(viaUpload.text).toMatch(/Alex Morgan/i);
    expect(viaUpload.text).toMatch(/Python|Machine Learning|Kubernetes/i);
  });
});
