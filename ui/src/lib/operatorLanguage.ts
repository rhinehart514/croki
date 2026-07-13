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
  [/^Blind:\s*[a-z][a-z0-9_]* could not be confirmed\.?$/i, "Couldn't confirm the customer success signal in your product yet."],
];

// Does this string look like machine output rather than a written sentence? JSON, a stack trace, a bare
// HTTP status, or a bare URL all read as raw — and so does the run harness's own error envelope, which
// arrives as prose ("Claude Code returned an error result: …", "API Error: Connection closed …"). A
// founder must never read any of it, so we detect the shape and swap in one plain sentence instead.
function looksLikeMachineError(text: string): boolean {
  if (/^[[{]/.test(text)) return true; // starts as JSON
  if (/"(type|status|error|message|code)"\s*:/.test(text)) return true; // JSON error fields
  if (/\b(at\s+\w+.*:\d+:\d+|Error:|Traceback|Exception)\b/.test(text)) return true; // stack / exception
  if (/^\d{3}\b/.test(text) && text.length < 40) return true; // bare status like "400 Bad Request"
  if (/https?:\/\//.test(text) && text.length < 80) return true; // bare URL, no prose
  // The harness/model envelopes — transport and quota errors that leak as prose. Anchored to error
  // phrasing only: a reasoning turn that merely mentions the engine by name is scrubbed elsewhere, not
  // mistaken for a failure here.
  return /returned an error result|\bapi error\b|connection closed mid-response|maximum number of turns|max_turns|(?:session|usage) limit|hit your session|response above may be incomplete/i.test(text);
}

// Map any raw machine/model/harness error into a single honest founder sentence — or null if the text
// already reads like a written sentence and should pass through. The one place a run's failure becomes
// founder language; it never names the engine, quotes a payload, or shows a path. Shared by the crew
// thread (via rewriteDetail) and the decisions inbox, so a failure reads the same everywhere.
export function plainErrorLine(raw: string | null | undefined): string | null {
  const text = (raw ?? "").trim();
  if (!text || !looksLikeMachineError(text)) return null;
  const lower = text.toLowerCase();
  if (/model is not supported|not supported when using|unsupported model|model_not_found|does not have access to/.test(lower))
    return "A teammate couldn't finish — the model it needs isn't available on your plan.";
  if (/maximum number of turns|max_turns|turn budget/.test(lower))
    return "A teammate ran long and paused before finishing. You can nudge it to keep going.";
  if (/session limit|usage limit|rate limit|rate_limit|too many requests|\b429\b|quota|hit your session/.test(lower))
    return "A teammate hit a usage limit and paused. It picks back up once the limit resets.";
  if (/unauthor|forbidden|invalid api key|authentication|\b401\b|\b403\b/.test(lower))
    return "A teammate couldn't connect — a login or key needs your attention.";
  if (/timeout|timed out|econnreset|connection closed|network|fetch failed|overloaded|\b5\d{2}\b/.test(lower))
    return "A teammate briefly lost its connection before it finished.";
  return "A teammate couldn't finish this run. Nothing was sent.";
}

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
  const machineError = plainErrorLine(detail);
  if (machineError) return { text: machineError, rewritten: true };
  if (DROP_DETAIL.some((re) => re.test(detail))) return { text: "", rewritten: true };
  for (const [re, to] of DETAIL_RULES) if (re.test(detail)) return { text: to, rewritten: true };
  return { text: detail, rewritten: false };
}

// Model narration is allowed to stay first-person and specific, but the founder should never have to
// decode the engine's nouns. This is a narrow backstop for the recurring vocabulary the prompt already
// bans, including old persisted sessions written before that prompt rule existed.
export function rewriteFounderLanguage(detail: string): string {
  return detail
    // Never let engine plumbing surface inside a reasoning turn: the harness name, an absolute path to
    // the founder's machine, or the internal "(dogfood)" project tag all get scrubbed before anything else.
    .replace(/\bClaude Code\b/g, "the crew")
    .replace(/\/Users\/[^\s)"'`]+/g, "your project folder")
    .replace(/\s*\((?:dogfood|internal)\)/gi, "")
    .replace(/\s*\bdogfood\b/gi, "")
    .replace(/access requests preserve a\s+`?ref`?\s+source/gi, "access requests record where someone came from")
    .replace(/the actual\s+`?project_created`?\s+conversion is still blind/gi, "we still cannot see whether those people go on to create a project")
    // A backticked machine slug — `rodentradar-2`, `gtm-ide`, `project_created` — is an internal id, never
    // founder language. De-slug it to plain words and drop a trailing duplicate-suffix number so it reads
    // like a name. Runs after the specific semantic rules above, which depend on the raw ids.
    .replace(/`([a-z][a-z0-9]*(?:[-_][a-z0-9]+)+)`/g, (_match, id: string) => id.replace(/[-_]\d+$/, "").replaceAll(/[-_]/g, " "))
    .replace(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g, (id) => id.replaceAll("_", " "))
    .replace(/\bearning inbound access-requests\b/gi, "bringing in requests from owners")
    .replace(/\bref[- ]tagged\b/gi, "trackable")
    .replace(/\bref code\b/gi, "tracking link")
    .replace(/\bGTM primitive\b/gi, "useful clue")
    .replace(/\battribution\b/gi, "the source trail")
    .replace(/\battributable\b/gi, "trackable")
    .replace(/\bproduct positioning\b/gi, "how to explain the product")
    .replace(/\bbuyer fit\b/gi, "who it is really for")
    .replace(/\bhypotheses\b/gi, "things we still need to test")
    .replace(/\ba real fork\b/gi, "several genuinely different ways to go")
    .replace(/\bthe goal forks\b/gi, "there are genuinely different ways to go")
    .replace(/\bembodied pipeline\b/gi, "concrete")
    .replace(/\bfounder review gate\b/gi, "your review before anything goes out")
    .replace(/\bfounder truth\b/gi, "what only you can confirm")
    .replace(/\brunnable shapes\b/gi, "approaches")
    .replace(/\bshapes\b/gi, "approaches")
    .replace(/\bthe motion\b/gi, "one")
    .replace(/\bmotion\b/gi, "approach")
    .replace(/\bapproval gate\b/gi, "review before anything goes out")
    .replace(/\bbeing composed\b/gi, "being laid out")
    .replace(/\bmint\b/gi, "create")
    .replace(/\bstage\b/gi, "prepare")
    .replace(/\bCRM\b/g, "customer records")
    .replace(/\bteardown\b/gi, "site review")
    .replace(/\bfounder approves\b/gi, "you approve")
    .replace(/\binbound\b/gi, "people finding you");
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
  const detail = detailResult.rewritten
    ? swapLabelWords(detailResult.text)
    : rewriteFounderLanguage(rawDetail);

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
