import crypto from "node:crypto";
import { appendGateJudgments } from "./shared-judgments.mjs";
import { persistence } from "./persistence.mjs";
import { actionLogFromRun, detectCrystallizationSuggestions } from "./crystallization.mjs";
import { proposeToolBirthFromCandidate } from "./tool-birth.mjs";
import { extractIdeaTaste } from "./memory.mjs";

const SCHEMA_VERSION = 1;
const COLLECTION = "feedback-ledger";

function now() {
  return new Date().toISOString();
}

function safeId(value) {
  return String(value || "default").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "default";
}

function emptyLedger(projectId) {
  return { schemaVersion: SCHEMA_VERSION, projectId, signals: [] };
}

export function loadFeedbackLedger(projectId = "default", options = {}) {
  const stored = persistence(options).get(COLLECTION, safeId(projectId));
  if (!stored) return emptyLedger(projectId);
  if (stored?.schemaVersion === SCHEMA_VERSION && Array.isArray(stored.signals)) return stored;
  return {
    ...emptyLedger(projectId),
    ...stored,
    schemaVersion: SCHEMA_VERSION,
    signals: Array.isArray(stored?.signals) ? stored.signals : [],
  };
}

export function saveFeedbackLedger(ledger, options = {}) {
  const durable = {
    ...ledger,
    schemaVersion: SCHEMA_VERSION,
    signals: Array.isArray(ledger.signals) ? ledger.signals : [],
  };
  persistence(options).set(COLLECTION, safeId(durable.projectId), durable);
  return durable;
}

function signal(input) {
  return {
    id: `signal-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    observedAt: now(),
    ...input,
  };
}

export function normalizeRunFeedback({ projectId = "default", graph, result } = {}) {
  const signals = [];
  const nodes = result?.nodes ?? {};
  for (const [nodeId, nodeResult] of Object.entries(nodes)) {
    if (nodeResult?.category === "gate") {
      for (const item of nodeResult.items ?? []) {
        if (item.approvalStatus === "approved") {
          signals.push(signal({
            projectId,
            graphId: graph?.id ?? result?.graphId ?? null,
            runId: result?.runId ?? null,
            nodeId,
            type: item.editedFrom ? "FounderEdit" : "FounderApproval",
            summary: item.editedFrom
              ? `Changed "${String(item.editedFrom).slice(0, 120)}" to "${String(item.draft || "").slice(0, 120)}"`
              : String(item.draft || item.name || "Approved gated item").slice(0, 160),
            itemId: item.id ?? null,
          }));
        } else if (item.approvalStatus === "rejected") {
          signals.push(signal({
            projectId,
            graphId: graph?.id ?? result?.graphId ?? null,
            runId: result?.runId ?? null,
            nodeId,
            type: "FounderRejection",
            summary: String(item.draft || item.name || "Rejected gated item").slice(0, 160),
            itemId: item.id ?? null,
          }));
        }
      }
    }
    // Only a GENUINE step failure is a learning signal. A node that is `blocked` (waiting on a gate
    // pause or a failed upstream) or `blind` (honest measurement gap) is not the agent's fault, so
    // banking it as RunFailure floods the policy with noise and spawns junk agent revisions. The
    // earlier flood of identical "Waiting for at least 1 input item" loops came from exactly this.
    if (nodeResult?.ok === false && nodeResult.error && !nodeResult.blocked && !nodeResult.blind) {
      signals.push(signal({
        projectId,
        graphId: graph?.id ?? result?.graphId ?? null,
        runId: result?.runId ?? null,
        nodeId,
        type: "RunFailure",
        summary: String(nodeResult.error).slice(0, 200),
      }));
    }
  }
  return signals;
}

// IdeaKill / IdeaKeep — the founder's verdict on a GENERATED idea, banked on the FEEDBACK rail.
//
// Killing or keeping an idea is a FOUNDER act, never the agent's: the agent generates (ideation.mjs)
// and a separate bar grades (idea-bar.mjs), but only the founder kills or keeps. We bank that decision
// as a FeedbackSignal so memory.mjs can fold the killed ANGLES back into the next ideation round — the
// loop-memory equivalent of how gate decisions teach voice, here teaching which angles bite.
//
// Deliberately on the FEEDBACK rail and NOT crystallization: idea-taste is judgment, and
// crystallization excludes ideate/propose by signature design (JUDGMENT_VERBS), so an idea decision can
// never freeze into a tool. These signals are not AgentAction records and never reach the action log.
export function ideaDecisionSignals({ projectId = "default", decisions = [] } = {}) {
  const signals = [];
  for (const entry of decisions ?? []) {
    // Accept a bare GtmIdea (its own killed/verdict is the decision) or { idea, decision } where the
    // founder's explicit "kill" / "keep" overrides the idea's stored verdict.
    const idea = entry?.idea ?? entry;
    if (!idea || typeof idea !== "object") continue;
    const explicit = entry?.decision;
    const killed = explicit === "kill" || explicit === "killed"
      || (explicit == null && (idea.killed === true || idea.verdict === "killed"));
    const kept = !killed && (explicit === "keep" || explicit === "kept" || explicit === "survived"
      || (explicit == null && (idea.killed === false || idea.verdict === "survived")));
    if (!killed && !kept) continue; // an undecided idea is not yet a feedback signal
    const pitch = String(idea.pitch ?? idea.summary ?? "").trim();
    signals.push(signal({
      projectId,
      type: killed ? "IdeaKill" : "IdeaKeep",
      ideaId: idea.id ?? null,
      angle: typeof idea.angle === "string" ? idea.angle : null,
      goal: typeof idea.goal === "string" ? idea.goal : null,
      barScore: Number.isFinite(idea.barScore) ? idea.barScore : null,
      summary: pitch ? pitch.slice(0, 200) : (killed ? "Killed idea" : "Kept idea"),
    }));
  }
  return signals;
}

// Bank a founder's idea kills/keeps in the same feedback ledger gate decisions live in, so the next
// ideation round reads them through memory.extractIdeaTaste. Pure-additive over the ledger.
export function recordIdeaDecisions({ projectId = "default", decisions = [] } = {}, options = {}) {
  const signals = ideaDecisionSignals({ projectId, decisions });
  const ledger = recordFeedbackSignals(signals, { ...options, projectId });
  return { ledger, signals };
}

// The READ side of the idea-taste loop, in ONE place so the operator runtime and the server's memory
// builders fold idea taste in identically. It loads a project's durable feedback ledger and runs the
// banked IdeaKill/IdeaKeep signals through memory.extractIdeaTaste — the killed/kept angles the next
// ideation round avoids or leans into. Returns null when the project has no idea decisions yet, exactly
// like extractIdeaTaste, so callers can pass the result straight into buildDraftMemory's `ideaTaste`.
export function ideaTasteForProject(projectId = "default", options = {}) {
  return extractIdeaTaste(loadFeedbackLedger(projectId, options).signals);
}

// Each executed step as a durable AgentAction signal so the crystallization detector can bucket
// repeated deterministic procedures ACROSS runs (a single run rarely repeats one). Kept SEPARATE from
// the founder-feedback signals above — these are bookkeeping for crystallization, not founder
// decisions, so they never inflate the feedback count or drive a policy revision. Judgment work is
// excluded later by signature design, never lost here.
export function actionSignalsFromRun({ projectId = "default", graph, result } = {}) {
  return actionLogFromRun(graph, result).map((action) => signal({
    projectId,
    graphId: graph?.id ?? result?.graphId ?? null,
    runId: result?.runId ?? null,
    nodeId: action.nodeId ?? null,
    type: "AgentAction",
    summary: String(action.name).slice(0, 160),
    action,
  }));
}

// Rebuild the accumulated action log from banked AgentAction signals, newest runs included, so the
// detector sees the full deterministic-procedure history rather than one run's worth.
function actionLogFromLedger(ledger) {
  return (ledger?.signals ?? [])
    .filter((item) => item?.type === "AgentAction" && item.action)
    .map((item) => item.action);
}

export function recordFeedbackSignals(signals = [], options = {}) {
  const projectId = options.projectId || signals.find((item) => item.projectId)?.projectId || "default";
  if (!signals.length) return loadFeedbackLedger(projectId, options);
  const ledger = loadFeedbackLedger(projectId, options);
  return saveFeedbackLedger({
    ...ledger,
    signals: [...ledger.signals, ...signals].slice(-1000),
  }, options);
}

// E7.4 — Failure -> tool-creation signal.
//
// The existing feedback loop turns founder decisions and run failures into FeedbackSignal records
// that revise an AgentCreationPolicy (better prompts, better rules). But some failures aren't a
// prompt problem — the SAME failure recurring is the tell of a MISSING CAPABILITY: the agent keeps
// re-deriving (and fluffing) a deterministic procedure it has no tool for. This export wires the
// feedback loop to the self-building loop: it folds repeated RunFailures into a stable signature
// (the E7.1 crystallization idea applied to error text) and, where one signature recurs past the
// threshold, emits a tool-creation suggestion rather than only revising a policy.
//
// It is purely additive and read-only over the signals — it proposes; the founder gate (tool-birth)
// still decides. A born tool is PROPOSED, never live.

// Collapse a failure's error text to a stable signature: lowercase, strip the volatile specifics
// (ids, quoted values, numbers, paths) so "failed to enrich Acme" and "failed to enrich Globex"
// share one signature, while "failed to enrich" and "failed to score" stay distinct.
function failureSignature(summary) {
  return String(summary || "")
    .toLowerCase()
    .replace(/"[^"]*"|'[^']*'/g, " ") // quoted concrete values
    .replace(/\b[0-9a-f]{6,}\b/g, " ") // ids / hashes
    .replace(/\d+/g, " ") // numbers
    .replace(/[\/\\][^\s]+/g, " ") // paths
    .replace(/[^a-z\s]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    .join(" ")
    .trim();
}

export function detectToolCreationSuggestions(signals = [], { threshold = 3 } = {}) {
  if (!Array.isArray(signals)) {
    throw new Error("detectToolCreationSuggestions requires an array of signals.");
  }
  if (!Number.isInteger(threshold) || threshold < 1) {
    throw new Error("threshold must be a positive integer.");
  }
  const buckets = new Map();
  for (const item of signals) {
    if (item?.type !== "RunFailure") continue; // only genuine failures point at a missing capability
    const signature = failureSignature(item.summary);
    if (!signature) continue;
    if (!buckets.has(signature)) buckets.set(signature, { signature, count: 0, sample: item });
    buckets.get(signature).count += 1;
  }
  return [...buckets.values()]
    .filter((bucket) => bucket.count >= threshold)
    .sort((a, b) => b.count - a.count || a.signature.localeCompare(b.signature))
    .map((bucket) => ({
      reason: `The same failure recurred ${bucket.count} times — a missing capability, not a prompt fix. Consider crystallizing a tool for: ${bucket.signature}.`,
      signature: bucket.signature,
      count: bucket.count,
    }));
}

export function recordFeedbackSignalsFromRun({ projectId = "default", graph, result } = {}, options = {}) {
  // Also bank the founder's gate decisions in the shared taste ledger both rigs read (HARNESS.md
  // invariant 4). Never let taste capture break the run.
  try {
    appendGateJudgments({ projectId, graph, result }, options);
  } catch {
    // capture is best-effort; a write failure must not interrupt feedback recording
  }
  const signals = normalizeRunFeedback({ projectId, graph, result });
  // Bank founder-feedback signals AND the action bookkeeping in the same ledger write, so the
  // crystallization detector sees the accumulated procedure history — but only `signals` (the founder
  // decisions) is returned and drives policy revision.
  const actionSignals = actionSignalsFromRun({ projectId, graph, result });
  const ledger = recordFeedbackSignals([...signals, ...actionSignals], { ...options, projectId });
  // Run the accumulated action history through the crystallization detector and surface any repeated
  // deterministic procedure as a GATED tool-creation suggestion (the same additive, proposal-only path
  // detectToolCreationSuggestions uses). Nothing is auto-created — the founder/operator gate (tool-birth)
  // still decides, and judgment work is excluded inside the detector by signature design.
  const crystallizationSuggestions = detectCrystallizationSuggestions(actionLogFromLedger(ledger));
  // Close the loop the audit found broken: each detected deterministic-procedure candidate becomes a
  // PENDING, gated tool-birth proposal (tool-birth.mjs). It is NOT registered and NOT callable —
  // registration happens only after a founder explicitly approves (Wave 2). The proposal is banked as
  // a typed ledger signal so it survives a restart, and de-duplicated by signature so a procedure that
  // keeps recurring across runs yields ONE pending proposal, not a fresh one every run.
  const { ledger: finalLedger, toolBirthProposals } = recordToolBirthProposals(
    ledger,
    crystallizationSuggestions,
    { ...options, projectId },
  );
  return { ledger: finalLedger, signals, crystallizationSuggestions, toolBirthProposals };
}

// Read every pending tool-birth proposal banked in a ledger (insertion order). A pending proposal is a
// detected crystallization candidate awaiting model-authored code+test and a founder gate; it is inert
// by construction. Exported so the live run paths (and tests) can surface the durable set.
export function pendingToolBirthProposals(ledger) {
  return (ledger?.signals ?? [])
    .filter((item) => item?.type === "ToolBirthProposal" && item.proposal)
    .map((item) => item.proposal);
}

// Turn freshly detected crystallization candidates into PENDING tool-birth proposals, bank the NEW
// ones (deduped by signature against what the ledger already holds) as typed signals, and return the
// full durable set. registerTool is never called here — a tool is born only after a founder approves.
function recordToolBirthProposals(ledger, crystallizationSuggestions, options = {}) {
  const existing = pendingToolBirthProposals(ledger);
  const seen = new Set(existing.map((proposal) => proposal.signature));
  const fresh = [];
  for (const suggestion of crystallizationSuggestions ?? []) {
    if (!suggestion?.signature || seen.has(suggestion.signature)) continue;
    seen.add(suggestion.signature);
    fresh.push(proposeToolBirthFromCandidate(suggestion));
  }
  if (!fresh.length) return { ledger, toolBirthProposals: existing };
  const finalLedger = recordFeedbackSignals(
    fresh.map((proposal) => signal({ projectId: options.projectId, type: "ToolBirthProposal", proposal })),
    options,
  );
  return { ledger: finalLedger, toolBirthProposals: pendingToolBirthProposals(finalLedger) };
}
