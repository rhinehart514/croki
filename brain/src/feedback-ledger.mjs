import crypto from "node:crypto";
import fs from "node:fs";
import { appendGateJudgments, sharedJudgmentsPath } from "./shared-judgments.mjs";
import { persistence } from "./persistence.mjs";
import { draftKey, extractIdeaTaste } from "./memory.mjs";
import { recordGateDecisionsIntoSouls } from "./soul-wiring.mjs";
import { now, safeId } from "./store-fs.mjs";

const SCHEMA_VERSION = 1;
const COLLECTION = "feedback-ledger";

function emptyLedger(projectId) {
  return { schemaVersion: SCHEMA_VERSION, projectId, signals: [], decisions: [] };
}

function trimOrNull(value) { const text = String(value ?? "").trim(); return text || null; }

function normalizeRefs(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  return list.flatMap((raw) => {
    if (!raw) return [];
    const ref = typeof raw === "string"
      ? { type: null, id: trimOrNull(raw) }
      : { type: trimOrNull(raw.type ?? raw.kind), id: trimOrNull(raw.id ?? raw.ref) };
    if (!ref.id) return [];
    const key = `${ref.type ?? ""}:${ref.id}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [ref];
  });
}

function stableDecisionId(projectId, sourceRef) {
  const hash = crypto.createHash("sha256")
    .update(`${projectId}\u0000${sourceRef?.type ?? "source"}\u0000${sourceRef?.id ?? ""}`)
    .digest("hex").slice(0, 20);
  return `decision-${hash}`;
}

function jsonKey(value) { try { return JSON.stringify(value); } catch { return String(value); } }

function normalizeDecisionReceipt(input = {}, { projectId = "default", legacy = null } = {}) {
  const scopedProjectId = trimOrNull(input.projectId) ?? projectId;
  const kind = trimOrNull(input.kind);
  if (!kind) throw new Error("A founder decision receipt needs a kind.");
  const valueKey = ["value", "wording", "selectedValue", "decision"]
    .find((key) => Object.prototype.hasOwnProperty.call(input, key));
  if (!valueKey) throw new Error("A founder decision receipt needs the founder's wording or selected value.");
  const sourceRef = normalizeRefs(input.sourceRef ? [input.sourceRef] : [])[0] ?? null;
  const explicitId = trimOrNull(input.id);
  if (!explicitId && !sourceRef) throw new Error("A founder decision receipt needs a stable sourceRef or explicit id.");
  const contextRefs = normalizeRefs([...(input.contextRefs ?? []), ...(sourceRef ? [sourceRef] : [])]);
  const participantRefs = normalizeRefs(input.participantRefs);
  const evidenceRefs = normalizeRefs(input.evidenceRefs);
  const productRefs = normalizeRefs(input.productRefs);
  return {
    id: explicitId ?? stableDecisionId(scopedProjectId, sourceRef),
    projectId: scopedProjectId,
    kind,
    value: input[valueKey],
    contextRefs,
    createdAt: input.createdAt || now(),
    ...(sourceRef ? { sourceRef } : {}),
    ...(trimOrNull(input.supersedesId) ? { supersedesId: trimOrNull(input.supersedesId) } : {}),
    questionId: trimOrNull(input.questionId),
    ...(trimOrNull(input.sourceOutcomeId) ? { sourceOutcomeId: trimOrNull(input.sourceOutcomeId) } : {}),
    ...(trimOrNull(input.disposition) ? { disposition: trimOrNull(input.disposition) } : {}),
    participantRefs,
    evidenceRefs,
    productRefs,
    ...(legacy ? { compatibility: { source: legacy, synthesized: true } } : {}),
  };
}

function semanticKey(receipt) {
  const runId = receipt.contextRefs?.find((ref) => ref.type === "run")?.id ?? "";
  return `${receipt.projectId}\u0000${receipt.kind}\u0000${runId}\u0000${jsonKey(receipt.value)}`;
}

function receiptFromSignal(projectId, item) {
  const kinds = { FounderApproval: "gate.approved", FounderRejection: "gate.rejected", FounderEdit: "gate.edited", IdeaKill: "idea.killed", IdeaKeep: "idea.kept" };
  if (!kinds[item?.type] || !item?.id) return null;
  return normalizeDecisionReceipt({
    id: item.decisionId || undefined,
    projectId,
    kind: kinds[item.type],
    value: Object.prototype.hasOwnProperty.call(item, "decisionValue") ? item.decisionValue : item.summary,
    sourceRef: { type: "feedback-signal", id: item.decisionId ?? item.id },
    contextRefs: [
      item.graphId ? { type: "graph", id: item.graphId } : null,
      item.runId ? { type: "run", id: item.runId } : null,
      item.nodeId ? { type: "gate-node", id: item.nodeId } : null,
      item.itemId ? { type: "gate-item", id: item.itemId } : null,
      item.ideaId ? { type: "idea", id: item.ideaId } : null,
    ].filter(Boolean),
    createdAt: item.observedAt,
    questionId: item.questionId,
    participantRefs: item.participantRefs,
    evidenceRefs: item.evidenceRefs,
    productRefs: item.productRefs,
  }, { projectId, legacy: "feedback-signal" });
}

function receiptFromShared(projectId, item) {
  const status = trimOrNull(item.status);
  const value = status === "edited" && item.editedFrom
    ? { from: item.editedFrom, to: item.draft }
    : (Object.prototype.hasOwnProperty.call(item, "draft") ? item.draft : item.picked);
  if (value == null) return null;
  return normalizeDecisionReceipt({
    id: item.decisionId || undefined,
    projectId,
    kind: status ? `gate.${status}` : "founder.choice",
    value,
    sourceRef: { type: "shared-judgment", id: item.decisionId ?? item.id ?? `line-${item._line}` },
    contextRefs: [
      item.graphId ? { type: "graph", id: item.graphId } : null,
      item.session ? { type: "run", id: item.session } : null,
    ].filter(Boolean),
    createdAt: item.ts,
    questionId: item.questionId,
  }, { projectId, legacy: "shared-judgment" });
}

function loadSharedJudgmentsForProject(projectId, options) {
  let raw;
  try { raw = fs.readFileSync(sharedJudgmentsPath(options), "utf8"); }
  catch { return []; }
  const wanted = String(projectId);
  return raw.split("\n").flatMap((line, index) => {
    const text = line.trim();
    if (!text) return [];
    let record;
    try { record = JSON.parse(text); } catch { return []; }
    if (String(record?.project ?? "") !== wanted) return [];
    return [{ ...record, _line: index + 1 }];
  });
}

function withCompatibilityReceipts(ledger, options) {
  const stored = Array.isArray(ledger.decisions) ? ledger.decisions.map((receipt) => ({
    ...receipt,
    questionId: trimOrNull(receipt?.questionId),
    contextRefs: normalizeRefs(receipt?.contextRefs),
    participantRefs: normalizeRefs(receipt?.participantRefs),
    evidenceRefs: normalizeRefs(receipt?.evidenceRefs),
    productRefs: normalizeRefs(receipt?.productRefs),
  })) : [];
  const ids = new Set(stored.map((item) => item?.id).filter(Boolean));
  const authoritativeSemantics = new Set(stored.map(semanticKey));
  const signalReceipts = (ledger.signals ?? [])
    .map((item) => { try { return receiptFromSignal(ledger.projectId, item); } catch { return null; } })
    .filter(Boolean);
  const signalSemantics = new Set(signalReceipts.map(semanticKey));
  const sharedReceipts = loadSharedJudgmentsForProject(ledger.projectId, options)
    .map((item) => { try { return receiptFromShared(ledger.projectId, item); } catch { return null; } })
    .filter(Boolean);
  const decisions = [...stored];
  // Distinct legacy feedback signals keep distinct source ids even when their selected value matches.
  for (const receipt of signalReceipts) {
    if (ids.has(receipt.id) || authoritativeSemantics.has(semanticKey(receipt))) continue;
    ids.add(receipt.id); decisions.push(receipt);
  }
  // The shared notebook mirrors gate feedback but old rows lack item ids. Suppress only a semantic
  // mirror already represented by the authoritative partition or feedback source; preserve distinct
  // shared rows otherwise.
  for (const receipt of sharedReceipts) {
    if (ids.has(receipt.id) || authoritativeSemantics.has(semanticKey(receipt)) || signalSemantics.has(semanticKey(receipt))) continue;
    ids.add(receipt.id); decisions.push(receipt);
  }
  return { ...ledger, decisions };
}

export function loadFeedbackLedger(projectId = "default", options = {}) {
  const stored = persistence(options).get(COLLECTION, safeId(projectId));
  if (!stored) return withCompatibilityReceipts(emptyLedger(projectId), options);
  return withCompatibilityReceipts({
    ...emptyLedger(projectId),
    ...stored,
    schemaVersion: SCHEMA_VERSION,
    projectId,
    signals: Array.isArray(stored?.signals) ? stored.signals : [],
    decisions: Array.isArray(stored?.decisions) ? stored.decisions : [],
  }, options);
}

export function saveFeedbackLedger(ledger, options = {}) {
  const durable = {
    ...ledger,
    schemaVersion: SCHEMA_VERSION,
    signals: Array.isArray(ledger.signals) ? ledger.signals : [],
    decisions: Array.isArray(ledger.decisions) ? ledger.decisions : [],
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

// Append-only founder call inside the existing feedback authority. Reusing a sourceRef is an
// idempotent retry; changing that call requires a new receipt with supersedesId.
export function recordFounderDecision(input = {}, options = {}) {
  const projectId = trimOrNull(input.projectId) ?? trimOrNull(options.projectId) ?? "default";
  const ledger = loadFeedbackLedger(projectId, options);
  const receipt = normalizeDecisionReceipt(input, { projectId });
  if (receipt.projectId !== projectId) throw new Error(`Founder decision belongs to project ${receipt.projectId}, not ${projectId}.`);
  if (receipt.supersedesId) {
    if (!ledger.decisions.some((item) => item.id === receipt.supersedesId)) {
      throw new Error(`Superseded founder decision not found in project ${projectId}: ${receipt.supersedesId}`);
    }
    if (receipt.supersedesId === receipt.id) throw new Error("A founder decision correction needs a new receipt id.");
  }
  const existing = ledger.decisions.find((item) => item.id === receipt.id);
  if (existing) {
    const same = existing.kind === receipt.kind && jsonKey(existing.value) === jsonKey(receipt.value)
      && (existing.supersedesId ?? null) === (receipt.supersedesId ?? null);
    if (!same) throw new Error(`Founder decision receipt ${receipt.id} already exists; append a correction with supersedesId.`);
    return { ledger, receipt: existing, appended: false };
  }
  const saved = saveFeedbackLedger({ ...ledger, decisions: [...ledger.decisions, receipt] }, options);
  return { ledger: saved, receipt, appended: true };
}

export function correctFounderDecision(projectId, supersedesId, input = {}, options = {}) {
  return recordFounderDecision({ ...input, projectId, supersedesId }, { ...options, projectId });
}

export function loadFounderDecisions(projectId = "default", options = {}) {
  return loadFeedbackLedger(projectId, options).decisions;
}

function gateDecisionDescriptor({ projectId, graph, result, nodeId, nodeResult, item, index }) {
  const status = item?.approvalStatus;
  if (status !== "approved" && status !== "rejected") return null;
  const edited = status === "approved" && item.editedFrom != null;
  const runId = result?.runId ?? null;
  const graphId = graph?.id ?? result?.graphId ?? null;
  const itemIdentity = trimOrNull(item?.id) ?? trimOrNull(draftKey(item)) ?? `item-${index}`;
  const sourceRef = { type: "gate-decision", id: `${runId || graphId || "unknown-run"}:${nodeId}:${itemIdentity}` };
  const questionId = trimOrNull(item?.questionId ?? nodeResult?.questionId ?? result?.questionId ?? graph?.questionId);
  const participantRefs = normalizeRefs([
    ...(result?.participantRefs ?? []), ...(item?.participantRefs ?? []), item?.agentRef,
  ]);
  const evidenceRefs = normalizeRefs([...(result?.evidenceRefs ?? []), ...(item?.evidenceRefs ?? [])]);
  const productRefs = normalizeRefs([...(result?.productRefs ?? []), ...(item?.productRefs ?? [])]);
  const value = edited ? { from: String(item.editedFrom), to: String(item.draft ?? "") }
    : String(item?.draft ?? item?.name ?? (status === "approved" ? "Approved gated item" : "Rejected gated item"));
  const receipt = normalizeDecisionReceipt({
    projectId,
    kind: edited ? "gate.edited" : `gate.${status}`,
    value,
    sourceRef,
    contextRefs: [
      graphId ? { type: "graph", id: graphId } : null,
      runId ? { type: "run", id: runId } : null,
      { type: "gate-node", id: nodeId },
      { type: "gate-item", id: itemIdentity },
      item?.agentRef ? { type: "teammate", id: item.agentRef } : null,
      questionId ? { type: "question", id: questionId } : null,
    ].filter(Boolean),
    createdAt: result?.completedAt ?? result?.updatedAt ?? undefined,
    questionId,
    participantRefs,
    evidenceRefs,
    productRefs,
  }, { projectId });
  return { receipt, value, questionId, participantRefs, evidenceRefs, productRefs };
}

export function normalizeRunDecisionReceipts({ projectId = "default", graph, result } = {}) {
  const receipts = [];
  for (const [nodeId, nodeResult] of Object.entries(result?.nodes ?? {})) {
    if (nodeResult?.category !== "gate") continue;
    for (const [index, item] of (nodeResult.items ?? []).entries()) {
      const descriptor = gateDecisionDescriptor({ projectId, graph, result, nodeId, nodeResult, item, index });
      if (descriptor) receipts.push(descriptor.receipt);
    }
  }
  return receipts;
}

export function normalizeRunFeedback({ projectId = "default", graph, result } = {}) {
  const signals = [];
  const nodes = result?.nodes ?? {};
  for (const [nodeId, nodeResult] of Object.entries(nodes)) {
    if (nodeResult?.category === "gate") {
      for (const [index, item] of (nodeResult.items ?? []).entries()) {
        const descriptor = gateDecisionDescriptor({ projectId, graph, result, nodeId, nodeResult, item, index });
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
            decisionId: descriptor?.receipt.id ?? null,
            decisionValue: descriptor?.value,
            questionId: descriptor?.questionId ?? null,
            participantRefs: descriptor?.participantRefs ?? [],
            evidenceRefs: descriptor?.evidenceRefs ?? [],
            productRefs: descriptor?.productRefs ?? [],
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
            decisionId: descriptor?.receipt.id ?? null,
            decisionValue: descriptor?.value,
            questionId: descriptor?.questionId ?? null,
            participantRefs: descriptor?.participantRefs ?? [],
            evidenceRefs: descriptor?.evidenceRefs ?? [],
            productRefs: descriptor?.productRefs ?? [],
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
  const current = loadFeedbackLedger(projectId, options);
  const receipts = signals.map((item) => normalizeDecisionReceipt({
    projectId,
    kind: item.type === "IdeaKill" ? "idea.killed" : "idea.kept",
    value: item.summary,
    sourceRef: { type: "feedback-signal", id: item.id },
    contextRefs: item.ideaId ? [{ type: "idea", id: item.ideaId }] : [],
    createdAt: item.observedAt,
  }, { projectId }));
  const existingIds = new Set(current.decisions.map((item) => item.id));
  const ledger = saveFeedbackLedger({
    ...current,
    signals: [...current.signals, ...signals].slice(-1000),
    decisions: [...current.decisions, ...receipts.filter((item) => !existingIds.has(item.id))],
  }, options);
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
  const signals = normalizeRunFeedback({ projectId, graph, result });
  const decisions = normalizeRunDecisionReceipts({ projectId, graph, result });
  let ledger;
  try {
    const current = loadFeedbackLedger(projectId, options);
    const existingIds = new Set(current.decisions.map((item) => item.id));
    ledger = saveFeedbackLedger({
      ...current,
      signals: [...current.signals, ...signals].slice(-1000),
      decisions: [...current.decisions, ...decisions.filter((item) => !existingIds.has(item.id))],
    }, options);
  } catch {
    ledger = loadFeedbackLedger(projectId, options);
  }
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
  return { ledger, signals, decisions };
}
