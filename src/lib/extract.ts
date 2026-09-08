import type { ExtractedJD } from "./types";
import { getLlmClient, getLlmModel } from "./llm";
import { parseModelJson } from "./parse-json";

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item).trim())
    .filter(Boolean);
}

export async function extractJobDescription(
  rawJd: string,
  pageTitle: string,
  jobUrl: string,
): Promise<ExtractedJD> {
  const client = getLlmClient();

  const completion = await client.chat.completions.create({
    model: getLlmModel(),
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You extract hiring keywords from a job posting.
Return ONLY valid JSON (no markdown) with keys:
- company (string; infer from page title or URL if missing)
- targetRole (string; official job title)
- requiredSkills (string array; must-have skills from requirements / qualifications)
- coreResponsibilities (string array; main duties as short phrases)
- repeatedTechnologies (string array; tools/languages/platforms mentioned often or emphasized)
- preferredSkills (string array; nice-to-have / plus / bonus skills)
- domainKnowledge (string array; industry or problem-domain terms, e.g. fintech, healthcare, ads, payments)
- softSkills (string array; communication, leadership, collaboration, etc.)

Rules:
- Prefer specific names (React, Kubernetes, SQL) over vague phrases.
- Split required vs preferred when the posting distinguishes them; if it does not, put skills in requiredSkills.
- Do not include salary, work mode, or a prose summary.
- Escape quotes inside strings.`,
      },
      {
        role: "user",
        content: `Job URL: ${jobUrl}
Page title: ${pageTitle}

Job posting text:
${rawJd.slice(0, 20000)}`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Empty response while extracting job description.");
  }

  const parsed = parseModelJson<
    Partial<ExtractedJD> & {
      jobTitle?: unknown;
      requiredSkills?: unknown;
      coreResponsibilities?: unknown;
      repeatedTechnologies?: unknown;
      preferredSkills?: unknown;
      domainKnowledge?: unknown;
      softSkills?: unknown;
    }
  >(content);

  const targetRole = String(
    parsed.targetRole || parsed.jobTitle || "Software Engineer",
  ).trim();

  return {
    company: String(parsed.company || "Unknown Company").trim(),
    targetRole,
    requiredSkills: asStringList(parsed.requiredSkills),
    coreResponsibilities: asStringList(parsed.coreResponsibilities),
    repeatedTechnologies: asStringList(parsed.repeatedTechnologies),
    preferredSkills: asStringList(parsed.preferredSkills),
    domainKnowledge: asStringList(parsed.domainKnowledge),
    softSkills: asStringList(parsed.softSkills),
  };
}
