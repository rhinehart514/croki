// DecisionInbox — the one place every decision waiting on you gathers. The product pauses for you in
// several spots (a run staged at your gate, proposed changes to a pipeline, a set of directions to
// weigh, pipeline shapes to pick, a question mid-run, a run that stalled or died, a signal that just
// came in). Each used to sit on its own screen, so a run that reached your gate or died while you were
// looking elsewhere waited silently. This surface lists them all — across every product — with enough
// context to know what it is, and an Open that jumps you to where you actually decide it. It never
// decides anything itself: Open hands you to the real gate / review / inbox, exactly as before.
//
// The row reads status-first: the bold line is what you must DECIDE ("1 draft ready to approve",
// "3 pipeline shapes to pick", "A run stopped early"), the pipeline it belongs to is the quiet
// subtitle. The raw founder prompt is never the headline — three items from one run used to share the
// identical prompt as their title, which told you nothing about which decision was which. Anything a
// run couldn't say in plain words (a raw error payload from a model or tool) is turned into one human
// sentence before it ever reaches this surface — the founder never reads a JSON blob or a stack trace.

import { CircleCheck, GitPullRequestArrow, Lightbulb, Route, MessageCircleQuestion, OctagonAlert, CircleSlash, Inbox } from "lucide-react";
import type { PendingDecision, PendingDecisionKind } from "@/types";
import "@/styles/decision-inbox.css";

// Each kind's icon and whether it carries the founder-gate accent. The bold headline itself is built
// per-item from the decision's real shape (counts included), so it names the exact call — not a fixed
// label shared by every item of that kind.
const KIND_META: Record<PendingDecisionKind, { icon: typeof Inbox; accent: boolean }> = {
  gate: { icon: CircleCheck, accent: true },
  proposal: { icon: GitPullRequestArrow, accent: false },
  ideas: { icon: Lightbulb, accent: false },
  candidates: { icon: Route, accent: false },
  question: { icon: MessageCircleQuestion, accent: false },
  blocked: { icon: OctagonAlert, accent: false },
  failed: { icon: CircleSlash, accent: false },
  signal: { icon: Inbox, accent: false },
};

// The bold line: exactly what the founder must decide, in their words, with the real count folded in
// when it's a pick among N. Falls back to a plain kind phrase when the count isn't known.
function askHeadline(d: PendingDecision): string {
  const n = typeof d.optionCount === "number" ? d.optionCount : null;
  switch (d.kind) {
    case "gate":
      return "Ready for your approval";
    case "proposal":
      return "Changes to review";
    case "ideas":
      return n && n > 0 ? `${n} direction${n === 1 ? "" : "s"} to weigh` : "Directions to weigh";
    case "candidates":
      return n && n > 0 ? `${n} pipeline shape${n === 1 ? "" : "s"} to pick` : "Pipeline shapes to pick";
    case "question":
      return "A question for you";
    case "blocked":
      return "A run is blocked";
    case "failed":
      return "A run stopped early";
    case "signal":
      return "A signal to route";
    default:
      return "Waiting on you";
  }
}

// Turn whatever a run left in its summary into one line a founder can read. Runs that blocked or died
// often carry a raw model/tool error — a JSON payload, a stack trace, a bare status string. None of
// that belongs in front of the founder, so we detect those shapes and swap in a plain sentence. Text
// that already reads like a human sentence passes through untouched.
function humaneLine(kind: PendingDecisionKind, raw: string | null): string | null {
  const text = (raw ?? "").trim();

  // Only blocked/failed rows carry error payloads; other kinds' summaries are already founder-words.
  const mayBeError = kind === "blocked" || kind === "failed";
  if (mayBeError && (text === "" || looksLikeRawError(text))) {
    return errorPlainLine(text);
  }
  return text || null;
}

// Does this string look like machine output rather than a written sentence? JSON, a stack trace, a
// bare HTTP status, or a `{"type"…}` error envelope all read as raw.
function looksLikeRawError(text: string): boolean {
  if (/^[[{]/.test(text)) return true; // starts as JSON
  if (/"(type|status|error|message|code)"\s*:/.test(text)) return true; // JSON error fields
  if (/\b(at\s+\w+.*:\d+:\d+|Error:|Traceback|Exception)\b/.test(text)) return true; // stack / exception
  if (/^\d{3}\b/.test(text) && text.length < 40) return true; // bare status like "400 Bad Request"
  if (/https?:\/\//.test(text) && text.length < 80) return true; // bare URL, no prose
  return false;
}

// Map a raw error into a single human sentence. We look for the few real causes worth naming (an
// unavailable model on the founder's plan, a rate limit, an auth problem) and otherwise fall back to
// an honest generic line. Never surfaces the payload itself.
function errorPlainLine(text: string): string {
  const lower = text.toLowerCase();
  if (/model is not supported|not supported when using|unsupported model|model_not_found|does not have access to/.test(lower)) {
    return "A teammate couldn't finish — the model it needs isn't available on your plan.";
  }
  if (/rate limit|rate_limit|too many requests|\b429\b/.test(lower)) {
    return "A teammate hit a usage limit and paused. Give it a moment and try again.";
  }
  if (/unauthor|forbidden|invalid api key|authentication|\b401\b|\b403\b/.test(lower)) {
    return "A teammate couldn't connect — a login or key needs your attention.";
  }
  if (/timeout|timed out|econnreset|network|fetch failed/.test(lower)) {
    return "A teammate lost its connection before it finished.";
  }
  return "A teammate couldn't finish this run. Nothing was sent.";
}

// One thread should show as one row. A single run can pass through several waiting states, and the
// projection can briefly carry more than one, which reads as more decisions than exist. Collapse to
// the newest waiting state per run (per session, else per pipeline, else the item stands alone), so
// the count matches the number of real threads on your desk.
function dedupeToNewestPerThread(decisions: PendingDecision[]): PendingDecision[] {
  const newestByThread = new Map<string, PendingDecision>();
  const standalone: PendingDecision[] = [];
  for (const d of decisions) {
    const threadKey = d.sessionId
      ? `s:${d.sessionId}`
      : d.pipelineId
        ? `p:${d.projectId ?? ""}:${d.pipelineId}`
        : null;
    if (!threadKey) {
      standalone.push(d);
      continue;
    }
    const existing = newestByThread.get(threadKey);
    if (!existing || isNewer(d, existing)) newestByThread.set(threadKey, d);
  }
  const merged = [...newestByThread.values(), ...standalone];
  merged.sort((a, b) => String(b.waitingSince ?? "").localeCompare(String(a.waitingSince ?? "")));
  return merged;
}

function isNewer(a: PendingDecision, b: PendingDecision): boolean {
  return String(a.waitingSince ?? "").localeCompare(String(b.waitingSince ?? "")) > 0;
}

function relativeWhen(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m waiting`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h waiting`;
  return `${Math.round(hrs / 24)}d waiting`;
}

export function DecisionInbox({
  decisions,
  onOpen,
}: {
  decisions: PendingDecision[];
  onOpen: (decision: PendingDecision) => void;
}) {
  if (decisions.length === 0) {
    return (
      <div className="decision-inbox decision-inbox-empty">
        <CircleCheck className="decision-inbox-empty-glyph" />
        <p className="decision-inbox-empty-title">Nothing's waiting on you.</p>
        <p className="decision-inbox-empty-note">
          When a run reaches your gate, stalls, or a signal comes in — here or in any other product —
          it lands here so you never miss it.
        </p>
      </div>
    );
  }

  const threads = dedupeToNewestPerThread(decisions);

  return (
    <ul className="decision-inbox">
      {threads.map((d) => {
        const meta = KIND_META[d.kind];
        const Icon = meta.icon;
        const headline = askHeadline(d);
        const line = humaneLine(d.kind, d.summary);
        const where = [d.projectName, d.pipelineName].filter(Boolean).join(" · ");
        return (
          <li key={d.id} className={`decision-row ${meta.accent ? "is-gate" : ""}`}>
            <span className={`decision-row-glyph ${meta.accent ? "is-gate" : ""}`}>
              <Icon size={15} />
            </span>
            <div className="decision-row-body">
              <div className="decision-row-head">
                <span className="decision-row-ask">{headline}</span>
                <span className="decision-row-when">{relativeWhen(d.waitingSince)}</span>
              </div>
              {where ? <p className="decision-row-where">{where}</p> : null}
              {line ? <p className="decision-row-summary">{line}</p> : null}
            </div>
            <button
              type="button"
              className="decision-row-open"
              onClick={() => onOpen(d)}
            >
              Open
            </button>
          </li>
        );
      })}
    </ul>
  );
}
