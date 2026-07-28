import type { FinalResumeData, TemplateSectionDefinition, TemplateSectionId } from "@resume/contracts";
import { createCanonicalResume } from "../canonical/canonical-resume";
import type { ResumeFormatRenderer, ResumeRenderResult } from "../types";
import { ascii, concatBytes } from "../utils/binary";

interface PdfPageState {
  commands: string[];
  y: number;
}

interface PdfLayoutContext {
  data: FinalResumeData;
  pageWidth: number;
  pageHeight: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  contentWidth: number;
  bodySize: number;
  lineHeight: number;
  pages: PdfPageState[];
  current: PdfPageState;
  emittedTokens: string[];
  usesUnicodeFonts: boolean;
}

function codePoints(value: string): string[] {
  return Array.from(value);
}

function utf16BeHex(value: string): string {
  let output = "";
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    output += code.toString(16).padStart(4, "0").toUpperCase();
  }
  return output;
}

const WIN_ANSI_SPECIAL = new Map<number, number>([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84],
  [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88],
  [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c],
  [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93],
  [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b],
  [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f],
]);

function winAnsiHex(value: string): string | null {
  const bytes: number[] = [];
  for (const character of Array.from(value)) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= 0x7f || (code >= 0xa0 && code <= 0xff)) {
      bytes.push(code);
      continue;
    }
    const mapped = WIN_ANSI_SPECIAL.get(code);
    if (mapped === undefined) return null;
    bytes.push(mapped);
  }
  return bytes.map((byte) => byte.toString(16).padStart(2, "0").toUpperCase()).join("");
}

function wrapText(text: string, maxWidth: number, fontSize: number): string[] {
  const widthPerCharacter = Math.max(2.5, fontSize * 0.5);
  const maxCharacters = Math.max(12, Math.floor(maxWidth / widthPerCharacter));
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (codePoints(candidate).length <= maxCharacters) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    if (codePoints(word).length <= maxCharacters) {
      current = word;
      continue;
    }
    const characters = codePoints(word);
    for (let offset = 0; offset < characters.length; offset += maxCharacters) {
      const chunk = characters.slice(offset, offset + maxCharacters).join("");
      if (offset + maxCharacters < characters.length) lines.push(chunk);
      else current = chunk;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function addPage(context: PdfLayoutContext): void {
  const page: PdfPageState = {
    commands: [],
    y: context.pageHeight - context.top,
  };
  context.pages.push(page);
  context.current = page;
}

function ensureSpace(context: PdfLayoutContext, requiredHeight: number): void {
  if (context.current.y - requiredHeight < context.bottom) addPage(context);
}

function addText(
  context: PdfLayoutContext,
  text: string,
  options: {
    x?: number;
    size?: number;
    bold?: boolean;
    align?: "left" | "center" | "right";
    maxWidth?: number;
    lineHeight?: number;
    indentFirst?: number;
    indentFollowing?: number;
    after?: number;
  } = {},
): void {
  const size = options.size ?? context.bodySize;
  const maxWidth = options.maxWidth ?? context.contentWidth;
  const lineHeight = options.lineHeight ?? Math.max(size * 1.15, context.lineHeight);
  const lines = wrapText(text, maxWidth, size);
  ensureSpace(context, lines.length * lineHeight + (options.after ?? 0));
  lines.forEach((line, index) => {
    const estimatedWidth = codePoints(line).length * size * 0.5;
    const baseX = options.x ?? context.left;
    const indent = index === 0 ? options.indentFirst ?? 0 : options.indentFollowing ?? 0;
    let x = baseX + indent;
    if (options.align === "center") x = (context.pageWidth - estimatedWidth) / 2;
    if (options.align === "right") x = context.pageWidth - context.right - estimatedWidth;
    const encoded = winAnsiHex(line);
    const font = encoded
      ? options.bold ? "F2" : "F1"
      : options.bold ? "F4" : "F3";
    const textHex = encoded ?? utf16BeHex(line);
    if (!encoded) context.usesUnicodeFonts = true;
    const horizontalScale = encoded ? "" : " 72 Tz";
    context.current.commands.push(
      `BT /${font} ${size.toFixed(2)} Tf${horizontalScale} 1 0 0 1 ${x.toFixed(2)} ${context.current.y.toFixed(2)} Tm <${textHex}> Tj ET`,
    );
    context.current.y -= lineHeight;
  });
  context.current.y -= options.after ?? 0;
}

function addRule(context: PdfLayoutContext, y: number): void {
  context.current.commands.push(
    `0.5 w ${context.left.toFixed(2)} ${y.toFixed(2)} m ${(context.pageWidth - context.right).toFixed(2)} ${y.toFixed(2)} l S`,
  );
}

function addSectionHeading(
  context: PdfLayoutContext,
  sectionId: TemplateSectionId,
  heading: string,
): void {
  const template = context.data.template.template;
  const definition = template.sections.find((item: TemplateSectionDefinition) => item.id === sectionId);
  const before = definition?.spacingBeforePt ?? template.spacing.sectionGapPt;
  const after = Math.max(definition?.spacingAfterPt ?? 4, 8);
  ensureSpace(context, before + template.typography.sectionHeadingSizePt * 1.4 + after + context.lineHeight);
  context.current.y -= before;
  const display =
    template.typography.sectionHeadingCase === "uppercase" ? heading.toUpperCase() : heading;
  addText(context, display, {
    size: template.typography.sectionHeadingSizePt,
    bold: true,
    lineHeight: template.typography.sectionHeadingSizePt * 1.15,
  });
  addRule(context, context.current.y + 6);
  context.current.y -= after;
  context.emittedTokens.push(heading);
}

function renderDocument(data: FinalResumeData): {
  pages: PdfPageState[];
  emittedTokens: string[];
  pageWidth: number;
  pageHeight: number;
  usesUnicodeFonts: boolean;
} {
  const template = data.template.template;
  const pageWidth = template.pageSize === "a4" ? 595.28 : 612;
  const pageHeight = template.pageSize === "a4" ? 841.89 : 792;
  const left = template.margins.leftInches * 72;
  const right = template.margins.rightInches * 72;
  const top = template.margins.topInches * 72;
  const bottom = template.margins.bottomInches * 72;
  const initialPage: PdfPageState = { commands: [], y: pageHeight - top };
  const context: PdfLayoutContext = {
    data,
    pageWidth,
    pageHeight,
    left,
    right,
    top,
    bottom,
    contentWidth: pageWidth - left - right,
    bodySize: template.typography.bodySizePt,
    lineHeight: template.typography.bodySizePt * template.typography.bodyLineHeight,
    pages: [initialPage],
    current: initialPage,
    emittedTokens: [],
    usesUnicodeFonts: false,
  };

  for (const section of data.document.sections) {
    const definition = template.sections.find((item: TemplateSectionDefinition) => item.id === section.id);
    if (definition?.pageBreakBefore && context.current.commands.length > 0) addPage(context);

    if (section.id === "contact") {
      const contact = section.content;
      addText(context, contact.fullName, {
        size: template.typography.nameSizePt,
        bold: true,
        align: template.alignment.contact,
        lineHeight: template.typography.nameSizePt * 1.15,
        after: 4,
      });
      context.emittedTokens.push(contact.fullName);
      const details = [
        contact.email,
        contact.phone,
        contact.location,
        contact.linkedin,
        contact.portfolio,
      ].filter((value): value is string => Boolean(value?.trim()));
      addText(context, details.join(" | "), {
        size: template.typography.contactSizePt,
        align: template.alignment.contact,
        lineHeight: template.typography.contactSizePt * 1.2,
      });
      context.emittedTokens.push(...details);
      continue;
    }

    addSectionHeading(context, section.id, section.heading);

    if (section.id === "professional-summary") {
      addText(context, section.content, { after: template.spacing.paragraphGapPt });
      context.emittedTokens.push(section.content);
      continue;
    }

    if (section.id === "skills") {
      for (const category of section.content) {
        addText(context, `${category.name}: ${category.skills.join(", ")}`, {
          after: template.spacing.paragraphGapPt,
        });
        context.emittedTokens.push(category.name, ...category.skills);
      }
      continue;
    }

    if (section.id === "professional-experience") {
      for (const experience of section.content) {
        ensureSpace(context, context.lineHeight * 3);
        context.current.y -= template.spacing.entryGapPt;
        addText(context, `${experience.assignedRole} | ${experience.companyName}`, {
          size: template.typography.roleHeadingSizePt,
          bold: true,
          lineHeight: template.typography.roleHeadingSizePt * 1.15,
        });
        addText(context, `${experience.startDate} - ${experience.endDate}`, {
          size: template.typography.bodySizePt,
          align: "right",
          lineHeight: context.lineHeight,
          after: template.spacing.paragraphGapPt,
        });
        context.emittedTokens.push(
          experience.assignedRole,
          experience.companyName,
          experience.startDate,
          experience.endDate,
        );
        for (const bullet of experience.bullets) {
          addText(context, `- ${bullet}`, {
            x: context.left,
            maxWidth: context.contentWidth - template.spacing.bulletIndentInches * 72,
            indentFirst: template.spacing.bulletIndentInches * 72,
            indentFollowing:
              template.spacing.bulletIndentInches * 72 +
              template.spacing.hangingIndentInches * 72,
            after: template.spacing.bulletGapPt,
          });
          context.emittedTokens.push(bullet);
        }
      }
      continue;
    }

    if (section.id === "education") {
      for (const education of section.content) {
        const degree = `${education.degree} in ${education.field}`;
        const period = `${education.startDate} – ${education.endDate}`;
        const text = [degree, education.institution, period]
          .filter((value): value is string => Boolean(value?.trim()))
          .join(" | ");
        addText(context, text, { after: template.spacing.paragraphGapPt });
        context.emittedTokens.push(
          education.degree,
          education.field,
          education.institution,
          education.startDate,
          education.endDate,
        );
      }
    }
  }

  return {
    pages: context.pages,
    emittedTokens: context.emittedTokens,
    pageWidth,
    pageHeight,
    usesUnicodeFonts: context.usesUnicodeFonts,
  };
}

function makeStream(content: string): Uint8Array {
  const bytes = ascii(content);
  return concatBytes([
    ascii(`<< /Length ${bytes.length} >>\nstream\n`),
    bytes,
    ascii("\nendstream"),
  ]);
}

function buildPdf(
  pages: PdfPageState[],
  pageWidth: number,
  pageHeight: number,
  usesUnicodeFonts: boolean,
  documentFingerprint: string,
): Uint8Array {
  const objects: Uint8Array[] = [];
  const pageObjectNumbers: number[] = [];
  const contentObjectNumbers: number[] = [];
  let nextObject = usesUnicodeFonts ? 9 : 5;
  for (let index = 0; index < pages.length; index += 1) {
    pageObjectNumbers.push(nextObject);
    contentObjectNumbers.push(nextObject + 1);
    nextObject += 2;
  }

  objects[0] = ascii("<< /Type /Catalog /Pages 2 0 R >>");
  objects[1] = ascii(
    `<< /Type /Pages /Kids [${pageObjectNumbers.map((value) => `${value} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  );
  objects[2] = ascii(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  );
  objects[3] = ascii(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  );
  if (usesUnicodeFonts) {
    objects[4] = ascii(
      "<< /Type /Font /Subtype /Type0 /BaseFont /Arial /Encoding /Identity-H /DescendantFonts [6 0 R] >>",
    );
    objects[5] = ascii(
      "<< /Type /Font /Subtype /CIDFontType2 /BaseFont /Arial /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /DW 500 >>",
    );
    objects[6] = ascii(
      "<< /Type /Font /Subtype /Type0 /BaseFont /Arial-BoldMT /Encoding /Identity-H /DescendantFonts [8 0 R] >>",
    );
    objects[7] = ascii(
      "<< /Type /Font /Subtype /CIDFontType2 /BaseFont /Arial-BoldMT /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /DW 500 >>",
    );
  }

  pages.forEach((page, index) => {
    const pageNumber = pageObjectNumbers[index];
    const contentNumber = contentObjectNumbers[index];
    if (pageNumber === undefined || contentNumber === undefined) {
      throw new Error("PDF page object allocation failed.");
    }
    const fontResources = usesUnicodeFonts
      ? "/F1 3 0 R /F2 4 0 R /F3 5 0 R /F4 7 0 R"
      : "/F1 3 0 R /F2 4 0 R";
    objects[pageNumber - 1] = ascii(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(2)}] /Resources << /Font << ${fontResources} >> >> /Contents ${contentNumber} 0 R >>`,
    );
    objects[contentNumber - 1] = makeStream(page.commands.join("\n"));
  });

  const parts: Uint8Array[] = [
    new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]),
    ascii(`% ResumeFingerprint ${documentFingerprint}\n`),
  ];
  const offsets: number[] = [0];
  let length = parts[0]?.length ?? 0;
  objects.forEach((object, index) => {
    if (!object) throw new Error(`Missing PDF object ${index + 1}.`);
    offsets[index + 1] = length;
    const prefix = ascii(`${index + 1} 0 obj\n`);
    const suffix = ascii("\nendobj\n");
    parts.push(prefix, object, suffix);
    length += prefix.length + object.length + suffix.length;
  });
  const xrefOffset = length;
  const xrefParts: Uint8Array[] = [
    ascii(`xref\n0 ${objects.length + 1}\n`),
    ascii("0000000000 65535 f \n"),
  ];
  for (let index = 1; index <= objects.length; index += 1) {
    xrefParts.push(ascii(`${String(offsets[index] ?? 0).padStart(10, "0")} 00000 n \n`));
  }
  xrefParts.push(
    ascii(
      `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
    ),
  );
  return concatBytes([...parts, ...xrefParts]);
}

export class AtsPdfRenderer implements ResumeFormatRenderer {
  readonly format = "pdf" as const;

  async render(data: FinalResumeData): Promise<ResumeRenderResult> {
    const canonical = createCanonicalResume(data);
    const rendered = renderDocument(data);
    return {
      format: this.format,
      bytes: buildPdf(
        rendered.pages,
        rendered.pageWidth,
        rendered.pageHeight,
        rendered.usesUnicodeFonts,
        data.document.contentFingerprint,
      ),
      emittedTokens: rendered.emittedTokens,
      atsSafeStructure: true,
      selectableTextExpected: true,
      warnings: [
        ...(rendered.usesUnicodeFonts
          ? [
              "The portable PDF renderer used its Unicode CID fallback with viewer font substitution; production deployments may inject an embedded-font adapter for renderer parity.",
            ]
          : []),
        ...(canonical.tokens.length === rendered.emittedTokens.length
          ? []
          : ["PDF token trace length differs from the canonical source trace."]),
      ],
    };
  }
}
