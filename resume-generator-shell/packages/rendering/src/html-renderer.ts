import type { FinalResumeData } from "@resume/contracts";
import { createCanonicalResume } from "./canonical/canonical-resume";
import type { ResumeFormatRenderer, ResumeRenderResult } from "./types";
import { utf8 } from "./utils/binary";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export class AtsHtmlRenderer implements ResumeFormatRenderer {
  readonly format = "html" as const;

  async render(data: FinalResumeData): Promise<ResumeRenderResult> {
    const canonical = createCanonicalResume(data);
    const template = data.template.template;
    const sections: string[] = [];
    for (const section of data.document.sections) {
      if (section.id === "contact") {
        const details = [
          section.content.email,
          section.content.phone,
          section.content.location,
          section.content.linkedin,
          section.content.portfolio,
        ].filter((value): value is string => Boolean(value?.trim()));
        sections.push(`<header class="contact"><h1>${escapeHtml(section.content.fullName)}</h1><p>${details.map(escapeHtml).join(" | ")}</p></header>`);
        continue;
      }
      const heading =
        template.typography.sectionHeadingCase === "uppercase"
          ? section.heading.toUpperCase()
          : section.heading;
      const content: string[] = [];
      if (section.id === "professional-summary") content.push(`<p>${escapeHtml(section.content)}</p>`);
      if (section.id === "skills") {
        for (const category of section.content) {
          content.push(`<p><strong>${escapeHtml(category.name)}:</strong> ${category.skills.map(escapeHtml).join(", ")}</p>`);
        }
      }
      if (section.id === "professional-experience") {
        for (const experience of section.content) {
          content.push(`<article><div class="role"><strong>${escapeHtml(experience.assignedRole)} | ${escapeHtml(experience.companyName)}</strong><span>${escapeHtml(experience.startDate)} - ${escapeHtml(experience.endDate)}</span></div><ul>${experience.bullets.map((bullet: string) => `<li>${escapeHtml(bullet)}</li>`).join("")}</ul></article>`);
        }
      }
      if (section.id === "education") {
        for (const education of section.content) {
          const date = education.graduationDate ? ` | ${escapeHtml(education.graduationDate)}` : "";
          content.push(`<p><strong>${escapeHtml(education.degree)} in ${escapeHtml(education.field)}</strong> | ${escapeHtml(education.institution)}${date}</p>`);
        }
      }
      sections.push(`<section><h2>${escapeHtml(heading)}</h2>${content.join("")}</section>`);
    }
    const pageWidth = template.pageSize === "a4" ? "8.27in" : "8.5in";
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Resume</title><style>@page{size:${template.pageSize};margin:${template.margins.topInches}in ${template.margins.rightInches}in ${template.margins.bottomInches}in ${template.margins.leftInches}in}*{box-sizing:border-box}body{margin:0;background:#fff;color:#111;font-family:${JSON.stringify(template.typography.fontFamily)},Arial,sans-serif;font-size:${template.typography.bodySizePt}pt;line-height:${template.typography.bodyLineHeight}}main{width:${pageWidth};max-width:100%;margin:0 auto;padding:${template.margins.topInches}in ${template.margins.rightInches}in ${template.margins.bottomInches}in ${template.margins.leftInches}in}.contact{text-align:${template.alignment.contact}}h1{font-size:${template.typography.nameSizePt}pt;margin:0 0 4pt}.contact p{font-size:${template.typography.contactSizePt}pt;margin:0}section{margin-top:${template.spacing.sectionGapPt}pt}h2{font-size:${template.typography.sectionHeadingSizePt}pt;margin:0 0 5pt;border-bottom:1px solid #111}p{margin:0 0 ${template.spacing.paragraphGapPt}pt}.role{display:flex;justify-content:space-between;gap:12pt;margin-top:${template.spacing.entryGapPt}pt;font-size:${template.typography.roleHeadingSizePt}pt}.role span{white-space:nowrap}ul{margin:${template.spacing.paragraphGapPt}pt 0 0;padding-left:${template.spacing.bulletIndentInches}in}li{margin:0 0 ${template.spacing.bulletGapPt}pt}@media print{main{width:auto;padding:0}}</style></head><body><main>${sections.join("")}</main></body></html>`;
    return {
      format: this.format,
      bytes: utf8(html),
      emittedTokens: [...canonical.tokens],
      atsSafeStructure: true,
      selectableTextExpected: true,
      warnings: [],
    };
  }
}
