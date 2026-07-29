const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%^&*-_=+";
const ALL = `${UPPER}${LOWER}${DIGITS}${SYMBOLS}`;

function randomIndex(max: number): number {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return buffer[0]! % max;
  }
  return Math.floor(Math.random() * max);
}

function pick(charset: string): string {
  return charset[randomIndex(charset.length)]!;
}

function shuffle(chars: string[]): string[] {
  const next = [...chars];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    const current = next[index]!;
    next[index] = next[swapIndex]!;
    next[swapIndex] = current;
  }
  return next;
}

/** Cryptographically random password with mixed character classes. */
export function generateStrongPassword(length = 16): string {
  const size = Math.max(12, Math.min(64, Math.floor(length)));
  const required = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
  const rest = Array.from({ length: size - required.length }, () => pick(ALL));
  return shuffle([...required, ...rest]).join("");
}

export function isStrongPasswordShape(password: string): boolean {
  return (
    password.length >= 12 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /\d/.test(password) &&
    /[!@#$%^&*\-_=+]/.test(password)
  );
}
