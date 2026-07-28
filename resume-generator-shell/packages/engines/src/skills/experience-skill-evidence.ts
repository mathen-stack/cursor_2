import { SKILL_DEFINITIONS } from "./skill-taxonomy";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function aliasMatchesKeyword(alias: string, keyword: string, caseSensitive: boolean): boolean {
  const aliasText = caseSensitive ? alias : alias.toLocaleLowerCase();
  const keywordText = caseSensitive ? keyword : keyword.toLocaleLowerCase();
  if (aliasText === keywordText) {
    return true;
  }
  // Require word-boundary containment so short aliases (Go, R, CSS) do not
  // falsely match unrelated phrases.
  const pattern = new RegExp(
    `(?:^|[^A-Za-z0-9])${escapeRegExp(aliasText)}(?=[^A-Za-z0-9]|$)`,
    caseSensitive ? undefined : "i",
  );
  return pattern.test(keywordText);
}

/**
 * Map experience bullet keywords onto catalog skill keys. Only JD-catalog skills
 * are returned — this never invents technologies outside the taxonomy.
 */
export function matchSkillKeysFromExperienceKeywords(
  keywords: readonly string[],
): Set<string> {
  const matched = new Set<string>();
  for (const raw of keywords) {
    const keyword = raw.replace(/\s+/g, " ").trim();
    if (!keyword || keyword.length < 2) {
      continue;
    }
    for (const definition of SKILL_DEFINITIONS) {
      if (
        definition.aliases.some((alias) =>
          aliasMatchesKeyword(alias, keyword, definition.caseSensitive ?? false),
        )
      ) {
        matched.add(definition.key);
      }
    }
  }
  return matched;
}

export function collectExperienceKeywordHints(input: {
  experiences: ReadonlyArray<{
    bullets: ReadonlyArray<{
      directKeywords: readonly string[];
      supportingKeywords: readonly string[];
      finalBullet: string;
    }>;
  }>;
}): string[] {
  const hints: string[] = [];
  const seen = new Set<string>();
  for (const experience of input.experiences) {
    for (const bullet of experience.bullets) {
      for (const keyword of [
        ...bullet.directKeywords,
        ...bullet.supportingKeywords,
      ]) {
        const cleaned = keyword.replace(/\s+/g, " ").trim();
        const key = cleaned.toLocaleLowerCase();
        if (!cleaned || seen.has(key)) {
          continue;
        }
        seen.add(key);
        hints.push(cleaned);
      }
    }
  }
  return hints;
}
