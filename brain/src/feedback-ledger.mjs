import crypto from "node:crypto";
import { appendGateJudgments } from "./shared-judgments.mjs";
import { persistence } from "./persistence.mjs";
import { extractIdeaTaste } from "./memory.mjs";
import { recordGateDecisionsIntoSouls } from "./soul-wiring.mjs";

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
// These live on the FEEDBACK rail: idea-taste is judgment, banked as taste signals memory.mjs folds
// back into the next ideation round.
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

export function recordFeedbackSignals(signals = [], options = {}) {
  const projectId = options.projectId || signals.find((item) => item.projectId)?.projectId || "default";
  if (!signals.length) return loadFeedbackLedger(projectId, options);
  const ledger = loadFeedbackLedger(projectId, options);
  return saveFeedbackLedger({
    ...ledger,
    signals: [...ledger.signals, ...signals].slice(-1000),
  }, options);
}

// Bank a run's founder-gate decisions as durable taste signals. The founder's accept/discard/edit
// choices at the gate are the learning signal that shapes the next run — nothing here sends or mutates
// a graph. Never let taste capture break the run.
export function recordFeedbackSignalsFromRun({ projectId = "default", graph, result } = {}, options = {}) {
  // Also bank the founder's gate decisions in the shared taste ledger both rigs read (HARNESS.md
  // invariant 4). Never let taste capture break the run.
  try {
    appendGateJudgments({ projectId, graph, result }, options);
  } catch {
    // capture is best-effort; a write failure must not interrupt feedback recording
  }
  // Fill each teammate's soul from the founder's gate decisions on the items IT produced. Best-effort:
  // a soul write must never interrupt feedback recording (same discipline as the shared-judgments bank).
  try {
    recordGateDecisionsIntoSouls({ projectId, result }, options);
  } catch {
    // soul capture is best-effort; a write failure must not interrupt feedback recording
  }
  const signals = normalizeRunFeedback({ projectId, graph, result });
  const ledger = recordFeedbackSignals(signals, { ...options, projectId });
  return { ledger, signals };
}
