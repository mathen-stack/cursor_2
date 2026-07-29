const FALSE_POSITIVE = new Set(
  [
    "remote",
    "hybrid",
    "onsite",
    "on-site",
    "worldwide",
    "united states",
    "full time",
    "full-time",
    "part time",
    "part-time",
    "contract",
    "internship",
    "the company",
    "our company",
    "the team",
    "our team",
    "the role",
    "this role",
    "job description",
    "company description",
    "about us",
    "about the company",
    "engineer",
    "engineering",
    "software",
    "developer",
    "manager",
    "senior",
    "junior",
    "staff",
    "principal",
  ].map((value) => value.toLocaleLowerCase()),
);

const ROLE_NOISE =
  /\b(?:engineer|developer|manager|designer|analyst|architect|scientist|specialist|consultant|lead|director|head|intern|coordinator)\b/i;

function cleanCompanyCandidate(raw: string): string | undefined {
  let value = raw
    .replace(/\s+/g, " ")
    .replace(/^[\s:|\-–—]+/, "")
    .replace(/[\s.|:;,\-–—]+$/g, "")
    .trim();

  // Keep only the first clause when a sentence bleeds into marketing copy.
  value = value.split(/(?<=\w)\.\s+/)[0]?.trim() ?? value;
  value = value.split(/,?\s+(?:and|where|that|which|with|for)\s+/i)[0]?.trim() ?? value;

  if (value.length < 2 || value.length > 80) return undefined;
  if (FALSE_POSITIVE.has(value.toLocaleLowerCase())) return undefined;
  if (ROLE_NOISE.test(value) && !/\b(?:inc|llc|ltd|corp|company|labs|technologies|systems)\b/i.test(value)) {
    return undefined;
  }
  // Prefer proper-looking names (start with a letter/digit, mostly title-ish).
  if (!/^[A-Za-z0-9]/.test(value)) return undefined;
  if (!/[A-Za-z]/.test(value)) return undefined;
  return value;
}

/**
 * Best-effort hiring-company detection from JD text.
 * Used for UI labeling only — resume career companies still come from profile.
 */
export function detectCompanyNameFromJd(text: string): string | undefined {
  const cleaned = text.replace(/\r\n/g, "\n").trim();
  if (!cleaned) return undefined;

  const labeled = cleaned.match(
    /(?:^|\n)\s*(?:company(?:\s+name)?|employer|organization|organisation|hiring\s+company)\s*[:\-–—]\s*(.+)$/im,
  );
  if (labeled?.[1]) {
    const name = cleanCompanyCandidate(labeled[1]);
    if (name) return name;
  }

  const companyDescription = cleaned.match(
    /(?:^|\n)\s*company\s+description\s*\n+\s*([A-Z][A-Za-z0-9&.,'"’\-\s]{1,70}?)\s+(?:is|are|develops|builds|provides|creates|helps|makes|offers|designs|delivers|works|specializes)\b/im,
  );
  if (companyDescription?.[1]) {
    const name = cleanCompanyCandidate(companyDescription[1]);
    if (name) return name;
  }

  const aboutCompany = cleaned.match(
    /(?:^|\n)\s*about\s+([A-Z][A-Za-z0-9&.,'"’\-\s]{1,60}?)\s*\n/m,
  );
  if (aboutCompany?.[1]) {
    const name = cleanCompanyCandidate(aboutCompany[1]);
    if (name && !/^the\s+(?:role|job|position|opportunity)\b/i.test(name)) {
      return name;
    }
  }

  const joinMatch = cleaned.match(
    /\b(?:join|joining)\s+([A-Z][A-Za-z0-9&.,'"’\-\s]{1,60}?)(?:\s*[,.!|]|\s+(?:as|and|to|in|on|where|today)\b)/m,
  );
  if (joinMatch?.[1]) {
    const name = cleanCompanyCandidate(joinMatch[1]);
    if (name) return name;
  }

  const hiringMatch = cleaned.match(
    /\b([A-Z][A-Za-z0-9&.,'"’\-]{1,40}(?:\s+[A-Z][A-Za-z0-9&.,'"’\-]{1,30}){0,3})\s+is\s+(?:hiring|looking|seeking|searching)\b/m,
  );
  if (hiringMatch?.[1]) {
    const name = cleanCompanyCandidate(hiringMatch[1]);
    if (name) return name;
  }

  const firstLine =
    cleaned
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean) ?? "";

  const atMatch = firstLine.match(
    /\bat\s+([A-Z][A-Za-z0-9&.,'"’\-\s]{1,60}?)(?:\s*[|\-–—]|$)/,
  );
  if (atMatch?.[1]) {
    const name = cleanCompanyCandidate(atMatch[1]);
    if (name) return name;
  }

  const separatorParts = firstLine
    .split(/\s*[|\-–—]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (separatorParts.length >= 2) {
    const last = separatorParts[separatorParts.length - 1];
    const name = cleanCompanyCandidate(last ?? "");
    if (name && !ROLE_NOISE.test(name)) return name;
  }

  return undefined;
}
