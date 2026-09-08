import type {
  CandidateProfile,
  ExtractedJD,
  SkillGroup,
  TailoredPackage,
  TailoredResume,
} from "./types";
import { completeJson } from "./llm";
import { parseModelJson } from "./parse-json";
import { collectedJdKeywords, jdTechKeywords } from "./jd-fields";
import { sanitizePlainText } from "./validate-resume";

const SYSTEM_PROMPT = `You are an expert ATS resume writer and career coach.

Create a tailored resume and cover letter for the target role using only the candidate background and structured JD. Optimize for ATS keyword match, recruiter readability, and factual credibility.

The user message JSON has:
- candidate: factual background (personal, experiences, education)
- structuredJd: extracted JD keywords (company, targetRole, requiredSkills, coreResponsibilities, repeatedTechnologies, preferredSkills, domainKnowledge, softSkills)

Treat structuredJd as the JD source of truth. Treat candidate as the only factual source of work history.

HARD RULES

1. HEADLINE
- Start with the exact target role.
- Add 3–4 highest-priority hard skills.
- If the recent role is different but meaningfully relevant:
  [Target Role] & [Recent Role] | [Skill 1] | [Skill 2] | [Skill 3]
- Otherwise:
  [Target Role] | [Skill 1] | [Skill 2] | [Skill 3] | [Skill 4]

2. SUMMARY
- 70–85 words, 3–4 sentences.
- Include target role, relevant years, core specialization, 3–6 priority JD skills, relevant production/domain context, and optionally one supported quantified result.
- Use JD terminology naturally. Avoid keyword stuffing and generic claims.

3. SKILLS
- Use 5–6 compact groups, 5–10 skills each.
- Prioritize required JD skills first, then preferred skills, then relevant background skills.
- Roughly 60% JD skills and 40% supported transferable skills.
- Avoid duplicates and unsupported technologies.

4. EXPERIENCE
For each role:
- Preserve company, period, and location exactly.
- Refine title only if accurate and plausible.
- Add a 25–45 word overview.
- Write exactly 5–6 bullets.
- The first bullet of the first role must closely align with the highest-priority JD responsibility.
- Cover remaining JD responsibilities in priority order.
- Use compressed STAR: context/task + action + technology/method + result.
- Prefer concrete supported metrics such as users, datasets, latency, throughput, cost, time, counts, or percentages.
- Never invent metrics.
- Show senior-level ownership, architecture, execution, scale, production impact, and collaboration where supported.
- Avoid repeated verbs and phrases.

5. EDUCATION
- Preserve school, degree, period, and location exactly.
- Do not invent coursework, certifications, honors, or achievements.

6. KEYWORD ALIGNMENT
- Mirror important JD terminology where factually supported.
- Include high-priority skills in Skills and, when supported, Experience.
- Do not claim direct experience with technologies not present in the candidate background.
- For transferable experience, describe the underlying capability without overstating it.

7. COVER LETTER
- 3–4 short paragraphs in one string separated by \\n\\n.
- Focus on the target role, strongest matching experience, priority JD responsibilities, technologies, and supported impact.
- Keep concise, natural, professional, and non-generic.
- No icons or emojis.

8. FACTUAL INTEGRITY
- Candidate background is the only factual source of truth.
- You may reframe, reorder, consolidate, and strengthen wording.
- Do not invent employers, dates, locations, projects, technologies, metrics, responsibilities, certifications, education, or years of experience.

9. OUTPUT
Return ONLY valid compact JSON.
No markdown, commentary, notes, or code fences.
Ensure the JSON parses successfully.
NEVER use markdown in any string (**bold**, *italic*, backticks, headings). Plain text only. Keyword bolding is applied later by the document formatter.
Escape all double quotes inside strings.

skills.items, experiences.bullets, and keywords MUST be JSON arrays of strings.

{
  "resume": {
    "headline": string,
    "summary": string,
    "skills": [{ "category": string, "items": string[] }],
    "experiences": [{ "company": string, "title": string, "period": string, "location": string, "overview": string, "bullets": string[] }],
    "education": [{ "school": string, "degree": string, "period": string, "location": string }],
    "keywords": string[]
  },
  "coverLetter": string
}`;

function defaultHeadline(
  extracted: ExtractedJD,
  profile: CandidateProfile,
): string {
  const skills = extracted.requiredSkills
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
  const target = extracted.targetRole.trim() || "Software Engineer";
  const recent = profile.experiences[0]?.title.trim() || "";
  const recentDiffers =
    Boolean(recent) && recent.toLowerCase() !== target.toLowerCase();

  if (recentDiffers) {
    return [`${target} & ${recent}`, ...skills.slice(0, 3)]
      .filter(Boolean)
      .join(" | ");
  }

  return [target, ...skills].filter(Boolean).join(" | ");
}

export async function generateTailoredPackage(
  profile: CandidateProfile,
  extracted: ExtractedJD,
): Promise<TailoredPackage> {
  const userPayload = JSON.stringify({
    candidate: profile,
    structuredJd: extracted,
  });

  let content = await requestJson([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPayload },
  ]);

  let parsed: TailoredPackage;
  try {
    parsed = parseModelJson<TailoredPackage>(content);
  } catch (firstError) {
    content = await requestJson([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPayload },
      { role: "assistant", content },
      {
        role: "user",
        content:
          "Your previous reply was invalid JSON. Return ONLY repaired valid JSON for the same request. No markdown, no commentary.",
      },
    ]);
    try {
      parsed = parseModelJson<TailoredPackage>(content);
    } catch {
      throw firstError instanceof Error
        ? firstError
        : new Error("Failed to parse generated resume JSON.");
    }
  }

  const resume = normalizeResume(parsed.resume, profile, extracted);
  const coverLetter = String(parsed.coverLetter || "").trim();

  if (!resume.summary) {
    throw new Error("Resume summary generation failed.");
  }
  if (!coverLetter) {
    throw new Error("Cover letter generation failed.");
  }

  return { resume, coverLetter };
}

async function requestJson(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
): Promise<string> {
  return completeJson({
    messages,
    temperature: 0.3,
    maxTokens: 8000,
    emptyError: "Empty response while generating tailored resume.",
  });
}

function normalizeSkills(
  skills: unknown,
  extracted: ExtractedJD,
): SkillGroup[] {
  if (Array.isArray(skills) && skills.length) {
    if (
      typeof skills[0] === "object" &&
      skills[0] !== null &&
      "category" in (skills[0] as object)
    ) {
      return (skills as Array<{ category?: unknown; items?: unknown }>)
        .map((group) => ({
          category: sanitizePlainText(String(group.category || "Skills")),
          items: Array.isArray(group.items)
            ? group.items
                .map(String)
                .map((s) => sanitizePlainText(s))
                .filter(Boolean)
            : [],
        }))
        .filter((group) => group.items.length > 0);
    }

    const items = skills
      .map(String)
      .map((s) => sanitizePlainText(s))
      .filter(Boolean);
    if (items.length) {
      return [{ category: "Technical Skills", items }];
    }
  }

  const fallback = jdTechKeywords(extracted).filter(Boolean);
  if (!fallback.length) {
    return [
      {
        category: "Core",
        items: ["Software Engineering", "System Design", "Agile Delivery"],
      },
    ];
  }

  return [
    {
      category: "Technical Skills",
      items: fallback,
    },
  ];
}

function normalizeResume(
  resume: TailoredResume | undefined,
  profile: CandidateProfile,
  extracted: ExtractedJD,
): TailoredResume {
  const safe = resume || {
    headline: "",
    summary: "",
    skills: [],
    experiences: [],
    education: [],
    keywords: [],
  };

  const skillGroups = normalizeSkills(safe.skills, extracted);
  const headline =
    sanitizePlainText(String(safe.headline || "")) ||
    defaultHeadline(extracted, profile);

  const keywords = Array.from(
    new Set(
      [
        ...(safe.keywords || []),
        ...skillGroups.flatMap((g) => g.items),
        ...collectedJdKeywords(extracted),
      ]
        .map((k) => String(k).trim())
        .filter(Boolean),
    ),
  );

  const experiences = profile.experiences.map((exp, index) => {
    const generated = safe.experiences?.[index];
    let bullets = (generated?.bullets || [])
      .map(String)
      .map((b) => sanitizePlainText(b))
      .filter(Boolean);
    bullets = bullets.slice(0, 6);

    const overview = sanitizePlainText(
      String(
        generated && "overview" in generated
          ? (generated as { overview?: string }).overview || ""
          : "",
      ),
    );

    return {
      company: exp.company,
      title: sanitizePlainText(generated?.title?.trim() || exp.title),
      period: exp.period,
      location: exp.location,
      overview:
        overview ||
        `${exp.company} team delivering software products in a ${exp.location.toLowerCase()} setting; served as ${exp.title} owning delivery of key features and technical outcomes aligned to business needs.`,
      bullets,
    };
  });

  return {
    headline,
    summary: sanitizePlainText(String(safe.summary || "")),
    skills: skillGroups,
    experiences,
    education:
      Array.isArray(safe.education) && safe.education.length
        ? safe.education.map((edu) => ({
            school: sanitizePlainText(edu.school),
            degree: sanitizePlainText(edu.degree),
            period: sanitizePlainText(edu.period),
            location: sanitizePlainText(edu.location),
          }))
        : profile.education,
    keywords: keywords.map((k) => sanitizePlainText(k)).filter(Boolean),
  };
}
