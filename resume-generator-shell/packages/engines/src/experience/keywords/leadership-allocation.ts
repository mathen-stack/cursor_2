import { canonicalKeywordKey } from "./keyword-normalizer";

/**
 * Signals that prove a leadership-focused keyword package still carries
 * ownership, mentoring, or strategic direction evidence after allocation.
 */
export const LEADERSHIP_ALLOCATION_SIGNAL =
  /lead|spearhead|direct|champion|guide|mentor|strategy|roadmap|governance|engineering standard|architecture|design authority|technical direction|ownership/i;

export function hasLeadershipAllocationSignal(text: string): boolean {
  return LEADERSHIP_ALLOCATION_SIGNAL.test(text.toLowerCase());
}

/**
 * Distinct leadership phrases reserved as last-resort supporting keywords when
 * leadership-focused packages would otherwise receive only technical methods
 * under document-wide uniqueness locks.
 */
export const LEADERSHIP_SIGNAL_SUPPORTING: readonly string[] = [
  "technical strategy",
  "roadmap planning",
  "architecture governance",
  "engineering standards",
  "design authority reviews",
  "technical direction",
  "execution planning",
  "technical risk management",
  "ownership models",
  "mentoring frameworks",
  "leadership forums",
  "architecture decision reviews",
  "engineering roadmap alignment",
  "strategic delivery planning",
  "technical ownership models",
  "design governance reviews",
  "leadership operating cadence",
  "cross-team technical direction",
  "roadmap execution planning",
  "architecture standards adoption",
];

export function pickLeadershipSupportingKeyword(
  usedCanonicalKeys: ReadonlySet<string>,
  blockedCanonicalKeys: ReadonlySet<string> = new Set(),
): { keyword: string; canonicalKey: string; controlledReuse: boolean } {
  for (const keyword of LEADERSHIP_SIGNAL_SUPPORTING) {
    const canonicalKey = canonicalKeywordKey(keyword);
    if (
      usedCanonicalKeys.has(canonicalKey) ||
      blockedCanonicalKeys.has(canonicalKey)
    ) {
      continue;
    }
    return { keyword, canonicalKey, controlledReuse: false };
  }

  for (const keyword of LEADERSHIP_SIGNAL_SUPPORTING) {
    const canonicalKey = canonicalKeywordKey(keyword);
    if (blockedCanonicalKeys.has(canonicalKey)) {
      continue;
    }
    return { keyword, canonicalKey, controlledReuse: true };
  }

  const keyword = LEADERSHIP_SIGNAL_SUPPORTING[0]!;
  return {
    keyword,
    canonicalKey: canonicalKeywordKey(keyword),
    controlledReuse: true,
  };
}
