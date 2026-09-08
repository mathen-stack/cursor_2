import type { ExtractedJD } from "./types";
import { getLlmClient, getLlmModel } from "./llm";
import { parseModelJson } from "./parse-json";
import {
  JD_KEYWORD_MAX,
  JD_KEYWORD_MIN,
  capJdKeywords,
  countJdKeywords,
  dedupeJdLists,
} from "./jd-fields";

const EXTRACT_SYSTEM = `You extract hiring keywords from a job posting.
Return ONLY valid JSON (no markdown) with keys:
- company (string; infer from page title or URL if missing)
- targetRole (string; official job title)
- requiredSkills (string array; must-have skills from requirements / qualifications)
- coreResponsibilities (string array; main duties as short phrases)
- repeatedTechnologies (string array; tools/languages/platforms mentioned often or emphasized)
- preferredSkills (string array; nice-to-have / plus / bonus skills)
- domainKnowledge (string array; industry or problem-domain terms, e.g. fintech, healthcare, ads, payments)
- softSkills (string array; communication, leadership, collaboration, etc.)

Keyword count (required):
- Count every distinct item in targetRole plus the six arrays.
- Return BETWEEN ${JD_KEYWORD_MIN} AND ${JD_KEYWORD_MAX} distinct keywords/phrases in total.
- Prefer terms written in the posting.
- If the posting has fewer than ${JD_KEYWORD_MIN} distinct terms, ADD relevant keywords that are standard for this targetRole and still consistent with the JD (adjacent tools, typical stack, domain terms). Do not invent an unrelated tech stack.
- Do not exceed ${JD_KEYWORD_MAX} distinct items.
- Prefer specific names (React, Kubernetes, SQL) over vague phrases.
- Split required vs preferred when the posting distinguishes them; if it does not, put skills in requiredSkills.
- Do not include salary, work mode, or a prose summary.
- Escape quotes inside strings.`;

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item).trim())
    .filter(Boolean);
}

type ExtractRaw = Partial<ExtractedJD> & {
  jobTitle?: unknown;
  requiredSkills?: unknown;
  coreResponsibilities?: unknown;
  repeatedTechnologies?: unknown;
  preferredSkills?: unknown;
  domainKnowledge?: unknown;
  softSkills?: unknown;
};

function normalizeExtracted(parsed: ExtractRaw): ExtractedJD {
  const targetRole = String(
    parsed.targetRole || parsed.jobTitle || "Software Engineer",
  ).trim();

  return dedupeJdLists({
    company: String(parsed.company || "Unknown Company").trim(),
    targetRole,
    requiredSkills: asStringList(parsed.requiredSkills),
    coreResponsibilities: asStringList(parsed.coreResponsibilities),
    repeatedTechnologies: asStringList(parsed.repeatedTechnologies),
    preferredSkills: asStringList(parsed.preferredSkills),
    domainKnowledge: asStringList(parsed.domainKnowledge),
    softSkills: asStringList(parsed.softSkills),
  });
}

async function requestExtract(
  client: ReturnType<typeof getLlmClient>,
  model: string,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
): Promise<ExtractedJD> {
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content?.trim()) {
    throw new Error("Empty response while extracting job description.");
  }

  return normalizeExtracted(parseModelJson<ExtractRaw>(content));
}

export async function extractJobDescription(
  rawJd: string,
  pageTitle: string,
  jobUrl: string,
): Promise<ExtractedJD> {
  const client = getLlmClient();
  const model = getLlmModel();
  const userContent = `Job URL: ${jobUrl}
Page title: ${pageTitle}

Job posting text:
${rawJd.slice(0, 20000)}`;

  const baseMessages = [
    { role: "system" as const, content: EXTRACT_SYSTEM },
    { role: "user" as const, content: userContent },
  ];

  let extracted = await requestExtract(client, model, baseMessages);
  let count = countJdKeywords(extracted);

  if (count < JD_KEYWORD_MIN) {
    extracted = await requestExtract(client, model, [
      ...baseMessages,
      {
        role: "assistant",
        content: JSON.stringify(extracted),
      },
      {
        role: "user",
        content: `You returned only ${count} distinct keywords. Expand to ${JD_KEYWORD_MIN}-${JD_KEYWORD_MAX} distinct keywords.
Keep every useful term you already extracted.
Add relevant keywords for this targetRole that fit the posting (related technologies, typical stack, domain knowledge, soft skills).
Return the full JSON object only.`,
      },
    ]);
    count = countJdKeywords(extracted);
  }

  if (count < JD_KEYWORD_MIN) {
    throw new Error(
      `JD keyword extract returned ${count} terms; need ${JD_KEYWORD_MIN}-${JD_KEYWORD_MAX}.`,
    );
  }

  return capJdKeywords(extracted, JD_KEYWORD_MAX);
}
