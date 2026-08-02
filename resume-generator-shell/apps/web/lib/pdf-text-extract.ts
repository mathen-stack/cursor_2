import {
  extractText,
  extractTextItems,
  getDocumentProxy,
  type StructuredTextItem,
} from "unpdf";

type TextRun = {
  str: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  hasEOL: boolean;
};

const BULLET_CHAR_RE =
  /^[\u2022\u2023\u2043\u25E6\u25AA\u25CF\u25CB\u2219\u00B7\uF0B7\uF0A7\uF06C\uF0D8•●○▪◦–—-]$/;

/**
 * Reconstruct reading-order text from PDF.js text items using geometry.
 * Much closer to the on-page layout than concatenating raw strings.
 */
export function reconstructTextFromPdfItems(
  pages: readonly (readonly StructuredTextItem[])[],
): string {
  const pageTexts: string[] = [];
  for (const pageItems of pages) {
    const pageText = reconstructPageText(pageItems);
    if (pageText) pageTexts.push(pageText);
  }
  return pageTexts.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

function reconstructPageText(pageItems: readonly StructuredTextItem[]): string {
  const runs = pageItems
    .map((item) => normalizeRun(item))
    .filter((item): item is TextRun => Boolean(item));
  if (runs.length === 0) return "";

  // Detect simple two-column resumes and read left column then right.
  const columns = splitColumns(runs);
  if (columns.length > 1) {
    return columns
      .map((columnRuns) => linesFromRuns(columnRuns).join("\n"))
      .filter(Boolean)
      .join("\n\n");
  }

  return linesFromRuns(runs).join("\n");
}

function normalizeRun(item: StructuredTextItem): TextRun | null {
  const raw = item.str ?? "";
  // Keep empty EOL markers only as line-break signals via geometry/hasEOL.
  if (!raw && !item.hasEOL) return null;

  let str = raw
    .replace(/\u0000/g, "")
    // Common PDF bullet private-use / ZapfDingbats leakage → plain bullet.
    .replace(/[\uF0B7\uF0A7\uF06C\uF0D8\u25CF\u25AA\u2219]/g, "•")
    .replace(/^(?:ð\s*[•·]|ï¿½|Â·)\s*/u, "• ");

  if (BULLET_CHAR_RE.test(str.trim()) && str.trim().length <= 2) {
    str = "•";
  }

  return {
    str,
    x: item.x,
    y: item.y,
    width: item.width,
    fontSize: item.fontSize || Math.max(item.height, 8),
    hasEOL: Boolean(item.hasEOL),
  };
}

function splitColumns(runs: readonly TextRun[]): TextRun[][] {
  const meaningful = runs.filter((run) => run.str.trim().length > 0);
  if (meaningful.length < 12) return [runs as TextRun[]];

  const xs = meaningful.map((run) => run.x).sort((a, b) => a - b);
  const minX = xs[0] ?? 0;
  const maxX = xs[xs.length - 1] ?? 0;
  if (maxX - minX < 220) return [runs as TextRun[]];

  // Find the largest gap in starting x positions → likely column gutter.
  let bestGap = 0;
  let splitAt = -1;
  for (let index = 1; index < xs.length; index += 1) {
    const gap = (xs[index] ?? 0) - (xs[index - 1] ?? 0);
    if (gap > bestGap) {
      bestGap = gap;
      splitAt = (xs[index - 1] ?? 0) + gap / 2;
    }
  }

  // Need a clear gutter and both sides populated.
  if (bestGap < 48 || splitAt < 0) return [runs as TextRun[]];
  const left = meaningful.filter((run) => run.x < splitAt);
  const right = meaningful.filter((run) => run.x >= splitAt);
  if (left.length < 4 || right.length < 4) return [runs as TextRun[]];

  // Avoid splitting single-column pages with indented bullets.
  const leftShare = left.length / meaningful.length;
  if (leftShare < 0.25 || leftShare > 0.75) return [runs as TextRun[]];

  return [left, right];
}

function linesFromRuns(runs: readonly TextRun[]): string[] {
  const sorted = [...runs].sort((a, b) => {
    // PDF y grows upward; reading order is top → bottom.
    if (Math.abs(a.y - b.y) > Math.max(2, Math.min(a.fontSize, b.fontSize) * 0.35)) {
      return b.y - a.y;
    }
    return a.x - b.x;
  });

  const lines: TextRun[][] = [];
  for (const run of sorted) {
    const current = lines[lines.length - 1];
    if (!current || current.length === 0) {
      lines.push([run]);
      continue;
    }
    const anchor = current[0]!;
    const tolerance = Math.max(2.2, Math.min(anchor.fontSize, run.fontSize) * 0.4);
    if (Math.abs(anchor.y - run.y) <= tolerance) {
      current.push(run);
    } else {
      lines.push([run]);
    }
  }

  const textLines: string[] = [];
  let previousY: number | null = null;
  let previousFont = 11;

  for (const lineRuns of lines) {
    const ordered = [...lineRuns].sort((a, b) => a.x - b.x);
    const lineText = joinRunsOnLine(ordered);
    if (!lineText) continue;

    const y = ordered[0]?.y ?? 0;
    const fontSize = ordered[0]?.fontSize || previousFont;
    if (
      previousY !== null &&
      previousY - y > Math.max(fontSize, previousFont) * 1.85 &&
      textLines.length > 0 &&
      textLines[textLines.length - 1] !== ""
    ) {
      textLines.push("");
    }
    textLines.push(lineText);
    previousY = y;
    previousFont = fontSize;
  }

  return textLines;
}

function joinRunsOnLine(runs: readonly TextRun[]): string {
  let out = "";
  let previous: TextRun | null = null;

  for (const run of runs) {
    const piece = run.str;
    if (!piece) continue;

    if (!previous) {
      out = piece;
      previous = run;
      continue;
    }

    const gap = run.x - (previous.x + Math.max(previous.width, 0));
    const needsSpace =
      gap > Math.max(1.2, previous.fontSize * 0.18) &&
      !/\s$/.test(out) &&
      !/^\s/.test(piece);

    // Bullet glyph sitting left of the text → "- text"
    if (BULLET_CHAR_RE.test(out.trim()) && out.trim().length <= 2) {
      out = `• ${piece.replace(/^\s+/, "")}`;
    } else if (needsSpace) {
      out = `${out} ${piece.replace(/^\s+/, "")}`;
    } else {
      out = `${out}${piece}`;
    }
    previous = run;
  }

  return out.replace(/[ \t]+/g, " ").trim();
}

/**
 * Exact-as-possible text extraction for resume PDFs.
 * Uses positioned text items; falls back to unpdf extractText.
 */
export async function extractExactPdfText(bytes: Uint8Array): Promise<string> {
  // PDF.js may detach the underlying ArrayBuffer — always copy first.
  const data = bytes.slice();
  const pdf = await getDocumentProxy(data);
  try {
    const { items } = await extractTextItems(pdf);
    const reconstructed = reconstructTextFromPdfItems(items);
    if (reconstructed.replace(/\s+/g, " ").trim().length >= 40) {
      return reconstructed;
    }
  } catch {
    // Fall through to simpler extractor.
  }

  const fallback = await extractText(pdf, { mergePages: true });
  return String(fallback.text || "").trim();
}
