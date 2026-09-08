import * as cheerio from "cheerio";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function cleanText(text: string): string {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function htmlFragmentToText(html: string): string {
  const $ = cheerio.load(`<div id="jd-root">${html}</div>`);
  return cleanText($("#jd-root").text());
}

function descriptionFromUnknown(value: unknown): string {
  if (typeof value === "string") {
    const text = htmlFragmentToText(value);
    return text.length > 80 ? text : "";
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const text = descriptionFromUnknown(item);
      if (text) return text;
    }
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const type = String(record["@type"] || "");
    if (type.includes("JobPosting")) {
      return descriptionFromUnknown(record.description);
    }
    if (Array.isArray(record["@graph"])) {
      return descriptionFromUnknown(record["@graph"]);
    }
  }
  return "";
}

function extractJsonLdJobText($: cheerio.CheerioAPI): string {
  let found = "";
  $('script[type="application/ld+json"]').each((_, el) => {
    if (found) return;
    const raw = $(el).contents().text();
    try {
      found = descriptionFromUnknown(JSON.parse(raw));
    } catch {
      /* ignore malformed JSON-LD */
    }
  });
  return found;
}

function unescapeJsString(value: string): string {
  try {
    return JSON.parse(`"${value}"`);
  } catch {
    return value
      .replace(/\\u([\da-fA-F]{4})/g, (_, hex: string) =>
        String.fromCharCode(Number.parseInt(hex, 16)),
      )
      .replace(/\\n/g, "\n")
      .replace(/\\"/g, '"');
  }
}

function extractFlightJobText(html: string): string {
  const payloads: string[] = [];
  const pushRe = /self\.__next_f\.push\(\[1,"((?:\\.|[^"\\])*)"\]\)/g;
  for (const match of html.matchAll(pushRe)) {
    payloads.push(unescapeJsString(match[1]));
  }

  const blob = payloads.join("\n") || html;
  if (!blob.includes("JobPosting") && !blob.includes("job posting")) {
    const descMatch = blob.match(/"description"\s*:\s*"((?:\\.|[^"\\])*)"/);
    if (descMatch?.[1]) {
      const text = htmlFragmentToText(unescapeJsString(descMatch[1]));
      if (text.length > 120) return text;
    }
    return "";
  }

  const descMatch = blob.match(
    /"@type"\s*:\s*"JobPosting"[\s\S]{0,4000}?"description"\s*:\s*"((?:\\.|[^"\\])*)"/,
  );
  if (descMatch?.[1]) {
    const text = htmlFragmentToText(unescapeJsString(descMatch[1]));
    if (text.length > 120) return text;
  }

  const anyDesc = blob.match(/"description"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (anyDesc?.[1]) {
    const text = htmlFragmentToText(unescapeJsString(anyDesc[1]));
    if (text.length > 120) return text;
  }

  return "";
}

function extractFromSelectors(
  $: cheerio.CheerioAPI,
  selectors: string[],
): string {
  for (const selector of selectors) {
    const el = $(selector).first();
    if (el.length) {
      const text = cleanText(el.text());
      if (text.length > 200) return text;
    }
  }
  return "";
}

export async function scrapeJobDescription(url: string): Promise<{
  rawText: string;
  pageTitle: string;
}> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": BROWSER_UA,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch job page (${response.status}): ${url}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const pageTitle = cleanText($("title").first().text() || "");

  const embedded =
    extractJsonLdJobText($) || extractFlightJobText(html);

  $("script, style, noscript, svg, nav, footer, header, iframe").remove();

  const targeted = extractFromSelectors($, [
    "[data-testid='jobDescriptionText']",
    ".jobsearch-JobComponent-description",
    "#jobDescriptionText",
    ".jobs-description__content",
    ".jobs-box__html-content",
    ".job-description",
    ".jobDescriptionContent",
    "#job-description",
    ".description__text",
    "[class*='job-description']",
    "[class*='JobDescription']",
    "article",
    "main",
  ]);

  const rawText = embedded || targeted || cleanText($("body").text());

  if (rawText.length < 120) {
    throw new Error(
      `Could not extract a usable job description from ${url}. The page may require login or block scrapers.`,
    );
  }

  return {
    rawText: rawText.slice(0, 50000),
    pageTitle,
  };
}

export function sanitizeCompanyFolderName(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
  return cleaned || "Unknown_Company";
}

/** Safe zip filename segment: keeps readability, strips path-hostile chars. */
export function sanitizeZipSegment(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/\s+/g, " ")
    .replace(/-+/g, "-")
    .trim()
    .slice(0, 80);
  return cleaned || "Unknown";
}

export function profileFirstName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] || "Candidate";
  return sanitizeZipSegment(first).replace(/\s+/g, "") || "Candidate";
}

export function buildDocumentFileNames(fullName: string) {
  const first = profileFirstName(fullName);
  return {
    resumeDocx: `Resume-${first}.docx`,
    resumePdf: `Resume-${first}.pdf`,
    coverLetterDocx: `Coverletter-${first}.docx`,
    coverLetterTxt: `Coverletter-${first}.txt`,
  };
}

export function buildZipFileName(company: string, role: string): string {
  const companyPart = sanitizeZipSegment(company);
  const rolePart = sanitizeZipSegment(role);
  return `${companyPart}-${rolePart}.zip`;
}
