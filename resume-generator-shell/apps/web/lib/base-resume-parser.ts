import type {
  BaseResumeExperience,
  BaseResumeExtracted,
} from "@resume/contracts";

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
  return text
    .replace(/\r/g, "")
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
  const sections = new Map<string, string[]>([["header", []], ["experience", []], ["education", []], ["skills", []], ["other", []]]);
  let current = "header";
  for (const line of lines) {
    if (SECTION_HEADERS.test(line)) {
      const key = line.toLowerCase();
      if (key.includes("experience") || key.includes("employment")) current = "experience";
      else if (key.includes("education")) current = "education";
      else if (key.includes("skill") || key.includes("technolog")) current = "skills";
      else if (key.includes("summary")) current = "other";
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
    const dateMatch = DATE_RANGE_RE.exec(line);
    const bullet = /^[-•*]\s+/.test(line) || /^[A-Z][a-z]+(?:ed|ing)\b/.test(line);

    if (dateMatch) {
      const before = line.slice(0, dateMatch.index).trim();
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

    if (!current) {
      // Title/company line before dates
      if (ROLE_COMPANY_RE.test(line) || line.includes("|")) {
        const roleCompany = ROLE_COMPANY_RE.exec(line);
        const [left, right] = line.split("|").map((part) => part.trim());
        current = {
          experienceId: `EXP-${String(experiences.length + 1).padStart(3, "0")}`,
          companyName: roleCompany?.[2]?.trim() || right || "Unknown Company",
          role: roleCompany?.[1]?.trim() || left || undefined,
          startDate: "2018",
          endDate: "Present",
          bullets: [],
          stacks: [],
        };
      }
      continue;
    }

    if (bullet || line.length > 40) {
      current.bullets.push(line.replace(/^[-•*]\s+/, "").trim());
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
  }));
}

function parseEducation(lines: string[]): BaseResumeExtracted["education"] {
  const education: BaseResumeExtracted["education"] = [];
  for (const line of lines) {
    const dateMatch = DATE_RANGE_RE.exec(line);
    const degreeMatch =
      /\b(Bachelor|Master|B\.?S\.?|M\.?S\.?|B\.?A\.?|Ph\.?D\.?|Associate)[^,]*/i.exec(
        line,
      );
    if (!dateMatch && !degreeMatch && !/university|college|institute/i.test(line)) {
      continue;
    }
    education.push({
      educationId: `EDU-${String(education.length + 1).padStart(3, "0")}`,
      institution:
        line.replace(DATE_RANGE_RE, "").split("|")[0]?.split(",")[0]?.trim() ||
        "Unknown Institution",
      degree: degreeMatch?.[0]?.trim() || "Degree",
      field: /in\s+([A-Za-z][A-Za-z\s&/]+)/i.exec(line)?.[1]?.trim() || "General Studies",
      startDate: dateMatch?.[1]?.trim() || "2012",
      endDate: dateMatch?.[2]?.trim() || "2016",
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
  const experienceLines =
    (sections.get("experience")?.length ?? 0) > 0
      ? sections.get("experience")!
      : lines;
  const educationLines = sections.get("education") ?? [];
  const skillLines = sections.get("skills") ?? [];

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
  const skillStacks = detectStacks(skillLines.join("\n") || text);
  const roleStacks = uniqueStrings(experiences.flatMap((entry) => entry.stacks));
  const stacks = uniqueStrings([...skillStacks, ...roleStacks]);
  const skills = uniqueStrings([
    ...stacks,
    ...skillLines
      .join(",")
      .split(/[,|•]/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 2 && part.length <= 40),
  ]).slice(0, 40);

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
