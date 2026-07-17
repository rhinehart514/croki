// Pure Run constructors for the canonical semantic model. A Run is the semantic join for one drive: it
// references a thread, zero or more bets, and the durable event/work/decision/outcome records a real drive
// produced. It never carries running state and never copies those authoritative records. Drives can be
// betless, multi-bet, or nested, so a single bet is never assumed. This module imports nothing from
// persistence, UI, routes, or providers.

function text(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function fail(message, code = "run_invalid", status = 400) {
  throw Object.assign(new Error(message), { code, status });
}

function refs(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))];
}

function typedRefs(values, prefix, label) {
  const list = refs(values);
  for (const ref of list) if (!ref.startsWith(prefix)) fail(`${label} must be ${prefix} references.`);
  return list;
}

function optionalTyped(value, prefix, label) {
  const ref = text(value);
  if (!ref) return null;
  if (!ref.startsWith(prefix)) fail(`${label} must be a ${prefix} reference.`);
  return ref;
}

export function createRun({
  id,
  threadRef,
  betRefs = [],
  betRef = null,
  originMessageRef = null,
  parentRunRef = null,
  scopeRefs = [],
  participantRefs = [],
  workflowContractRef = null,
  eventRefs = [],
  workRefs = [],
  decisionRefs = [],
  outcomeRefs = [],
  modelRevision = null,
  properties = {},
  createdAt = null,
  completedAt = null,
} = {}) {
  if (!text(id)) fail("A run needs an id.");
  const thread = text(threadRef);
  if (!thread || !thread.startsWith("thread:")) fail("A run needs a threadRef.");
  const parent = optionalTyped(parentRunRef, "run:", "A run parentRunRef");
  if (parent && parent === `run:${text(id)}`) fail("A run cannot reference itself as its parent.");
  const record = {
    id: text(id),
    threadRef: thread,
    betRefs: typedRefs(betRefs, "bet:", "A run betRefs"),
    eventRefs: typedRefs(eventRefs, "event:", "A run eventRefs"),
    workRefs: typedRefs(workRefs, "work:", "A run workRefs"),
    decisionRefs: typedRefs(decisionRefs, "decision:", "A run decisionRefs"),
    outcomeRefs: typedRefs(outcomeRefs, "outcome:", "A run outcomeRefs"),
    scopeRefs: refs(scopeRefs),
    participantRefs: refs(participantRefs),
    properties: properties && typeof properties === "object" ? structuredClone(properties) : {},
    modelRevision: Number.isInteger(modelRevision) ? modelRevision : null,
    createdAt: createdAt ?? null,
    completedAt: completedAt ?? null,
  };
  const legacyBet = optionalTyped(betRef, "bet:", "A run betRef");
  if (legacyBet) record.betRef = legacyBet;
  const origin = optionalTyped(originMessageRef, "conversation:", "A run originMessageRef");
  if (origin) record.originMessageRef = origin;
  if (parent) record.parentRunRef = parent;
  const contract = optionalTyped(workflowContractRef, "workflow-contract:", "A run workflowContractRef");
  if (contract) record.workflowContractRef = contract;
  return record;
}

// Attach a terminal completion timestamp and any durable outcome/decision references settled by the drive.
// The run still holds no running status — completion is a timestamp plus durable joins, never live state.
export function completeRun(run, { at = null, outcomeRefs = [], decisionRefs = [] } = {}) {
  if (!run || typeof run !== "object") fail("Completing a run needs a run record.");
  const next = structuredClone(run);
  next.outcomeRefs = typedRefs([...(next.outcomeRefs ?? []), ...outcomeRefs], "outcome:", "A run outcomeRefs");
  next.decisionRefs = typedRefs([...(next.decisionRefs ?? []), ...decisionRefs], "decision:", "A run decisionRefs");
  next.completedAt = at ?? next.completedAt ?? null;
  return next;
}
