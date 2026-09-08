/** Split pasted job links, joining a URL that was hard-wrapped across lines. */
export function parseJobUrls(raw: string): string[] {
  const parts = raw
    .split(/\s+/g)
    .map((part) => part.trim())
    .filter(Boolean);

  const urls: string[] = [];
  let current = "";

  for (const part of parts) {
    const token = part.replace(/^[<("'[]+|[>)"'\]]+$/g, "");
    if (/^https?:\/\//i.test(token)) {
      if (current) urls.push(current);
      current = token;
    } else if (current) {
      current += token;
    }
  }
  if (current) urls.push(current);

  return urls.filter((url) => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  });
}
