import type { OperatorEvent, OperatorSession } from "@/types";

// The one place run state becomes founder language. The operator streams status and tool events named
// for the machine ("Using inspect product", "compose and run failed", "Composed workflow is invalid:
// Edge … has an unknown source", "Running claude-opus-4-8 via Claude Code (Agent SDK)"). A founder
// running a go-to-market desk should never read any of that. This seam rewrites the machine-named
// status/tool/error lines into plain words and translates recurring engine jargon in reasoning, so both the
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

// Model narration is allowed to stay first-person and specific, but the founder should never have to
// decode the engine's nouns. This is a narrow backstop for the recurring vocabulary the prompt already
// bans, including old persisted sessions written before that prompt rule existed.
function rewriteReasoning(detail: string): string {
  return detail
    .replace(/access requests preserve a\s+`?ref`?\s+source/gi, "access requests record where someone came from")
    .replace(/the actual\s+`?project_created`?\s+conversion is still blind/gi, "we still cannot see whether those people go on to create a project")
    .replace(/`([a-z][a-z0-9]*(?:_[a-z0-9]+)+)`/g, (_match, id: string) => id.replaceAll("_", " "))
    .replace(/\bGTM primitive\b/gi, "useful clue")
    .replace(/\battribution\b/gi, "the source trail")
    .replace(/\bproduct positioning\b/gi, "how to explain the product")
    .replace(/\bbuyer fit\b/gi, "who it is really for")
    .replace(/\bhypotheses\b/gi, "things we still need to test")
    .replace(/\ba real fork\b/gi, "several genuinely different ways to go")
    .replace(/\brunnable shapes\b/gi, "approaches")
    .replace(/\bshapes\b/gi, "approaches")
    .replace(/\bthe motion\b/gi, "one")
    .replace(/\bapproval gate\b/gi, "review before anything goes out")
    .replace(/\bbeing composed\b/gi, "being laid out");
}

function humanizeOperatorEvent(ev: OperatorEvent): OperatorEvent {
  const rawTitle = ev.title ?? "";
  const rawDetail = ev.detail ?? "";

  let title = rawTitle;
  for (const [re, to] of TITLE_RULES) {
    if (re.test(title)) { title = to; break; }
  }
  title = swapLabelWords(title);

  // Reasoning stays authentic, with only the recurring engine vocabulary translated.
  const detailResult = rawDetail ? rewriteDetail(rawDetail) : { text: "", rewritten: false };
  const detail = ev.type === "operator_note"
    ? rewriteReasoning(detailResult.text)
    : (detailResult.rewritten ? swapLabelWords(detailResult.text) : rawDetail);

  if (title === rawTitle && detail === rawDetail) return ev;
  return { ...ev, title, detail: detail || null };
}

// The Issues surface hands a broken part of the go-to-market to Claude to repair. The instruction the
// founder fires shows up verbatim in their conversation thread, so it must read like something they'd
// actually say — never "fix the learn subsystem". Each internal area maps to the plain words a founder
// uses for that part of their go-to-market.
const AREA_WORDS: Record<string, string> = {
  research: "your market research",
  context: "your product notes",
  source: "finding the right people to reach",
  enrich: "researching your prospects",
  filter: "deciding who's a fit",
  generate: "the drafting step",
  gate: "your approval gate",
  execute: "sending and publishing",
  measure: "measuring what's working",
  learn: "learning from your decisions",
};

// The founder-facing name for a part of the go-to-market — used both in the issue label and the fix
// instruction so the same plain words describe it everywhere.
export function areaLabel(area: string): string {
  return AREA_WORDS[area] ?? "your go-to-market";
}

// Phrase the "fix this" ask as the founder would, pointing Claude at the real part that's struggling
// and the problem in plain words. No module names, no "subsystem".
export function fixProblemInstruction(area: string, problem: string): string {
  return `Something's off with ${areaLabel(area)}: ${swapLabelWords(problem)} Can you look into this and fix it?`;
}

// The same ask for a specific step on the canvas — the founder already sees the step by its own name.
export function fixStepInstruction(stepLabel: string, message: string): string {
  return `The "${stepLabel}" step has a problem: ${swapLabelWords(message)} Can you fix it?`;
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
