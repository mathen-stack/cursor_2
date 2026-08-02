/**
 * Some resume PDFs (custom-encoded fonts / missing ToUnicode) extract as a
 * substitution cipher: "=" is a space, and Latin-1 letters map to ASCII.
 * Detect and decode those runs so Tailor sees real English text.
 */

const ENCODING_MAP: Record<string, string> = {
  "~": "a",
  á: "i",
  ä: "l",
  â: "k",
  ã: "m",
  å: "n",
  ç: "o",
  é: "p",
  ê: "r",
  ë: "s",
  í: "t",
  ì: "u",
  î: "v",
  ï: "w",
  ñ: "x",
  ò: "z",
  ó: "y",
  ö: "@",
  à: "j",
  è: "q",
  ü: "h",
  Ü: "h",
  Ä: "b",
  Å: "c",
  Á: "c",
  Ç: "d",
  É: "e",
  Ñ: "f",
  Ö: "g",
  "^": "A",
  _: "B",
  "`": "C",
  "@": "#",
  a: "D",
  b: "E",
  c: "F",
  d: "G",
  e: "H",
  f: "I",
  h: "K",
  i: "L",
  j: "M",
  k: "N",
  l: "O",
  m: "P",
  n: "Q",
  o: "R",
  p: "S",
  q: "T",
  s: "V",
  t: "W",
  w: "Z",
  J: "-",
  I: ",",
  H: "+",
  E: "(",
  F: ")",
  K: ".",
  B: "%",
  X: ";",
  "[": ">",
  N: "1",
  O: "0",
  P: "4",
  R: "5",
  T: "5",
  V: "9",
  U: "8",
  L: "/",
};

const BULLET_LEAD_RE = /^(?:J\s*=\s*)?(?:[•●▪◦\uF0B7\uF0A7]|ð\s*[•·])\s*=?\s*/u;
const CIPHER_CHAR_RE = /[ëáÉçãåêíìîïñòóöäâàèÄÅÁÇÑÖÜ~^_`]/;
const SPACED_LETTERS_RE = /^(?:\S ){5,}\S(?:[.!?])?$/;

export function looksLikeEncodedPdfText(text: string): boolean {
  const value = text.trim();
  if (value.length < 3) return false;
  const compact = value.replace(/\s+/g, "");
  const equals = (compact.match(/=/g) ?? []).length;
  const cipher = (compact.match(new RegExp(CIPHER_CHAR_RE.source, "g")) ?? []).length;
  if (equals >= 2 && cipher >= 5) return true;
  if (BULLET_LEAD_RE.test(value) && cipher >= 4) return true;
  // Short tech tokens like "Öom`" (gRPC) / "oÉ~Åí" (React) — keep tight to
  // avoid rewriting normal accented words like "café".
  if (
    compact.length <= 12 &&
    ((cipher >= 2 && /[`^~_]/.test(compact)) ||
      (cipher >= 2 && equals >= 1) ||
      (cipher >= 1 && /[`^_]/.test(compact) && /[ÖÄÅÁÇÉÑÜ]/.test(compact)))
  ) {
    return true;
  }
  const letters = compact.match(/\p{L}/gu) ?? [];
  if (letters.length >= 3) {
    const weird = letters.filter((ch) => CIPHER_CHAR_RE.test(ch));
    const ratio = weird.length / letters.length;
    // Short tokens like "oÉ~Åí" (React) and long bullets both qualify.
    if (ratio >= 0.5 && cipher >= 2) return true;
    if (letters.length >= 12 && ratio >= 0.4 && (equals >= 1 || cipher >= 8)) return true;
  }
  return false;
}

/** True when text still looks like undecoded / broken cipher after cleanup. */
export function isCorruptEncodedText(text: string): boolean {
  const value = text.replace(/\s+/g, " ").trim();
  if (!value) return false;
  if (looksLikeEncodedPdfText(value)) return true;
  if (SPACED_LETTERS_RE.test(value)) return true;
  const letters = value.match(/\p{L}/gu) ?? [];
  if (letters.length >= 8) {
    const weird = letters.filter((ch) => CIPHER_CHAR_RE.test(ch) || /[ÄÅÁÇÉÑÖÜáâãäåçèéêëìíîïñòóôöùúûü]/i.test(ch));
    if (weird.length / letters.length >= 0.35) return true;
  }
  // Patterns like "DekmLesed-re-l-time" from half-decoded cipher
  if (/=/.test(value) && CIPHER_CHAR_RE.test(value)) return true;
  return false;
}

function prepareCipherInput(text: string): string {
  let value = text.trim();
  // PDF reconstruction sometimes inserts spaces between cipher glyphs.
  // Compact them so "=" remains the only word separator.
  if (looksLikeEncodedPdfText(value)) {
    value = value.replace(/\s+/g, "");
  }
  return value;
}

export function decodeEncodedPdfText(text: string): string {
  if (!looksLikeEncodedPdfText(text)) return text;

  let value = prepareCipherInput(text);
  const hadBullet = BULLET_LEAD_RE.test(text.trim()) || /^[-*•]/.test(text.trim());
  value = value.replace(BULLET_LEAD_RE, "");

  const decoded = [...value]
    .map((ch) => {
      if (ch === "=") return " ";
      return ENCODING_MAP[ch] ?? ch;
    })
    .join("")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();

  if (!decoded) return text;
  // If decode still looks corrupt, return empty so callers can fall back.
  if (isCorruptEncodedText(decoded)) return hadBullet ? "" : "";
  return hadBullet ? `• ${decoded}` : decoded;
}

/**
 * Decode/clean a resume field (role, company, bullet, etc.).
 * Returns fallback when the value is irrecoverably corrupted.
 */
export function sanitizeEncodedField(text: string, fallback = ""): string {
  const raw = text?.replace(/\s+/g, " ").trim() ?? "";
  if (!raw) return fallback;
  if (!looksLikeEncodedPdfText(raw) && !isCorruptEncodedText(raw)) return raw;
  const decoded = decodeEncodedPdfText(raw)
    .replace(/^•\s*/, "")
    .trim();
  if (!decoded || isCorruptEncodedText(decoded)) return fallback;
  // Equals-heavy noise that decodes to a single gibberish token.
  const equals = (raw.match(/=/g) ?? []).length;
  if (equals >= 3 && decoded.length < 16 && !/\s/.test(decoded)) return fallback;
  return decoded;
}

/** Decode cipher lines in a full extracted resume text blob. */
export function decodeEncodedPdfDocument(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return "";
      if (!looksLikeEncodedPdfText(trimmed) && !isCorruptEncodedText(trimmed)) return line;
      const decoded = decodeEncodedPdfText(trimmed);
      return decoded || "";
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
