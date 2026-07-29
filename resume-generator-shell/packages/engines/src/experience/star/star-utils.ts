export function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function deterministicNumber(
  seed: string,
  minimum: number,
  maximum: number,
  decimals = 0,
): number {
  const normalized = stableHash(seed) / 0xffffffff;
  const raw = minimum + normalized * (maximum - minimum);
  const factor = 10 ** decimals;
  return Math.round(raw * factor) / factor;
}

export function includesCaseInsensitive(haystack: string, needle: string): boolean {
  return haystack.toLocaleLowerCase().includes(needle.toLocaleLowerCase());
}

export function joinNatural(items: readonly string[]): string {
  const cleaned = items.map((item) => item.trim()).filter(Boolean);
  if (cleaned.length === 0) {
    return "";
  }
  if (cleaned.length === 1) {
    return cleaned[0] ?? "";
  }
  if (cleaned.length === 2) {
    return `${cleaned[0]} and ${cleaned[1]}`;
  }
  return `${cleaned.slice(0, -1).join(", ")}, and ${cleaned.at(-1)}`;
}

export function lowerFirst(value: string): string {
  return value.length === 0 ? value : `${value.charAt(0).toLowerCase()}${value.slice(1)}`;
}

export function sentence(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim().replace(/[.;:,]+$/, "");
  if (!normalized) {
    return "";
  }
  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}.`;
}
