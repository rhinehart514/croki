// The chip layer for `@`-file mentions: a mirror rendered exactly behind the transparent-backed
// textarea. All text here is invisible — the textarea's own text and caret sit above — so only the
// pill painted around each tracked token shows. Metrics (font, line height, padding, wrapping) must
// match the textarea rule in now.css or pills drift off their tokens.
import type { ReactNode, Ref } from "react";
import { fileMentionSpans, type ComposerFileMention } from "./composerFileMentions";

export function ComposerMentionBackdrop({ draft, mentions, ref }: {
  draft: string;
  mentions: ComposerFileMention[];
  ref?: Ref<HTMLDivElement>;
}) {
  const spans = fileMentionSpans(draft, mentions);
  if (!spans.length) return null;
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start > cursor) parts.push(draft.slice(cursor, span.start));
    parts.push(<mark key={`${span.start}:${span.path}`} title={span.path}>{span.token}</mark>);
    cursor = span.end;
  }
  if (cursor < draft.length) parts.push(draft.slice(cursor));
  return <div ref={ref} className="now-composer-mention-backdrop" aria-hidden="true">{parts}</div>;
}
