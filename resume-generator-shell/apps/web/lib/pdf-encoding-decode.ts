/**
 * Some resume PDFs (custom-encoded fonts / missing ToUnicode) extract as a
 * substitution cipher: "=" is a space, and Latin-1 letters map to ASCII.
 * Detect and decode those runs so Tailor sees real English bullets.
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
  ü: "h",
  Ü: "h",
  Ä: "b",
  Å: "c",
  Ç: "d",
  É: "e",
  Ñ: "f",
  Ö: "g",
  "^": "A",
  _: "B",
  "`": "C",
  a: "D",
  b: "E",
  c: "F",
  d: "G",
  e: "H",
  f: "I",
  i: "L",
  j: "M",
  k: "N",
  l: "O",
  m: "P",
  n: "Q",
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
const CIPHER_CHAR_RE = /[ëáÉçãåêíìîïñòóöäâÄÅÇÑÖÜ~^_`]/;

export function looksLikeEncodedPdfText(text: string): boolean {
  const value = text.trim();
  if (value.length < 12) return false;
  const equals = (value.match(/=/g) ?? []).length;
  const cipher = (value.match(new RegExp(CIPHER_CHAR_RE.source, "g")) ?? []).length;
  if (equals >= 3 && cipher >= 6) return true;
  if (BULLET_LEAD_RE.test(value) && cipher >= 4) return true;
  // Dense cipher without many equals still counts when mostly non-ASCII letters.
  const letters = value.match(/\p{L}/gu) ?? [];
  if (letters.length >= 20) {
    const weird = letters.filter((ch) => CIPHER_CHAR_RE.test(ch) || /[ÄÅÇÉÑÖÜáâãäåçèéêëìíîïñòóôöùúûü]/i.test(ch));
    if (weird.length / letters.length >= 0.45 && equals >= 2) return true;
  }
  return false;
}

export function decodeEncodedPdfText(text: string): string {
  if (!looksLikeEncodedPdfText(text)) return text;

  let value = text.trim();
  const hadBullet = BULLET_LEAD_RE.test(value) || /^[-*•]/.test(value);
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
  return hadBullet ? `• ${decoded}` : decoded;
}

/** Decode cipher lines in a full extracted resume text blob. */
export function decodeEncodedPdfDocument(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return "";
      if (!looksLikeEncodedPdfText(trimmed)) return line;
      return decodeEncodedPdfText(trimmed);
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
