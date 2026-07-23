// composerFileMentions.ts — the chip model for `@`-file scoping in the Work composer. A picked repo
// file lands in the draft as a compact token (`@WorkSurface.tsx`), tracked as { path, token } beside
// the draft text. The token is painted as a chip over the textarea (ComposerMentionBackdrop), deletes
// as one unit, and expands to the exact repo-relative path only at send — the coding agent still reads
// a literal path; the founder reads a short name. Pure string logic so it tests without a DOM.

export type ComposerFileMention = { path: string; token: string };

export type FileMentionSpan = { start: number; end: number; path: string; token: string };

const boundedBefore = (text: string, index: number) => index === 0 || /\s/.test(text[index - 1]);
const boundedAfter = (text: string, index: number) => index >= text.length || /\s/.test(text[index]);

// The shortest unique tail of the path: `@WorkSurface.tsx`, widened one directory at a time only when
// another tracked file already owns that name.
export function fileMentionTokenFor(path: string, mentions: ComposerFileMention[]): string {
  const existing = mentions.find((mention) => mention.path === path);
  if (existing) return existing.token;
  const parts = path.split("/").filter(Boolean);
  for (let depth = 1; depth <= parts.length; depth += 1) {
    const token = `@${parts.slice(-depth).join("/")}`;
    if (!mentions.some((mention) => mention.token === token && mention.path !== path)) return token;
  }
  return `@${path}`;
}

// Every whitespace-bounded occurrence of a tracked token, in draft order. A token edited from the
// inside stops matching and honestly falls back to plain text.
export function fileMentionSpans(draft: string, mentions: ComposerFileMention[]): FileMentionSpan[] {
  const spans: FileMentionSpan[] = [];
  for (const mention of mentions) {
    let from = 0;
    while (from <= draft.length) {
      const start = draft.indexOf(mention.token, from);
      if (start < 0) break;
      const end = start + mention.token.length;
      if (boundedBefore(draft, start) && boundedAfter(draft, end)) spans.push({ start, end, ...mention });
      from = end;
    }
  }
  spans.sort((left, right) => left.start - right.start);
  return spans.filter((span, index) => index === 0 || span.start >= spans[index - 1].end);
}

// Drop tracked mentions whose token no longer appears in the draft.
export function pruneFileMentions(draft: string, mentions: ComposerFileMention[]): ComposerFileMention[] {
  const pruned = mentions.filter((mention) => fileMentionSpans(draft, [mention]).length > 0);
  return pruned.length === mentions.length ? mentions : pruned;
}

// The message the agent reads: every chip token replaced by its exact repo-relative path.
export function expandFileMentions(draft: string, mentions: ComposerFileMention[]): string {
  let out = "";
  let cursor = 0;
  for (const span of fileMentionSpans(draft, mentions)) {
    out += draft.slice(cursor, span.start) + span.path;
    cursor = span.end;
  }
  return out + draft.slice(cursor);
}

// A chip deletes as one unit: the span ending exactly at a collapsed caret, or null.
export function fileMentionEndingAt(draft: string, caret: number, mentions: ComposerFileMention[]): FileMentionSpan | null {
  return fileMentionSpans(draft, mentions).find((span) => span.end === caret) ?? null;
}
