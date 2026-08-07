import { caseFold } from "unicode-case-folding";

/**
 * Canonical text form used by persisted conversation search.
 *
 * NFC makes canonically equivalent input comparable, while full Unicode case
 * folding handles context-sensitive forms and expansions such as ς and ß.
 */
export function normalizeThreadSearchText(value: string): string {
  return caseFold(value.normalize("NFC")).normalize("NFC");
}

export interface ThreadSearchMatchRange {
  readonly start: number;
  readonly end: number;
}

const graphemeSegmenter = new Intl.Segmenter("und", { granularity: "grapheme" });

/** Finds a canonical search match while retaining offsets into the display text. */
export function findThreadSearchMatchRange(
  text: string,
  query: string,
): ThreadSearchMatchRange | null {
  const normalizedQuery = normalizeThreadSearchText(query);
  if (normalizedQuery.length === 0) {
    return null;
  }

  let normalizedText = "";
  const originalStarts: Array<number> = [];
  const originalEnds: Array<number> = [];

  for (const { segment, index } of graphemeSegmenter.segment(text)) {
    const normalizedSegment = normalizeThreadSearchText(segment);
    normalizedText += normalizedSegment;
    for (let offset = 0; offset < normalizedSegment.length; offset += 1) {
      originalStarts.push(index);
      originalEnds.push(index + segment.length);
    }
  }

  const normalizedStart = normalizedText.indexOf(normalizedQuery);
  if (normalizedStart < 0) {
    return null;
  }

  const normalizedEnd = normalizedStart + normalizedQuery.length;
  return {
    start: originalStarts[normalizedStart] ?? text.length,
    end: originalEnds[normalizedEnd - 1] ?? text.length,
  };
}
