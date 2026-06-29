// E7.1 — Crystallization trigger.
//
// The self-building loop: when an agent re-derives the SAME deterministic procedure enough times,
// that procedure is worth codifying into a reusable tool. This module is pure detection — it reads
// a log of agent actions and reports which deterministic procedures have recurred past a threshold.
// It NEVER builds or runs anything; that is tool-birth's job (E7.2), and a born tool is always
// PROPOSED, never live.
//
// The cardinal exclusion: only DETERMINISTIC procedures crystallize. Pure-judgment actions —
// drafting an email, deciding to send, positioning a claim, ideating a channel — are the rented
// intelligence the host must never freeze into code. They are excluded BY SIGNATURE DESIGN: a
// judgment action's signature folds in its judgment-bearing payload (the actual draft text, the
// specific decision), so two judgment calls never collapse to the same signature and therefore can
// never reach the threshold. A deterministic procedure ("research operator X", "score lead Y")
// keeps only its verb + shape, so "research operator X" and "research operator Y" DO collapse.

// Verbs whose output is a judgment call, not a repeatable transform. These are the rented head; we
// keep them legible here rather than guess at runtime.
const JUDGMENT_VERBS = new Set([
  "draft",
  "decide",
  "approve",
  "reject",
  "ideate",
  "position",
  "propose",
  "write",
  "compose",
  "judge",
  "evaluate",
]);

function lower(value) {
  return String(value ?? "").trim().toLowerCase();
}

// Pull the leading verb out of a free-text operation name ("research operator Acme" -> "research").
function verbOf(action) {
  const explicit = lower(action?.verb);
  if (explicit) return explicit;
  const name = lower(action?.name || action?.operation || action?.type);
  return name.split(/\s+/)[0] || "";
}

export function isJudgmentAction(action) {
  return JUDGMENT_VERBS.has(verbOf(action));
}

// Produce a stable signature for an action. Two actions share a signature iff they are the same
// deterministic PROCEDURE applied to different concrete inputs. The signature deliberately strips
// the concrete argument VALUES (so "research operator X" === "research operator Y") but keeps the
// verb and the argument SHAPE (the sorted parameter keys), so "research operator" and "score lead"
// stay distinct.
//
// Judgment actions are stamped with a unique "judgment:" signature folding in their payload, so they
// can never collapse to a count >= threshold — that is how the deterministic-only guard is enforced.
export function normalizeProcedure(action) {
  if (action == null) return "judgment:empty";
  if (typeof action === "string") {
    // A bare string is treated as a verb phrase: keep the verb, drop the trailing concrete noun.
    const verb = lower(action).split(/\s+/)[0] || "unknown";
    if (JUDGMENT_VERBS.has(verb)) return `judgment:${lower(action)}`;
    return `proc:${verb}`;
  }

  if (action.signature && typeof action.signature === "string") {
    // An explicit signature is honored — but a judgment verb still forces the judgment namespace so
    // the exclusion can never be bypassed by a hand-set signature.
    return isJudgmentAction(action) ? `judgment:${action.signature}` : action.signature;
  }

  const verb = verbOf(action) || "unknown";

  if (JUDGMENT_VERBS.has(verb)) {
    // Fold the judgment-bearing payload into the signature so two judgment calls never match.
    const payload = action.draft ?? action.decision ?? action.text ?? action.name ?? "";
    return `judgment:${verb}:${lower(payload)}`;
  }

  // Deterministic: keep verb + argument SHAPE (sorted keys), drop the concrete values.
  const args = action.args && typeof action.args === "object" && !Array.isArray(action.args)
    ? Object.keys(action.args).map(lower).filter(Boolean).sort()
    : [];
  const target = lower(action.targetType || action.objectType); // e.g. "operator", "lead"
  const shape = [verb, target, ...args].filter(Boolean).join(":");
  return `proc:${shape}`;
}

// Detect deterministic procedures that recurred >= threshold times. Returns candidates sorted by
// count (most-repeated first), each carrying a representative sample of the action that produced it.
export function detectCrystallizationCandidates(actionLog = [], { threshold = 3 } = {}) {
  if (!Array.isArray(actionLog)) {
    throw new Error("detectCrystallizationCandidates requires an array action log.");
  }
  if (!Number.isInteger(threshold) || threshold < 1) {
    throw new Error("threshold must be a positive integer.");
  }

  const buckets = new Map();
  for (const action of actionLog) {
    const signature = normalizeProcedure(action);
    // Judgment actions are excluded by signature design — they never bucket toward a candidate.
    if (signature.startsWith("judgment:")) continue;
    if (!buckets.has(signature)) buckets.set(signature, { signature, count: 0, sample: action });
    buckets.get(signature).count += 1;
  }

  return [...buckets.values()]
    .filter((bucket) => bucket.count >= threshold)
    .sort((a, b) => b.count - a.count || a.signature.localeCompare(b.signature));
}

// E7.1 wiring — turn one run's executed nodes into action-log records so the crystallization detector
// has something to bucket ACROSS runs. A node's verb is its label (or category) — the thing the step
// actually DID ("research operator", "score lead"). Gate, resource, and context nodes are skipped:
// they are the wall and the grounding, not repeatable transforms worth a tool. Judgment is NOT filtered
// here — the detector excludes it by signature design, and folding the node label keeps that working
// (a "draft …" node lands in the judgment namespace and can never reach a candidate).
const NON_ACTION_CATEGORIES = new Set(["gate", "resource", "context"]);

export function actionLogFromRun(graph, result) {
  const nodes = result?.nodes ?? {};
  const byId = new Map((graph?.nodes ?? []).map((node) => [node.id, node]));
  const log = [];
  for (const [nodeId, nodeResult] of Object.entries(nodes)) {
    const category = nodeResult?.category ?? byId.get(nodeId)?.category;
    if (NON_ACTION_CATEGORIES.has(category)) continue;
    // A blocked/blind node never actually ran a procedure, so it is not an action.
    if (nodeResult?.blocked || nodeResult?.blind) continue;
    const node = byId.get(nodeId);
    const name = node?.label || nodeResult?.label || category || "";
    if (!name) continue;
    log.push({ name, targetType: category ?? null, nodeId });
  }
  return log;
}

// Mirror of detectToolCreationSuggestions (in feedback-ledger): run an accumulated action log through
// the pure detector and shape each candidate into a gated tool-creation SUGGESTION. It proposes; the
// founder gate (tool-birth) still decides, and a born tool is PROPOSED, never live. Judgment work never
// reaches here — it is excluded inside detectCrystallizationCandidates by signature design.
export function detectCrystallizationSuggestions(actionLog = [], options = {}) {
  return detectCrystallizationCandidates(actionLog, options).map((candidate) => ({
    reason: `The same deterministic procedure recurred ${candidate.count} times — worth crystallizing into a reusable tool: ${candidate.signature}.`,
    signature: candidate.signature,
    count: candidate.count,
    sample: candidate.sample,
  }));
}
