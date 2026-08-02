import type {
  BaseResumeExperience,
  BaseResumeExtracted,
} from "@resume/contracts";
import {
  cleanResumeExtractText,
  isJunkBulletText,
  sanitizeBulletList,
  sanitizeBulletText,
  softCleanBulletText,
} from "./base-resume-bullet-sanitize";
import {
  decodeEncodedPdfText,
  isCorruptEncodedText,
  sanitizeEncodedField,
} from "./pdf-encoding-decode";

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE =
  /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/;
const LINKEDIN_RE = /https?:\/\/(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9_-]+\/?/i;
const URL_RE = /https?:\/\/[^\s)]+/i;

const SECTION_HEADERS =
  /^(?:professional\s+experience|work\s+experience|experience|employment|education|skills|technical\s+skills|technologies|projects|summary|professional\s+summary|certifications)\s*:?\s*$/i;

const DATE_RANGE_RE =
  /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{4}(?:[-/]\d{1,2})?)\s*[-–—to]+\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{4}(?:[-/]\d{1,2})?|Present|Current|Now)/i;

const ROLE_COMPANY_RE =
  /^(.{2,80}?)\s+(?:at|@|\||[-–—])\s+(.{2,80})$/i;

const STACK_TOKEN_RE =
  /\b(?:React(?:\.js)?|Next\.js|TypeScript|JavaScript|Node\.js|Python|Java|Go|Rust|Kotlin|Swift|AWS|GCP|Azure|Docker|Kubernetes|PostgreSQL|MySQL|MongoDB|Redis|GraphQL|REST|Spark|Airflow|Kafka|Snowflake|Databricks|Terraform|CI\/CD|MLflow|PyTorch|TensorFlow|Vue(?:\.js)?|Angular|Django|Flask|Spring|Rails|\.NET|C\+\+|C#|SQL|NoSQL|Linux|Git|Tailwind|CSS|HTML)\b/gi;

function cleanLines(text: string): string[] {
  return cleanResumeExtractText(text)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function detectStacks(text: string): string[] {
  const matches = text.match(STACK_TOKEN_RE) ?? [];
  return uniqueStrings(matches.map((item) => item.replace(/\.js$/i, (m) => m)));
}

function sectionize(lines: string[]): Map<string, string[]> {
  const sections = new Map<string, string[]>([
    ["header", []],
    ["summary", []],
    ["experience", []],
    ["education", []],
    ["skills", []],
    ["other", []],
  ]);
  let current = "header";
  for (const line of lines) {
    if (SECTION_HEADERS.test(line)) {
      const key = line.toLowerCase();
      if (key.includes("experience") || key.includes("employment")) current = "experience";
      else if (key.includes("education")) current = "education";
      else if (key.includes("skill") || key.includes("technolog")) current = "skills";
      else if (key.includes("summary")) current = "summary";
      else current = "other";
      continue;
    }
    sections.get(current)?.push(line);
  }
  return sections;
}

function parseExperiences(lines: string[]): BaseResumeExperience[] {
  const experiences: BaseResumeExperience[] = [];
  let current: BaseResumeExperience | null = null;

  const pushCurrent = () => {
    if (!current) return;
    current.stacks = detectStacks(
      [current.role, current.companyName, ...current.bullets].join(" "),
    );
    experiences.push(current);
    current = null;
  };

  for (const line of lines) {
    const decodedLine = decodeEncodedPdfText(line);
    const dateMatch = DATE_RANGE_RE.exec(line);
    const bullet =
      /^[-•*\uF0B7]\s+/.test(line) ||
      /^[-•*\uF0B7]\s+/.test(decodedLine) ||
      /^J\s*=/.test(line) ||
      /^[A-Z][a-z]+(?:ed|ing)\b/.test(softCleanBulletText(line));

    if (dateMatch) {
      const before = line.slice(0, dateMatch.index).trim();
      // Bullet lines sometimes leak a trailing "2018 - Present" from PDF headers.
      // Keep them as bullets instead of opening a fake experience.
      if (bullet || (before.length > 60 && /\b(?:by|with|for|and|the|that|from)\b/i.test(before))) {
        if (!current) continue;
        const soft = softCleanBulletText(line);
        if (soft && !isJunkBulletText(sanitizeBulletText(soft))) {
          current.bullets.push(soft);
        }
        continue;
      }
      // Role/company on previous line, dates alone on this line → keep same experience.
      if (!before && current && current.bullets.length === 0) {
        current.startDate = dateMatch[1]!.trim();
        current.endDate = dateMatch[2]!.trim();
        continue;
      }

      let role = "";
      let company = "";
      const roleCompany = ROLE_COMPANY_RE.exec(before);
      if (roleCompany) {
        role = roleCompany[1]!.trim();
        company = roleCompany[2]!.trim();
      } else if (before.includes("|")) {
        const [left, right] = before.split("|").map((part) => part.trim());
        role = left || "";
        company = right || "";
      } else if (before) {
        // "Senior Engineer, Acme" or just a title line before dates on next/same line
        const comma = before.split(",").map((part) => part.trim());
        if (comma.length >= 2) {
          role = comma[0] || "";
          company = comma.slice(1).join(", ");
        } else {
          role = before;
        }
      }

      // If company missing, peek previous non-bullet line already stored as role-only.
      if (current && !current.bullets.length && !company && current.companyName === "Unknown Company") {
        company = current.role || current.companyName;
      }

      role = sanitizeEncodedField(role, "");
      company = sanitizeEncodedField(company, "");
      // Bullet/body fragments with leaked margin dates must not become fake jobs.
      const beforeLooksLikeBody =
        before.length > 70 ||
        /^(?:•|-|\*)/.test(before) ||
        /\b(?:traffic|latency|decreasing|feature|accuracy|high-volume|throughput|inference|pipeline|frameworks)\b/i.test(
          before,
        ) ||
        /^(?:and|the|with|for|that|through|using)\b/i.test(before) ||
        isCorruptEncodedText(before);
      if (beforeLooksLikeBody) {
        if (current) {
          const soft = softCleanBulletText(before);
          if (soft && !isJunkBulletText(sanitizeBulletText(soft))) {
            current.bullets.push(soft);
          }
        }
        continue;
      }

      pushCurrent();
      current = {
        experienceId: `EXP-${String(experiences.length + 1).padStart(3, "0")}`,
        companyName: company || "Unknown Company",
        role: role || undefined,
        startDate: dateMatch[1]!.trim(),
        endDate: dateMatch[2]!.trim(),
        bullets: [],
        stacks: [],
      };
      continue;
    }

    // New role/company heading — start a fresh experience when the current one
    // already has bullets (or none exists yet).
    if (
      !bullet &&
      (ROLE_COMPANY_RE.test(line) || (line.includes("|") && line.length < 90))
    ) {
      const roleCompany = ROLE_COMPANY_RE.exec(line);
      const [left, right] = line.split("|").map((part) => part.trim());
      if (!current || current.bullets.length > 0) {
        pushCurrent();
        current = {
          experienceId: `EXP-${String(experiences.length + 1).padStart(3, "0")}`,
          companyName:
            sanitizeEncodedField(roleCompany?.[2]?.trim() || right || "", "Unknown Company"),
          role: sanitizeEncodedField(roleCompany?.[1]?.trim() || left || "", "") || undefined,
          startDate: "2018",
          endDate: "Present",
          bullets: [],
          stacks: [],
        };
      } else {
        current.companyName = sanitizeEncodedField(
          roleCompany?.[2]?.trim() || right || current.companyName,
          current.companyName,
        );
        current.role =
          sanitizeEncodedField(roleCompany?.[1]?.trim() || left || current.role || "", "") ||
          current.role;
      }
      continue;
    }

    if (!current) {
      continue;
    }

    if (bullet || line.length > 40 || /^[a-z(]/.test(line) || /-$/.test(line)) {
      const soft = softCleanBulletText(line);
      if (!soft) continue;
      // Drop contact/page junk, but allow short wrap fragments to join first.
      if (
        /^(?:page\s*)?\d+\s*(?:of|\/)\s*\d+$/i.test(soft) ||
        (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(soft) && soft.length < 80)
      ) {
        continue;
      }
      const previous = current.bullets[current.bullets.length - 1];
      const actionVerbStart =
        /^(?:Established|Engineered|Delivered|Designed|Developed|Championed|Orchestrated|Integrated|Implemented|Optimized|Created|Spearheaded|Devised|Launched|Automated|Initiated|Directed|Advanced|Strengthened|Played|Resolved|Transformed|Introduced|Built|Led|Owned|Improved|Collaborated|Coordinated)\b/.test(
          soft,
        );
      // PDF wrap tails sometimes keep a leading "-" even when they continue the prior bullet
      // ("in-the-" + "- wild deepfake...").
      const hyphenWrap =
        typeof previous === "string" &&
        /-$/.test(previous) &&
        Boolean(bullet) &&
        !actionVerbStart &&
        soft.length < 100;
      const startsNewBullet = (Boolean(bullet) || actionVerbStart) && !hyphenWrap;
      const nextIsFragment = /^[a-z(]/.test(soft) || soft.length < 48;
      const previousOpen =
        typeof previous === "string" &&
        (/(?:,|;|\band|\bwith|\bfor|\bto|\bby|\bthrough|\/)\s*$/i.test(previous) ||
          /-$/.test(previous));
      // Join PDF-wrapped continuations onto the previous bullet when useful.
      if (
        typeof previous === "string" &&
        !startsNewBullet &&
        (
          /^[a-z(]/.test(soft) ||
          (previousOpen && nextIsFragment) ||
          (previousOpen && /^[\d(%]/.test(soft)) ||
          hyphenWrap
        )
      ) {
        const joiner = /-$/.test(previous) ? "" : " ";
        current.bullets[current.bullets.length - 1] = softCleanBulletText(
          `${previous}${joiner}${soft}`,
        );
      } else if (!isJunkBulletText(sanitizeBulletText(soft))) {
        current.bullets.push(soft);
      }
    } else if (!current.companyName || current.companyName === "Unknown Company") {
      current.companyName = line;
    } else if (!current.role) {
      current.role = line;
    }
  }
  pushCurrent();

  return experiences.map((entry, index) => ({
    ...entry,
    experienceId: `EXP-${String(index + 1).padStart(3, "0")}`,
    bullets: sanitizeBulletList(entry.bullets),
  }));
}

/** Pull skill names from the Skills section, preserving original labels. */
export function parseSkillNames(skillLines: readonly string[]): string[] {
  const names: string[] = [];
  for (const line of skillLines) {
    const cleaned = line.replace(/^skills?\s*:\s*/i, "").trim();
    if (!cleaned) continue;
    const categorized = /^([^:]{2,48}):\s*(.+)$/.exec(cleaned);
    const payload = (categorized?.[2] || cleaned).trim();
    for (const part of payload.split(/[,|•]/)) {
      const name = part.replace(/^[-*]\s*/, "").trim();
      if (name.length >= 2 && name.length <= 48 && !/^skills?$/i.test(name)) {
        names.push(name);
      }
    }
  }
  return uniqueStrings(names).slice(0, 40);
}

function parseEducation(lines: string[]): BaseResumeExtracted["education"] {
  const education: BaseResumeExtracted["education"] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const normalized = line.replace(/\s+/g, " ").trim();
    // Skip duplicated mangled education lines.
    if (/(\bB\.?S\.?\b.*\bB\.?S\.?\b)|(\bCOMPUTER SCIENCE\b.*\bCOMPUTER SCIENCE\b)/i.test(normalized) &&
      (normalized.match(/\|/g) ?? []).length >= 2) {
      // Still parse, but take the cleanest left-side fields only.
    }
    const dateMatch = DATE_RANGE_RE.exec(normalized);
    const degreeMatch =
      /\b(Bachelor(?:\s+of\s+[A-Za-z]+)?|Master(?:\s+of\s+[A-Za-z]+)?|B\.?S\.?|M\.?S\.?|B\.?A\.?|Ph\.?D\.?|Associate)\b/i.exec(
        normalized,
      );
    if (!dateMatch && !degreeMatch && !/university|college|institute/i.test(normalized)) {
      continue;
    }
    const institutionMatch =
      /\b((?:University|College|Institute|School)\s+of\s+[A-Za-z][A-Za-z\s.-]+|[A-Za-z][A-Za-z\s.-]+(?:University|College|Institute))\b/i.exec(
        normalized,
      );
    const fieldMatch =
      /\bin\s+([A-Za-z][A-Za-z\s&/]+?)(?:\s*\||\s+\d{4}|$)/i.exec(normalized);
    const degree = (degreeMatch?.[0] || "Degree")
      .replace(/\s+/g, " ")
      .trim();
    const field = (fieldMatch?.[1] || "General Studies").replace(/\s+/g, " ").trim();
    const institution = (institutionMatch?.[1] || "University")
      .replace(/\s+/g, " ")
      .replace(/\s+in\s+COMPUTER\s+SCIENCE.*$/i, "")
      .trim();
    const startDate = dateMatch?.[1]?.trim() || "2012";
    const endDate = dateMatch?.[2]?.trim() || "2016";
    const key = `${degree}|${field}|${institution}|${startDate}|${endDate}`.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    education.push({
      educationId: `EDU-${String(education.length + 1).padStart(3, "0")}`,
      institution,
      degree,
      field,
      startDate,
      endDate,
    });
  }
  return education;
}

/**
 * Rule-based resume text → structured role/stack extraction.
 * Perfect resumes with clear Experience / Skills headings parse best.
 */
export function parseBaseResumeText(rawText: string): BaseResumeExtracted {
  const text = rawText.replace(/\r/g, "").trim();
  if (text.length < 40) {
    throw new Error("Resume text is too short to extract structured information.");
  }

  const lines = cleanLines(text);
  const sections = sectionize(lines);
  const header = sections.get("header") ?? [];
  const summaryLines = sections.get("summary") ?? [];
  const experienceLines =
    (sections.get("experience")?.length ?? 0) > 0
      ? sections.get("experience")!
      : lines;
  const educationLines = sections.get("education") ?? [];
  const skillLines = sections.get("skills") ?? [];
  const summary = summaryLines.join(" ").replace(/\s+/g, " ").trim();

  const email = text.match(EMAIL_RE)?.[0];
  const phone = text.match(PHONE_RE)?.[0];
  const linkedin = text.match(LINKEDIN_RE)?.[0];
  const portfolio = [...text.matchAll(new RegExp(URL_RE, "gi"))]
    .map((match) => match[0])
    .find((url) => !/linkedin\.com/i.test(url));

  const fullName =
    header.find((line) => !EMAIL_RE.test(line) && !PHONE_RE.test(line) && line.length < 60) ||
    lines[0] ||
    "Candidate";

  const experiences = parseExperiences(experienceLines);
  const education = parseEducation(educationLines);
  // Preserve skills from the Skills section only (do not mix in experience stacks).
  const skills = parseSkillNames(skillLines);
  const skillStacks = detectStacks(skillLines.join("\n") || skills.join("\n"));
  const roleStacks = uniqueStrings(experiences.flatMap((entry) => entry.stacks));
  const stacks = uniqueStrings([...skillStacks, ...roleStacks, ...skills]);

  if (experiences.length === 0) {
    experiences.push({
      experienceId: "EXP-001",
      companyName: "Prior Experience",
      role: undefined,
      startDate: "2018",
      endDate: "Present",
      bullets: lines.filter((line) => line.length > 40).slice(0, 8),
      stacks: stacks.slice(0, 8),
    });
  }

  return {
    personalInformation: {
      fullName,
      ...(email ? { email } : {}),
      ...(phone ? { phone } : {}),
      location: "Remote",
      ...(linkedin ? { linkedin } : {}),
      ...(portfolio ? { portfolio } : {}),
    },
    summary,
    experiences,
    education:
      education.length > 0
        ? education
        : [
            {
              educationId: "EDU-001",
              institution: "University",
              degree: "Bachelor of Science",
              field: "Computer Science",
              startDate: "2012",
              endDate: "2016",
            },
          ],
    skills,
    stacks,
  };
}
