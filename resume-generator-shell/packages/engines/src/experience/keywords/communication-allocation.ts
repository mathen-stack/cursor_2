import { canonicalKeywordKey } from "./keyword-normalizer";

/**
 * Signals that prove a communication/collaboration-focused keyword package
 * still carries stakeholder or cross-functional evidence after allocation.
 *
 * Intentionally matches common allocated verbs (`Aligned`, `Facilitated`) and
 * supporting/outcome phrases (`stakeholder alignment`, `cross-team execution`).
 */
export const COMMUNICATION_ALLOCATION_SIGNAL =
  /collaborat|communicat|stakeholder|requirements gathering|cross-functional|cross-team|align|facilitat|coordinat|partner|workshop|negotiat|product partnership|architecture workshop|shared roadmap|decision log|interface agreement|presented|liaison/i;

export function hasCommunicationAllocationSignal(text: string): boolean {
  return COMMUNICATION_ALLOCATION_SIGNAL.test(text.toLowerCase());
}

/**
 * Distinct collaboration phrases reserved as last-resort supporting keywords
 * when communication-focused packages would otherwise receive only technical
 * methods under document-wide uniqueness locks.
 */
export const COMMUNICATION_SIGNAL_SUPPORTING: readonly string[] = [
  "cross-functional collaboration",
  "stakeholder alignment",
  "stakeholder communication",
  "product partnership",
  "architecture workshops",
  "requirements gathering",
  "cross-team coordination",
  "cross-functional planning",
  "priority negotiation",
  "shared roadmap reviews",
  "dependency coordination",
  "stakeholder updates",
  "interface agreements",
  "decision logs",
  "alignment workshops",
  "partner syncs",
  "delivery coordination",
  "cross-functional delivery priorities",
  "requirements discovery with partners",
  "stakeholder communication loops",
];

export function pickCommunicationSupportingKeyword(
  usedCanonicalKeys: ReadonlySet<string>,
  blockedCanonicalKeys: ReadonlySet<string> = new Set(),
): { keyword: string; canonicalKey: string; controlledReuse: boolean } {
  for (const keyword of COMMUNICATION_SIGNAL_SUPPORTING) {
    const canonicalKey = canonicalKeywordKey(keyword);
    if (
      usedCanonicalKeys.has(canonicalKey) ||
      blockedCanonicalKeys.has(canonicalKey)
    ) {
      continue;
    }
    return { keyword, canonicalKey, controlledReuse: false };
  }

  for (const keyword of COMMUNICATION_SIGNAL_SUPPORTING) {
    const canonicalKey = canonicalKeywordKey(keyword);
    if (blockedCanonicalKeys.has(canonicalKey)) {
      continue;
    }
    return { keyword, canonicalKey, controlledReuse: true };
  }

  const keyword = COMMUNICATION_SIGNAL_SUPPORTING[0]!;
  return {
    keyword,
    canonicalKey: canonicalKeywordKey(keyword),
    controlledReuse: true,
  };
}

export function packageAllocationText(parts: {
  directKeywords?: readonly string[];
  supportingKeywords?: readonly string[];
  outcomeKeywords?: readonly string[];
  actionVerb?: string;
}): string {
  return [
    ...(parts.directKeywords ?? []),
    ...(parts.supportingKeywords ?? []),
    ...(parts.outcomeKeywords ?? []),
    parts.actionVerb ?? "",
  ]
    .join(" ")
    .toLowerCase();
}
