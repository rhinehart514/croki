import type { OperatorEvent, OperatorSession } from "@/types";

// The one place run state becomes founder language. The operator streams status and tool events named
// for the machine ("Using inspect product", "compose and run failed", "Composed workflow is invalid:
// Edge … has an unknown source", "Running claude-opus-4-8 via Claude Code (Agent SDK)"). A founder
// running a go-to-market desk should never read any of that. This seam rewrites the machine-named
// status/tool/error lines into plain words and leaves genuine reasoning prose untouched, so both the
// canvas drive-state and the conversation thread show the same clean narration without either
// component knowing the machine vocabulary existed. Rules are anchored to the exact machine phrasings,
// so a sentence of Claude's own reasoning can never match one by accident.

// Short status + tool titles → what the founder is actually watching happen.
const TITLE_RULES: Array<[RegExp, string]> = [
  [/^Operator started$/i, "Getting started"],
  [/^Operator resumed$/i, "Picking back up"],
  [/^Operator reasoning$/i, "Thinking it through"],
  [/^Using inspect product$/i, "Reading your product"],
  [/^Using inspect shared context$/i, "Reading your notes"],
  [/^Using ideate$/i, "Coming up with directions"],
  [/^Using (?:compose and run|compose_and_run)$/i, "Building the plan"],
  [/^Using inspect graph$/i, "Checking the plan"],
  [/^Inspected product evidence$/i, "Read your product"],
  [/^Inspected shared product intelligence$/i, "Read your notes"],
  // Any "<tool> failed" status — the operator recovers on its own, so this stays reassuring, not alarming.
  [/\bfailed$/i, "Hit a snag — trying another way"],
];

// Details that are pure plumbing: the founder loses nothing by not seeing them.
const DROP_DETAIL: RegExp[] = [
  /\bAgent SDK\b/i,
  /\bvia Claude Code\b/i,
  /^Shared context v?\d* is used by every (?:channel|pipeline)\.?$/i,
];

// Machine error/status details → plain words. Anchored to the machine phrasing so prose is never hit.
const DETAIL_RULES: Array<[RegExp, string]> = [
  [/^Composed workflow is invalid[\s\S]*$/i, "The plan came back mis-wired — rebuilding it."],
  [/^No active (?:channel|pipeline)[\s\S]*$/i, "No pipeline is active yet."],
  [/^Blind:\s*invoice\.paid could not be confirmed\.?$/i, "Couldn't confirm the paid-invoice signal in your product."],
];

// Founder-facing word swaps applied only to the short status labels (titles) and to details we already
// rewrote — never to raw reasoning prose, where "channel" can legitimately mean a marketing channel.
function swapLabelWords(s: string): string {
  return s
    .replace(/\bfounder gate\b/gi, "your gate")
    .replace(/\bchannels\b/g, "pipelines")
    .replace(/\bChannels\b/g, "Pipelines")
    .replace(/\bchannel\b/g, "pipeline")
    .replace(/\bChannel\b/g, "Pipeline");
}

function rewriteDetail(detail: string): { text: string; rewritten: boolean } {
  if (DROP_DETAIL.some((re) => re.test(detail))) return { text: "", rewritten: true };
  for (const [re, to] of DETAIL_RULES) if (re.test(detail)) return { text: to, rewritten: true };
  return { text: detail, rewritten: false };
}

export function humanizeOperatorEvent(ev: OperatorEvent): OperatorEvent {
  const rawTitle = ev.title ?? "";
  const rawDetail = ev.detail ?? "";

  let title = rawTitle;
  for (const [re, to] of TITLE_RULES) {
    if (re.test(title)) { title = to; break; }
  }
  title = swapLabelWords(title);

  // Only rewritten details get the word swap — untouched detail is reasoning prose and stays authentic.
  const detailResult = rawDetail ? rewriteDetail(rawDetail) : { text: "", rewritten: false };
  const detail = detailResult.rewritten ? swapLabelWords(detailResult.text) : rawDetail;

  if (title === rawTitle && detail === rawDetail) return ev;
  return { ...ev, title, detail: detail || null };
}

// Clean a terminal session's headline error the same way a detail line is cleaned.
function humanizeError(error: string): string {
  const { text, rewritten } = rewriteDetail(error);
  return rewritten ? swapLabelWords(text) : swapLabelWords(error);
}

// Route a whole session's run state through the seam before it reaches any founder-facing component.
export function humanizeOperatorSession(session: OperatorSession): OperatorSession {
  const events = session.events?.map(humanizeOperatorEvent) ?? session.events;
  const error = session.error ? humanizeError(session.error) : session.error;
  return { ...session, events, error };
}
