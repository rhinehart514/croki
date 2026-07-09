// Self-observing failure logging — Drover watching ITS OWN runs.
//
// When Drover runs its own pipelines and something fails — the drive loop crashes, a run stalls, a
// node errors, or the model hands back unusable output — this module files that failure into the same
// dogfood/queue/ the founder already uses for manual friction, so the team sees what to fix next. It is
// PURE OBSERVATION: it records what already happened and never changes run behavior, never blocks a run,
// never throws into the run path. Every run behaves identically whether logging succeeds, fails, or throws.
//
// This is NOT a fourth harness constraint (see AGENTS.md's anti-cage rule). It adds no required contract,
// no blocking gate, no pre-run object. The four capture-path tags below are OUR observability taxonomy —
// how the failure reached us — never a GTM channel or motion enum. They live only in this file, which is
// not scanned by any anti-cage guard.
//
// It reuses friction.mjs's queue IO (reportFriction / updateFrictionItem / listFrictionQueue) — it never
// reimplements the markdown-file queue.

import path from "node:path";
import { reportFriction, updateFrictionItem, listFrictionQueue, slugify, DEFAULT_QUEUE_DIR } from "./friction.mjs";

// Resolve where this failure gets filed. An explicit options.queueDir always wins. Otherwise, when the
// caller isolates its session to a store root (options.root — every operator unit test does this, and the
// run-path hooks thread the session's options straight through), the self-observation queue is isolated to
// that SAME root at <root>/dogfood/queue. Without this, an isolated test run would silently write real
// self-observed failures into the live repo dogfood/queue/ — polluting the founder's queue and coupling
// otherwise-isolated tests through one shared growing file. Production passes neither, so it lands on the
// real DEFAULT_QUEUE_DIR exactly as before.
function resolveQueueOptions(options = {}) {
  if (options.queueDir || !options.root) return options;
  return { ...options, queueDir: path.join(options.root, "dogfood", "queue") };
}

// The four capture paths — where a failure entered our observation. An observability taxonomy, not a GTM
// vocabulary: it names HOW we saw the failure (a crash vs a stall vs a node error vs bad model output).
export const FAILURE_CATEGORIES = ["run-crash", "run-stall", "node-error", "bad-output"];

// Normalize one part of a signature: lowercase, collapse whitespace, strip to a small safe alphabet, and
// fall back to "unknown" so an empty part can never silently merge two distinct failures.
function normalizePart(value) {
  const cleaned = String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "unknown";
}

// The stable dedup string. Two runs of the SAME broken node with the SAME failure mode must collide
// exactly, so this deliberately EXCLUDES raw error text, timestamps, run ids, and item bodies — anything
// that varies per occurrence. It joins four normalized parts with a pipe:
//   category | errorKind | nodeKind(+label slug) | graphId
// A crash/stall with no node uses the literal "session" for the node part; a run with no graph uses
// "session" for the graph part.
export function failureSignature({ category, errorKind, nodeKind, nodeLabel, graphId } = {}) {
  const cat = normalizePart(category);
  const kind = normalizePart(errorKind);
  // nodeKind is node.kind (agent/skill/code/tool) or the literal "session" for a crash/stall. When the
  // kind is generic (agent/tool/code/skill) we suffix a slug of the node label so two different agent
  // steps that fail the same way stay DISTINCT bugs rather than merging into one.
  let node = normalizePart(nodeKind || "session");
  const genericKinds = new Set(["agent", "tool", "code", "skill", "connector"]);
  if (genericKinds.has(node) && nodeLabel) {
    node = `${node}:${slugify(nodeLabel)}`;
  }
  const graph = normalizePart(graphId || "session");
  return [cat, kind, node, graph].join("|");
}

// ── Classification ────────────────────────────────────────────────────────────

// TRANSIENT patterns: retry or reset clears them, they are not a bug to fix.
const LIMIT_RE = /session limit|usage limit|rate limit|reset|quota/i;
const TIMEOUT_RE = /timed out|timeout/i;
const NETWORK_RE = /ECONN|ENOTFOUND|fetch failed|socket|EAI_AGAIN|network/i;
// A provider-side model failure — the single most common real transient the classifier used to miss:
// an Anthropic "Overloaded" (HTTP 529) or a 500/502/503 "Internal server error" / "Service unavailable"
// carries NONE of the limit/timeout/network tokens above, so without this branch it fell through to
// code_throw and was filed as a self-inflicted bug. These clear on a retry — wait it out, don't fix.
//
// The 5xx token is deliberately NOT matched bare. A bare `\b5\d{2}\b` fires on ordinary content inside a
// genuine JS exception — a stack frame ("at line 523"), a JSON parse offset ("position 512"), an array
// bound ("index 512"), a source location ("foo.js:512:8"), a plain count ("500 characters") — filing a
// real code-throw bug as transient and hiding it behind the transient filter, the exact opposite of this
// feature's job. So a 5xx status is only recognized when an HTTP/status cue sits right next to it
// (HTTP 500, status 503, error code 502, "500 Internal Server Error"). 529 stays explicit because it is
// itself a distinctive, non-coincidental provider code, and the named phrases below cover the real cases.
const MODEL_ERROR_RE = /overloaded|(?:\b(?:http|status|code)\b|error)[^0-9a-z]{0,6}\b5\d{2}\b|\b5\d{2}\b\s+(?:internal server error|service unavailable|bad gateway|gateway timeout)|internal server error|service unavailable|server_error|api error|too many requests|\b529\b/i;

// Map a raw failure to a normalized errorKind token. `meta` carries whatever structured signal the run
// path already has (result.errorKind from classifyAgentError, result.timedOut from the node timeout). We
// prefer that structured signal, then fall back to matching the message text.
export function classifyErrorKind(rawError, meta = {}) {
  const message = typeof rawError === "string" ? rawError : (rawError?.message ?? String(rawError ?? ""));

  // A bad-output path carries an explicit kind the caller computed (unparseable/empty output).
  if (meta.errorKind === "unparseable_output" || meta.errorKind === "empty_output") return meta.errorKind;

  // The agent bridge's own classification (classifyAgentError) rides on result.meta.errorKind.
  if (meta.errorKind === "max_turns") return "max_turns";
  if (meta.errorKind === "max_budget") return "max_budget";
  if (meta.errorKind === "limit") return "limit";

  // A node that ran past its wall-clock ceiling.
  if (meta.timedOut === true) return "timeout";

  // Fall back to the message text.
  if (LIMIT_RE.test(message)) return "limit";
  if (/max turns|turn budget/i.test(message)) return "max_turns";
  if (/max_budget|cost budget/i.test(message)) return "max_budget";
  if (TIMEOUT_RE.test(message)) return "timeout";
  if (NETWORK_RE.test(message)) return "network";
  if (/No connector .* registered/i.test(message)) return "no_connector";
  if (/No step runtime for kind/i.test(message)) return "no_step_runtime";
  if (/requires .* Set it in your environment|requires [A-Z_]+\./i.test(message)) return "missing_env_key";

  // A genuine thrown message that matches no transient pattern is a code throw — a real bug.
  return message.trim() ? "code_throw" : "unknown";
}

// The transient errorKind set — a retry/reset clears it. Everything else is self-inflicted (a real bug).
const TRANSIENT_KINDS = new Set(["max_turns", "max_budget", "limit", "timeout", "network"]);

// Map an errorKind + category to self_inflicted or transient. Pure, deterministic lookup with two
// category overrides:
//   - run-stall is ALWAYS transient (a hung drive; retry the goal).
//   - run-crash is self_inflicted UNLESS its errorKind is transient (a quota crash mid-drive stays
//     transient — it is not a bug to fix, it is a limit to wait out).
export function classifyFault(errorKind, category) {
  if (category === "run-stall") return "transient";
  if (TRANSIENT_KINDS.has(errorKind)) return "transient";
  return "self_inflicted";
}

// ── Context assembly ────────────────────────────────────────────────────────────

// A short, human one-line summary of a node's input — never the raw item bodies (which can carry a draft
// or a soul internal). Just a count + the first item's safe framing (who/subject), so a failure is
// reproducible without leaking content onto a founder surface.
function summarizeInput(input) {
  if (!Array.isArray(input) || input.length === 0) return "no upstream items";
  const first = input[0];
  const who = first && typeof first === "object"
    ? (first.name || first.company || first.handle || first.founder_name || null)
    : null;
  const count = `${input.length} item${input.length === 1 ? "" : "s"}`;
  return who ? `${count} (first: ${String(who).slice(0, 60)})` : count;
}

// Trim a raw error/output snippet to a single legible line for the queue body + the founder surface.
function snippet(text, max = 280) {
  const line = String(text ?? "").replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

// Build the rich, reproducible context for a failure. Pulls from whatever the run path handed us — the
// node, the node result, the graph id/label, the session — and degrades honestly (a missing piece stays
// absent, never invented). Returns the frontmatter-ready fields plus the markdown body pieces.
export function buildFailureContext(input = {}) {
  const { category, node = null, result = null, graphId = null, graphLabel = null, session = null, error = null } = input;

  // The raw failure text: the node result's error, or the crash/stall error, or an explicit output snippet.
  const rawError = result?.error ?? (error instanceof Error ? error.message : (typeof error === "string" ? error : null));
  const meta = {
    errorKind: input.errorKind ?? result?.meta?.errorKind ?? null,
    timedOut: result?.timedOut === true,
  };
  const errorKind = classifyErrorKind(rawError, meta);
  const failureClass = classifyFault(errorKind, category);

  const nodeKind = node?.kind ?? (category === "run-crash" || category === "run-stall" ? "session" : "tool");
  const nodeLabel = node?.label ?? node?.id ?? null;
  const resolvedGraphId = graphId ?? result?.graphId ?? session?.graphId ?? null;
  const resolvedGraphLabel = graphLabel ?? session?.goal ?? null;

  const signature = failureSignature({
    category,
    errorKind,
    nodeKind: node?.kind ?? (category === "run-crash" || category === "run-stall" ? "session" : nodeKind),
    nodeLabel,
    graphId: resolvedGraphId,
  });

  // The founder-safe, reproducible context — no item bodies, no system prompts.
  const contextObject = {
    category,
    errorKind,
    failureClass,
    pipeline: { id: resolvedGraphId, label: resolvedGraphLabel },
    step: node ? { id: node.id ?? null, label: nodeLabel, kind: node.kind ?? null } : null,
    inputSummary: summarizeInput(input.inputItems),
    sessionId: session?.id ?? null,
  };

  const errorSnippet = snippet(rawError ?? "(no error text)");

  return { signature, errorKind, failureClass, nodeKind, nodeLabel, graphId: resolvedGraphId, graphLabel: resolvedGraphLabel, contextObject, errorSnippet, rawError };
}

// ── The log write (dedup-bump or create) ────────────────────────────────────────

// A one-line report headline for the queue — plain words, no jargon, naming the pipeline + step.
function reportHeadline({ category, graphLabel, graphId, nodeLabel }) {
  const where = nodeLabel ? `step "${nodeLabel}"` : "the run";
  const pipeline = graphLabel || graphId || "a pipeline";
  const what = {
    "run-crash": "Drover's own run crashed",
    "run-stall": "Drover's own run stalled",
    "node-error": "a step failed",
    "bad-output": "the model returned unusable output",
  }[category] ?? "a run failed";
  return `Self-observed: ${what} in ${pipeline} at ${where}.`;
}

// Log one failure. Computes the signature, then dedup-bumps a matching OPEN entry (occurrences+1, advanced
// last_seen, a dated Recurrences bullet) or writes a fresh entry (occurrences 1, first_seen === last_seen).
// Keying on OPEN status is intentional: a founder marking an entry resolved lets the same failure re-open a
// fresh entry later. This does synchronous file IO exactly like reportFriction — nothing is awaited, so the
// run loop's control flow never depends on it.
export function logFailure(input = {}, rawOptions = {}) {
  const options = resolveQueueOptions(rawOptions);
  const now = options.now ? new Date(options.now) : new Date();
  const stamp = now.toISOString();
  const ctx = buildFailureContext(input);

  const existing = listFrictionQueue(options).reports.find(
    (r) => r.signature === ctx.signature && r.status === "open",
  );

  if (existing) {
    // listFrictionQueue returns the basename; updateFrictionItem needs the full path. Resolve it against
    // the same queue dir reportFriction wrote to.
    const queueDir = options.queueDir ?? DEFAULT_QUEUE_DIR;
    const filePath = path.join(queueDir, existing.file);
    const occurrences = (Number.isFinite(existing.occurrences) ? existing.occurrences : 1) + 1;
    updateFrictionItem(filePath, {
      fields: {
        occurrences,
        last_seen: stamp,
      },
      appendSection: `## Recurrences\n\n- ${stamp} — ${ctx.errorSnippet}`,
    });
    return { file: existing.file, signature: ctx.signature, occurrences, bumped: true };
  }

  // A fresh entry. The rich reproducible context rides the existing Snapshot channel + a "What broke"
  // section (the raw snippet the surface renders) and a Context JSON block (pipeline/step/input summary).
  const body = [
    "## What broke",
    "",
    ctx.errorSnippet,
    "",
    "## Context",
    "",
    "```json",
    JSON.stringify(ctx.contextObject, null, 2),
    "```",
  ].join("\n");

  const record = reportFriction(
    {
      report: reportHeadline(ctx),
      kind: "bug",
      source: "self-observed",
      context: body,
      snapshot: ctx.contextObject,
      signature: ctx.signature,
      category: input.category,
      failureClass: ctx.failureClass,
      occurrences: 1,
      firstSeen: stamp,
      lastSeen: stamp,
    },
    { ...options, now: stamp },
  );
  // Return the basename so the create and dedup-bump paths agree on the shape, matching what
  // listFrictionQueue and the founder surface use to key a queue item.
  return { file: path.basename(record.file), signature: ctx.signature, occurrences: 1, bumped: false };
}

// The never-throws shell the run path calls. It swallows EVERYTHING — a bad input, a full disk, a throw
// inside logFailure — and returns void. A run must behave identically whether this succeeds or fails.
export function safeLogFailure(input = {}, options = {}) {
  try {
    logFailure(input, options);
  } catch {
    // Observation must never alter the run it observes. Swallow silently.
  }
}
