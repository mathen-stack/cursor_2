/**
 * Communication allocation signal stems.
 *
 * Kept in sync with the keyword-allocation validator. Includes taxonomy stems
 * already used for communication-focused plans (e.g. "Aligned", "cross-team
 * execution", "product partnership") so uniqueness exhaustion cannot create
 * false negatives against the same inventories that feed allocation.
 */
export const COMMUNICATION_ALLOCATION_SIGNAL =
  /collaborat|communicat|stakeholder|requirements gathering|cross-functional|cross-team|\balign|facilitat|coordinat|product partnership|architecture workshop|partner(?:ship)?|negotiat|workshop|briefing/;

export function hasCommunicationAllocationSignal(text: string): boolean {
  return COMMUNICATION_ALLOCATION_SIGNAL.test(text.toLocaleLowerCase());
}

export const LEADERSHIP_ALLOCATION_SIGNAL =
  /lead|spearhead|direct|champion|guide|mentor|strategy|roadmap|governance|engineering standard|architecture/;

export function hasLeadershipAllocationSignal(text: string): boolean {
  return LEADERSHIP_ALLOCATION_SIGNAL.test(text.toLocaleLowerCase());
}
