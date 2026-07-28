import type {
  FinalResumeData,
  TemplateSectionDefinition,
  TemplateSectionId,
} from "@resume/contracts";
import { createCanonicalResume } from "../canonical/canonical-resume";
import type { ResumeFormatRenderer, ResumeRenderResult } from "../types";
import { escapeXml, preserveSpaceAttribute } from "../utils/xml";
import { createStoredZip } from "./zip-writer";

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function halfPoints(points: number): number {
  return Math.max(2, Math.round(points * 2));
}

function twipsFromPoints(points: number): number {
  return Math.max(0, Math.round(points * 20));
}

function twipsFromInches(inches: number): number {
  return Math.max(0, Math.round(inches * 1440));
}

function textRun(text: string, options: { bold?: boolean; italic?: boolean } = {}): string {
  const properties = [
    options.bold ? "<w:b/>" : "",
    options.italic ? "<w:i/>" : "",
  ].join("");
  return `<w:r>${properties ? `<w:rPr>${properties}</w:rPr>` : ""}<w:t${preserveSpaceAttribute(text)}>${escapeXml(text)}</w:t></w:r>`;
}

function paragraph(
  runs: string,
  options: {
    style?: string;
    alignment?: "left" | "center";
    spacingBeforePt?: number;
    spacingAfterPt?: number;
    keepNext?: boolean;
    pageBreakBefore?: boolean;
    tabStopTwips?: number;
    bullet?: boolean;
  } = {},
): string {
  const props = [
    options.style ? `<w:pStyle w:val="${options.style}"/>` : "",
    options.alignment ? `<w:jc w:val="${options.alignment}"/>` : "",
    options.spacingBeforePt !== undefined || options.spacingAfterPt !== undefined
      ? `<w:spacing w:before="${twipsFromPoints(options.spacingBeforePt ?? 0)}" w:after="${twipsFromPoints(options.spacingAfterPt ?? 0)}"/>`
      : "",
    options.keepNext ? "<w:keepNext/>" : "",
    options.pageBreakBefore ? "<w:pageBreakBefore/>" : "",
    options.tabStopTwips
      ? `<w:tabs><w:tab w:val="right" w:pos="${options.tabStopTwips}"/></w:tabs>`
      : "",
    options.bullet
      ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'
      : "",
  ].join("");
  return `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ""}${runs}</w:p>`;
}

function sectionDefinition(
  data: FinalResumeData,
  sectionId: TemplateSectionId,
): TemplateSectionDefinition {
  const definition = data.template.template.sections.find((item: TemplateSectionDefinition) => item.id === sectionId);
  if (!definition) throw new Error(`Missing template section definition for ${sectionId}.`);
  return definition;
}

function documentXml(data: FinalResumeData): { xml: string; emittedTokens: string[] } {
  const body: string[] = [];
  const emittedTokens: string[] = [];
  const template = data.template.template;
  const pageWidth = template.pageSize === "a4" ? 11906 : 12240;
  const pageHeight = template.pageSize === "a4" ? 16838 : 15840;
  const contentWidth =
    pageWidth -
    twipsFromInches(template.margins.leftInches) -
    twipsFromInches(template.margins.rightInches);

  for (const section of data.document.sections) {
    const definition = sectionDefinition(data, section.id);
    const pageBreakBefore = definition.pageBreakBefore;
    if (section.id === "contact") {
      const contact = section.content;
      body.push(
        paragraph(textRun(contact.fullName, { bold: true }), {
          style: "ResumeName",
          alignment: template.alignment.contact,
          pageBreakBefore,
        }),
      );
      emittedTokens.push(contact.fullName);
      const details = [
        contact.email,
        contact.phone,
        contact.location,
        contact.linkedin,
        contact.portfolio,
      ].filter((value): value is string => Boolean(value?.trim()));
      body.push(
        paragraph(textRun(details.join(" | ")), {
          style: "ResumeContact",
          alignment: template.alignment.contact,
          spacingAfterPt: definition.spacingAfterPt,
        }),
      );
      emittedTokens.push(...details);
      continue;
    }

    const headingText =
      template.typography.sectionHeadingCase === "uppercase"
        ? section.heading.toUpperCase()
        : section.heading;
    body.push(
      paragraph(textRun(headingText, { bold: true }), {
        style: "ResumeSectionHeading",
        spacingBeforePt: definition.spacingBeforePt,
        spacingAfterPt: definition.spacingAfterPt,
        keepNext: definition.keepTogether,
        pageBreakBefore,
      }),
    );
    emittedTokens.push(section.heading);

    if (section.id === "professional-summary") {
      body.push(paragraph(textRun(section.content), { style: "ResumeBody" }));
      emittedTokens.push(section.content);
      continue;
    }

    if (section.id === "skills") {
      for (const category of section.content) {
        body.push(
          paragraph(
            `${textRun(`${category.name}:`, { bold: true })}${textRun(` ${category.skills.join(", ")}`)}`,
            { style: "ResumeBody", spacingAfterPt: template.spacing.paragraphGapPt },
          ),
        );
        emittedTokens.push(category.name, ...category.skills);
      }
      continue;
    }

    if (section.id === "professional-experience") {
      for (const experience of section.content) {
        body.push(
          paragraph(
            `${textRun(experience.assignedRole, { bold: true })}${textRun(` | ${experience.companyName}`)}<w:r><w:tab/></w:r>${textRun(`${experience.startDate} - ${experience.endDate}`)}`,
            {
              style: "ResumeRoleHeading",
              keepNext: true,
              spacingBeforePt: template.spacing.entryGapPt,
              spacingAfterPt: template.spacing.paragraphGapPt,
              tabStopTwips: contentWidth,
            },
          ),
        );
        emittedTokens.push(
          experience.assignedRole,
          experience.companyName,
          experience.startDate,
          experience.endDate,
        );
        for (const bullet of experience.bullets) {
          body.push(
            paragraph(textRun(bullet), {
              style: "ResumeBullet",
              bullet: true,
              spacingAfterPt: template.spacing.bulletGapPt,
            }),
          );
          emittedTokens.push(bullet);
        }
      }
      continue;
    }

    if (section.id === "education") {
      for (const education of section.content) {
        const degree = `${education.degree} in ${education.field}`;
        const period = `${education.startDate} – ${education.endDate}`;
        const suffix = [education.institution, period]
          .filter((value): value is string => Boolean(value?.trim()))
          .join(" | ");
        body.push(
          paragraph(
            `${textRun(degree, { bold: true })}${suffix ? textRun(` | ${suffix}`) : ""}`,
            {
              style: "ResumeBody",
              spacingBeforePt: template.spacing.paragraphGapPt,
              spacingAfterPt: template.spacing.paragraphGapPt,
            },
          ),
        );
        emittedTokens.push(
          education.degree,
          education.field,
          education.institution,
          education.startDate,
          education.endDate,
        );
      }
    }
  }

  body.push(
    `<w:sectPr><w:pgSz w:w="${pageWidth}" w:h="${pageHeight}"/><w:pgMar w:top="${twipsFromInches(template.margins.topInches)}" w:right="${twipsFromInches(template.margins.rightInches)}" w:bottom="${twipsFromInches(template.margins.bottomInches)}" w:left="${twipsFromInches(template.margins.leftInches)}" w:header="0" w:footer="0" w:gutter="0"/><w:cols w:num="1"/><w:docGrid w:linePitch="360"/></w:sectPr>`,
  );

  return {
    xml: `${XML_HEADER}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join("")}</w:body></w:document>`,
    emittedTokens,
  };
}

function stylesXml(data: FinalResumeData): string {
  const template = data.template.template;
  const font = escapeXml(template.typography.fontFamily);
  const bodySize = halfPoints(template.typography.bodySizePt);
  const line = Math.round(template.typography.bodyLineHeight * 240);
  const sectionSize = halfPoints(template.typography.sectionHeadingSizePt);
  const roleSize = halfPoints(template.typography.roleHeadingSizePt);
  const nameSize = halfPoints(template.typography.nameSizePt);
  const contactSize = halfPoints(template.typography.contactSizePt);
  const bulletLeft = twipsFromInches(template.spacing.bulletIndentInches);
  const bulletHanging = twipsFromInches(template.spacing.hangingIndentInches);
  return `${XML_HEADER}<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:eastAsia="${font}" w:cs="${font}"/><w:sz w:val="${bodySize}"/><w:szCs w:val="${bodySize}"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="${line}" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}"/><w:sz w:val="${bodySize}"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ResumeBody"><w:name w:val="Resume Body"/><w:basedOn w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="ResumeName"><w:name w:val="Resume Name"/><w:basedOn w:val="Normal"/><w:qFormat/><w:rPr><w:b/><w:sz w:val="${nameSize}"/><w:szCs w:val="${nameSize}"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ResumeContact"><w:name w:val="Resume Contact"/><w:basedOn w:val="Normal"/><w:qFormat/><w:rPr><w:sz w:val="${contactSize}"/><w:szCs w:val="${contactSize}"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ResumeSectionHeading"><w:name w:val="Resume Section Heading"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="000000"/></w:pBdr></w:pPr><w:rPr><w:b/><w:sz w:val="${sectionSize}"/><w:szCs w:val="${sectionSize}"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ResumeRoleHeading"><w:name w:val="Resume Role Heading"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/></w:pPr><w:rPr><w:sz w:val="${roleSize}"/><w:szCs w:val="${roleSize}"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ResumeBullet"><w:name w:val="Resume Bullet"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:left="${bulletLeft}" w:hanging="${bulletHanging}"/></w:pPr></w:style>
</w:styles>`;
}

function numberingXml(): string {
  return `${XML_HEADER}<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="360"/></w:tabs><w:ind w:left="360" w:hanging="180"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num></w:numbering>`;
}

function contentTypesXml(): string {
  return `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
}

function rootRelationshipsXml(): string {
  return `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
}

function documentRelationshipsXml(): string {
  return `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/></Relationships>`;
}

function settingsXml(): string {
  return `${XML_HEADER}<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:zoom w:percent="100"/><w:defaultTabStop w:val="720"/><w:doNotTrackMoves/><w:doNotTrackFormatting/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;
}

function corePropertiesXml(data: FinalResumeData): string {
  const created = escapeXml(data.context.createdAt);
  return `${XML_HEADER}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Resume</dc:title><dc:subject>Professional Resume</dc:subject><dc:creator>Resume Generator</dc:creator><cp:lastModifiedBy>Resume Generator</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${created}</dcterms:modified></cp:coreProperties>`;
}

function appPropertiesXml(): string {
  return `${XML_HEADER}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Resume Generator</Application><AppVersion>1.0</AppVersion><Company></Company><LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged></Properties>`;
}

export class AtsDocxRenderer implements ResumeFormatRenderer {
  readonly format = "docx" as const;

  async render(data: FinalResumeData): Promise<ResumeRenderResult> {
    const canonical = createCanonicalResume(data);
    const document = documentXml(data);
    const bytes = createStoredZip([
      { path: "[Content_Types].xml", data: contentTypesXml() },
      { path: "_rels/.rels", data: rootRelationshipsXml() },
      { path: "docProps/core.xml", data: corePropertiesXml(data) },
      { path: "docProps/app.xml", data: appPropertiesXml() },
      { path: "word/document.xml", data: document.xml },
      { path: "word/styles.xml", data: stylesXml(data) },
      { path: "word/numbering.xml", data: numberingXml() },
      { path: "word/settings.xml", data: settingsXml() },
      { path: "word/_rels/document.xml.rels", data: documentRelationshipsXml() },
    ]);
    return {
      format: this.format,
      bytes,
      emittedTokens: document.emittedTokens,
      atsSafeStructure: true,
      selectableTextExpected: true,
      warnings:
        canonical.tokens.length === document.emittedTokens.length
          ? []
          : ["DOCX token trace length differs from the canonical source trace."],
    };
  }
}
