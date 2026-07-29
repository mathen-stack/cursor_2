import type {
  FinalResumeData,
  FinalResumeSection,
  TemplateSectionId,
} from "@resume/contracts";

export type CanonicalLineKind =
  | "name"
  | "contact"
  | "section-heading"
  | "paragraph"
  | "skill"
  | "role-heading"
  | "date"
  | "bullet"
  | "education";

export interface CanonicalResumeLine {
  lineId: string;
  sectionId: TemplateSectionId;
  kind: CanonicalLineKind;
  text: string;
  tokens: string[];
}

export interface CanonicalResumeDocument {
  generationId: string;
  documentId: string;
  sourceDocumentFingerprint: string;
  sectionOrder: TemplateSectionId[];
  lines: CanonicalResumeLine[];
  tokens: string[];
  plainText: string;
}

function cleanToken(value: string | undefined): string | null {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function appendLine(
  lines: CanonicalResumeLine[],
  sectionId: TemplateSectionId,
  kind: CanonicalLineKind,
  text: string,
  tokens: string[],
): void {
  lines.push({
    lineId: `LINE-${String(lines.length + 1).padStart(4, "0")}`,
    sectionId,
    kind,
    text,
    tokens: tokens.filter((token) => token.length > 0),
  });
}

function appendContact(
  section: Extract<FinalResumeSection, { id: "contact" }>,
  lines: CanonicalResumeLine[],
): void {
  const contact = section.content;
  appendLine(lines, section.id, "name", contact.fullName, [contact.fullName]);
  const details = [
    contact.email,
    contact.phone,
    contact.location,
    contact.linkedin,
    contact.portfolio,
  ].map(cleanToken).filter((value): value is string => Boolean(value));
  appendLine(lines, section.id, "contact", details.join(" | "), details);
}

function appendSummary(
  section: Extract<FinalResumeSection, { id: "professional-summary" }>,
  lines: CanonicalResumeLine[],
): void {
  appendLine(lines, section.id, "section-heading", section.heading, [section.heading]);
  appendLine(lines, section.id, "paragraph", section.content, [section.content]);
}

function appendSkills(
  section: Extract<FinalResumeSection, { id: "skills" }>,
  lines: CanonicalResumeLine[],
): void {
  appendLine(lines, section.id, "section-heading", section.heading, [section.heading]);
  for (const category of section.content) {
    appendLine(
      lines,
      section.id,
      "skill",
      `${category.name}: ${category.skills.join(", ")}`,
      [category.name, ...category.skills],
    );
  }
}

function appendExperience(
  section: Extract<FinalResumeSection, { id: "professional-experience" }>,
  lines: CanonicalResumeLine[],
): void {
  appendLine(lines, section.id, "section-heading", section.heading, [section.heading]);
  for (const experience of section.content) {
    appendLine(
      lines,
      section.id,
      "role-heading",
      `${experience.assignedRole} | ${experience.companyName}`,
      [experience.assignedRole, experience.companyName],
    );
    appendLine(
      lines,
      section.id,
      "date",
      `${experience.startDate} - ${experience.endDate}`,
      [experience.startDate, experience.endDate],
    );
    for (const bullet of experience.bullets) {
      appendLine(lines, section.id, "bullet", bullet, [bullet]);
    }
  }
}

function appendEducation(
  section: Extract<FinalResumeSection, { id: "education" }>,
  lines: CanonicalResumeLine[],
): void {
  appendLine(lines, section.id, "section-heading", section.heading, [section.heading]);
  for (const education of section.content) {
    const degree = `${education.degree} in ${education.field}`;
    const period = `${education.startDate} - ${education.endDate}`;
    appendLine(
      lines,
      section.id,
      "education",
      `${degree} | ${education.institution} | ${period}`,
      [
        education.degree,
        education.field,
        education.institution,
        education.startDate,
        education.endDate,
      ],
    );
  }
}

function appendSection(section: FinalResumeSection, lines: CanonicalResumeLine[]): void {
  switch (section.id) {
    case "contact":
      appendContact(section, lines);
      return;
    case "professional-summary":
      appendSummary(section, lines);
      return;
    case "skills":
      appendSkills(section, lines);
      return;
    case "professional-experience":
      appendExperience(section, lines);
      return;
    case "education":
      appendEducation(section, lines);
      return;
  }
}

export function createCanonicalResume(data: FinalResumeData): CanonicalResumeDocument {
  if (data.assemblyValidation.overallStatus !== "approved") {
    throw new Error("Cannot render a resume whose final assembly is not approved.");
  }
  const lines: CanonicalResumeLine[] = [];
  for (const section of data.document.sections) appendSection(section, lines);
  const tokens = lines.flatMap((line) => line.tokens);
  const plainTextLines: string[] = [];
  let previousSection: TemplateSectionId | null = null;
  for (const line of lines) {
    if (previousSection !== null && previousSection !== line.sectionId) plainTextLines.push("");
    plainTextLines.push(line.kind === "bullet" ? `- ${line.text}` : line.text);
    previousSection = line.sectionId;
  }
  return {
    generationId: data.context.generationId,
    documentId: data.document.documentId,
    sourceDocumentFingerprint: data.document.contentFingerprint,
    sectionOrder: [...data.document.sectionOrder],
    lines,
    tokens,
    plainText: `${plainTextLines.join("\n").trim()}\n`,
  };
}
