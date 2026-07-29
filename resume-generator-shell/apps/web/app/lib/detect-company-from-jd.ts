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
    "about the job",
    "about the role",
    "about the position",
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
  /\b(?:engineer|developer|manager|designer|analyst|architect|scientist|specialist|consultant|lead|director|head|intern|coordinator|tutor|trainer|expert|teacher|writer|editor|reviewer|annotator|researcher)\b/i;

const SECTION_HEADER =
  /^(?:about(?:\s+the)?\s+(?:job|role|position|company|us|opportunity)|company\s+description|job\s+description|responsibilities|requirements|qualifications|benefits|overview|summary|what\s+you(?:'ll| will)\s+do|who\s+you\s+are|the\s+role|the\s+position|position\s+overview|role\s+overview)$/i;

const ROLE_HINT =
  /\b(?:engineer|developer|manager|designer|analyst|architect|scientist|specialist|consultant|lead|director|head|intern|coordinator|officer|programmer|administrator|technician|owner|founder|product\s+owner|scrum\s+master|tutor|trainer|expert|teacher|writer|editor|reviewer|annotator|researcher|freelancer)\b/i;

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

function cleanRoleCandidate(raw: string): string | undefined {
  let value = raw
    .replace(/\s+/g, " ")
    .replace(/^[\s:|\-–—]+/, "")
    .replace(/[\s.|:;,\-–—]+$/g, "")
    .trim();

  // Pull a title out of "As a Senior Software Engineer, you will..."
  const asRole = value.match(/^As an?\s+(.+)$/i);
  if (asRole?.[1]) {
    value = asRole[1].split(",")[0]?.trim() ?? value;
  }

  value = value.replace(/\s+at\s+.+$/i, "").trim();
  // Prefer the more specific right-hand title when present:
  // "Freelance Teaching Expert - AI Tutor" → "AI Tutor"
  const dashed = value.split(/\s*[|\-–—]\s*/).map((part) => part.trim()).filter(Boolean);
  if (dashed.length >= 2) {
    const right = dashed[dashed.length - 1] ?? "";
    const left = dashed[0] ?? "";
    if (ROLE_HINT.test(right) && right.split(/\s+/).length <= 5) {
      value = right;
    } else {
      value = left;
    }
  }
  value = value.split(",")[0]?.trim() ?? value;

  if (value.length < 3 || value.length > 70) return undefined;
  if (SECTION_HEADER.test(value)) return undefined;
  if (FALSE_POSITIVE.has(value.toLocaleLowerCase())) return undefined;
  if (!/[A-Za-z]/.test(value)) return undefined;
  if (looksLikeProseRole(value)) return undefined;

  const words = value.split(/\s+/);
  if (words.length > 8) return undefined;
  return value;
}

function looksLikeProseRole(value: string): boolean {
  if (
    /\b(?:you will|you'?ll|we are|we'?re|will be|part of|responsible for|looking for|join our|cross[- ]functional)\b/i.test(
      value,
    )
  ) {
    return true;
  }
  if (/^(?:as an?|we(?:'re| are)|you(?:'ll| will)|looking for)\b/i.test(value)) {
    return true;
  }
  // Prefer title-like casing; reject long lowercase glue phrases.
  const lowercaseGlue = (value.match(/\b(?:the|and|with|for|from|into|our|your|a|an)\b/gi) ?? [])
    .length;
  return lowercaseGlue >= 3;
}

function nonEmptyLines(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function roleFromEmbeddedPhrase(text: string): string | undefined {
  const patterns: RegExp[] = [
    // "By joining our platform as an AI Tutor, you will..."
    /\bas an?\s+([^,]{3,70}?)\s*,/gi,
    // "looking for / seeking / hiring a Freelance AI Tutor"
    /\b(?:looking for|seeking|hiring|searching for)\s+(?:an?\s+)?([^.]{3,70}?)(?:\s+(?:to|who|with|for)\b|[.!,]|$)/gi,
    // "join us as a Domain Expert" / "join as an AI Trainer"
    /\bjoin(?:ing)?(?:\s+\w+){0,4}\s+as\s+(?:an?\s+)?([^,]{3,70}?)(?:,|\s+to\b|\s+and\b|$)/gi,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const role = cleanRoleCandidate(match[1] ?? "");
      if (role && ROLE_HINT.test(role)) return role;
    }
  }

  // Bare Mindrift-style titles that appear mid-copy.
  const bareAiRole = text.match(
    /\b((?:Freelance\s+)?(?:AI|STEM)\s+(?:Tutor|Trainer|Expert|Specialist|Teacher|Writer|Editor))\b/i,
  );
  if (bareAiRole?.[1]) {
    const role = cleanRoleCandidate(bareAiRole[1]);
    if (role) return role;
  }

  return undefined;
}

/**
 * Best-effort target role detection from JD text for UI labeling.
 * Skips section headers and prose like "As a Senior Engineer, you will...".
 */
export function detectRoleFromJd(text: string): string | undefined {
  const cleaned = text.replace(/\r\n/g, "\n").trim();
  if (!cleaned) return undefined;

  const labeled = cleaned.match(
    /(?:^|\n)\s*(?:job\s*title|position\s+title|role\s+title|title)\s*:\s*(.+)$/im,
  );
  if (labeled?.[1]) {
    const role = cleanRoleCandidate(labeled[1]);
    if (role) return role;
  }

  for (const line of nonEmptyLines(cleaned).slice(0, 16)) {
    if (SECTION_HEADER.test(line)) continue;
    if (/^(?:company|employer|organization|organisation)\s*[:\-–—]/i.test(line)) {
      continue;
    }
    // Skip JD section intros like "Position – how you'll contribute".
    if (/^(?:position|project|expectations|additional|requirements?)\s*[–—\-]/i.test(line)) {
      continue;
    }
    // Skip company-marketing openers that are not titles.
    if (/^At\s+[A-Z]/i.test(line) && /[,.]/.test(line)) {
      continue;
    }

    // "As a Senior Software Engineer, you will be part of a cross..."
    const asMatch = line.match(/^As an?\s+([^,]{3,70}),/i);
    if (asMatch?.[1]) {
      const role = cleanRoleCandidate(asMatch[1]);
      if (role && ROLE_HINT.test(role)) return role;
    }

    const atSplit = line.match(
      /^(.+?)\s+at\s+[A-Z][A-Za-z0-9&.,'"’\-\s]{1,60}$/,
    );
    if (atSplit?.[1]) {
      const role = cleanRoleCandidate(atSplit[1]);
      if (role && ROLE_HINT.test(role)) return role;
    }

    // Prefer short title lines over sentences.
    if (/[.!?]$/.test(line) || /\b(?:you will|will be|we are|looking for|joining)\b/i.test(line)) {
      continue;
    }

    const role = cleanRoleCandidate(line);
    if (!role) continue;
    if (ROLE_HINT.test(role) || /^(?:senior|staff|principal|lead|junior|mid[- ]level|freelance)\b/i.test(role)) {
      return role;
    }
  }

  return roleFromEmbeddedPhrase(cleaned);
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

  // "At Mindrift, innovation meets opportunity..."
  const atCompany = cleaned.match(
    /(?:^|\n)\s*At\s+([A-Z][A-Za-z0-9&.,'"’\-]{1,40}(?:\s+[A-Z][A-Za-z0-9&.,'"’\-]{1,30}){0,3})\s*[,]/m,
  );
  if (atCompany?.[1]) {
    const name = cleanCompanyCandidate(atCompany[1]);
    if (name) return name;
  }

  // "the Mindrift platform connects..."
  const platformCompany = cleaned.match(
    /\bthe\s+([A-Z][A-Za-z0-9&]{1,40})\s+platform\b/m,
  );
  if (platformCompany?.[1]) {
    const name = cleanCompanyCandidate(platformCompany[1]);
    if (name) return name;
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

  const firstUsefulLine =
    nonEmptyLines(cleaned).find((line) => !SECTION_HEADER.test(line)) ?? "";

  const atMatch = firstUsefulLine.match(
    /\bat\s+([A-Z][A-Za-z0-9&.,'"’\-\s]{1,60}?)(?:\s*[|\-–—]|$)/,
  );
  if (atMatch?.[1]) {
    const name = cleanCompanyCandidate(atMatch[1]);
    if (name) return name;
  }

  const separatorParts = firstUsefulLine
    .split(/\s*[|\-–—]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (separatorParts.length >= 2) {
    const last = separatorParts[separatorParts.length - 1];
    // Don't treat the right-hand title fragment as a company
    // ("Freelance Expert - AI Tutor").
    if (last && !ROLE_NOISE.test(last)) {
      const name = cleanCompanyCandidate(last);
      if (name) return name;
    }
  }

  return undefined;
}

export function formatJdResultHeadline(
  text: string,
  fallbackIndex: number,
): { role: string; company: string; headline: string } {
  const role = detectRoleFromJd(text) ?? `Job ${fallbackIndex}`;
  const company = detectCompanyNameFromJd(text) ?? "undefined";
  const headline = `${role} | ${company}`;
  return { role, company, headline };
}

/** True when the UI fell back to a generic Job N placeholder. */
export function isFallbackJobRole(role: string): boolean {
  return /^Job\s+\d+$/i.test(role.trim());
}
