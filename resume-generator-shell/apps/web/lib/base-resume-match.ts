import type {
  BaseResumeMatchResult,
  BaseResumeRecord,
} from "@resume/contracts";

const TOKEN_RE = /[a-z0-9][a-z0-9.+#/-]{1,}/gi;

function tokenize(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const match of text.toLowerCase().match(TOKEN_RE) ?? []) {
    if (match.length < 2) continue;
    tokens.add(match);
  }
  return tokens;
}

function overlapScore(left: Set<string>, right: readonly string[]): {
  score: number;
  matched: string[];
} {
  const matched: string[] = [];
  for (const item of right) {
    const parts = item.toLowerCase().split(/[^a-z0-9.+#/-]+/).filter(Boolean);
    if (parts.some((part) => left.has(part)) || left.has(item.toLowerCase())) {
      matched.push(item);
    }
  }
  return { score: matched.length, matched: [...new Set(matched)] };
}

/**
 * Rank uploaded base resumes against a JD by stack/role/skill overlap.
 * Deterministic — no LLM call.
 */
export function matchBaseResumesToJd(
  jobDescriptionText: string,
  records: readonly BaseResumeRecord[],
): BaseResumeMatchResult[] {
  const jdTokens = tokenize(jobDescriptionText);
  if (jdTokens.size === 0 || records.length === 0) return [];

  const ranked = records.map((record) => {
    const stacks = record.extracted.stacks.length
      ? record.extracted.stacks
      : record.extracted.skills;
    const roles = record.extracted.experiences
      .map((entry) => entry.role?.trim() || "")
      .filter(Boolean);
    const bulletText = record.extracted.experiences
      .flatMap((entry) => entry.bullets)
      .join(" ");
    const bulletTokens = tokenize(bulletText);

    const stackHit = overlapScore(jdTokens, stacks);
    const roleHit = overlapScore(jdTokens, roles);
    let skillHits = 0;
    for (const token of stacks) {
      const key = token.toLowerCase();
      if (jdTokens.has(key) || [...jdTokens].some((jd) => key.includes(jd) || jd.includes(key))) {
        skillHits += 1;
      }
    }
    let bulletHits = 0;
    for (const token of jdTokens) {
      if (bulletTokens.has(token)) bulletHits += 1;
    }

    const score =
      stackHit.score * 4 +
      roleHit.score * 3 +
      Math.min(skillHits, 12) * 1.5 +
      Math.min(bulletHits, 40) * 0.15 +
      (record.isFavorite ? 1.5 : 0);

    const reasons: string[] = [];
    if (stackHit.matched.length) {
      reasons.push(`Stack overlap: ${stackHit.matched.slice(0, 6).join(", ")}`);
    }
    if (roleHit.matched.length) {
      reasons.push(`Role overlap: ${roleHit.matched.slice(0, 4).join(", ")}`);
    }
    if (record.isFavorite) reasons.push("Marked as favorite");
    if (reasons.length === 0) reasons.push("Weak lexical overlap with JD");

    return {
      baseResumeId: record.id,
      title: record.title,
      score: Math.round(score * 10) / 10,
      matchedStacks: stackHit.matched.slice(0, 10),
      matchedRoles: roleHit.matched.slice(0, 6),
      reasons,
    } satisfies BaseResumeMatchResult;
  });

  return ranked.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return left.title.localeCompare(right.title);
  });
}

export function pickBestBaseResumeMatch(
  matches: readonly BaseResumeMatchResult[],
): BaseResumeMatchResult | null {
  return matches[0] ?? null;
}
