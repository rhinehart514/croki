// Drainable per-Run worker coordination. One Run and one worktree mutate serially; unrelated Runs
// retain independent promise chains and may proceed concurrently. Durable layer receipts live in the
// Work journal, while this module owns only process-local queue mechanics.

import {
  persistRunJournalProjection,
  readRunJournalProjection,
  recordRunLayerReceipt,
  recordRunQuiescent,
} from "./work-journal-runtime.mjs";

const runs = new Map();
const resources = new Map();
const FOUNDER_RELEVANT_DEPTH = 7;
const FOUNDER_RELEVANT_WAIT_MS = 2_000;

function text(value) {
  return String(value ?? "").replace(/^run:/, "").trim() || null;
}

function stateFor(handle) {
  const runId = text(handle?.runId ?? handle?.runRef);
  if (!runId) throw new Error("A Run worker needs a runId.");
  if (!runs.has(runId)) {
    const durable = readRunJournalProjection({ ...handle, runId });
    runs.set(runId, {
      runId,
      handle: { ...handle, runId },
      tail: Promise.resolve(),
      pending: 0,
      queuedAt: [],
      receipts: new Map((durable?.layerReceipts ?? []).map((receipt) => [
        receipt.type,
        { status: receipt.status, artifactRefs: receipt.artifactRefs, error: receipt.error },
      ])),
    });
  }
  return runs.get(runId);
}

function safeTail(value) {
  return Promise.resolve(value).catch(() => {});
}

function enqueueMutation(state, operation, worktreeRef) {
  const resource = String(worktreeRef ?? "").trim() || null;
  const queuedAt = Date.now();
  state.pending += 1;
  state.queuedAt.push(queuedAt);
  const gates = [state.tail, ...(resource ? [resources.get(resource)] : [])].filter(Boolean).map(safeTail);
  const task = Promise.all(gates).then(async () => {
    try {
      return await operation();
    } finally {
      state.pending -= 1;
      const index = state.queuedAt.indexOf(queuedAt);
      if (index >= 0) state.queuedAt.splice(index, 1);
    }
  });
  state.tail = safeTail(task);
  if (resource) {
    const resourceTail = safeTail(task);
    resources.set(resource, resourceTail);
    resourceTail.finally(() => {
      if (resources.get(resource) === resourceTail) resources.delete(resource);
    });
  }
  return task;
}

export function enqueueRunLayer(handle, receiptType, operation, {
  worktreeRef = null,
  artifactRefs = null,
} = {}) {
  if (typeof operation !== "function") throw new TypeError("A Run worker layer needs an operation.");
  const state = stateFor(handle);
  return enqueueMutation(state, async () => {
    try {
      const value = await operation();
      const refs = typeof artifactRefs === "function" ? artifactRefs(value) : (artifactRefs ?? []);
      recordRunLayerReceipt(state.handle, receiptType, { status: "succeeded", artifactRefs: refs });
      state.receipts.set(receiptType, { status: "succeeded", artifactRefs: refs });
      return value;
    } catch (error) {
      recordRunLayerReceipt(state.handle, receiptType, { status: "failed", error });
      state.receipts.set(receiptType, { status: "failed", error });
      throw error;
    }
  }, worktreeRef);
}

export async function persistRunProjection(handle) {
  return enqueueRunLayer(handle, "projection-persisted", () => persistRunJournalProjection(handle), {
    artifactRefs: (projection) => [`work-projection:${projection.throughSequence}`],
  });
}

export function acknowledgeRunLayer(handle, receiptType, {
  status = "succeeded",
  artifactRefs = [],
  error = null,
  worktreeRef = null,
} = {}) {
  const state = stateFor(handle);
  return enqueueMutation(state, () => {
    recordRunLayerReceipt(state.handle, receiptType, { status, artifactRefs, error });
    state.receipts.set(receiptType, { status, artifactRefs, error });
    return state.receipts.get(receiptType);
  }, worktreeRef);
}

export async function drainRunWorker(runId) {
  const state = runs.get(text(runId));
  if (!state) return { runId: text(runId), pending: 0, receipts: [] };
  await state.tail;
  return workerSnapshot(state.runId);
}

export async function drainAllRunWorkers() {
  await Promise.all([...runs.values()].map((state) => state.tail));
  return [...runs.keys()].sort().map(workerSnapshot);
}

export async function settleRunQuiescence(handle, {
  requiredReceipts,
  reviewId = null,
  checkpointId = null,
} = {}) {
  const state = stateFor(handle);
  await state.tail;
  const failedReceipts = requiredReceipts.filter((type) => state.receipts.get(type)?.status !== "succeeded");
  recordRunQuiescent(state.handle, {
    requiredReceipts,
    failedReceipts,
    reviewId,
    checkpointId,
  });
  // Include quiescence and Review readiness in the durable projection before returning. The worker
  // has already drained, so this cannot overtake a same-Run mutation.
  persistRunJournalProjection(state.handle);
  state.receipts.set("run-quiescent", {
    status: failedReceipts.length ? "failed" : "succeeded",
  });
  return {
    runId: state.runId,
    ready: failedReceipts.length === 0,
    failedReceipts,
  };
}

function requiredReceipts(workspace) {
  return [
    "provider-settled",
    ...(workspace
      ? ["checkpoint-captured", "diff-finalized", "commands-settled", "verification-settled"]
      : []),
    "timeline-settled",
    "projection-persisted",
  ];
}

export async function settleRunWorker(handle, {
  workspace = null,
  runRef = null,
} = {}) {
  await persistRunProjection(handle);
  const checkpointId = workspace?.checkpoints
    ?.filter((checkpoint) => checkpoint.runRef === runRef)
    .at(-1)?.id ?? null;
  return settleRunQuiescence(handle, {
    requiredReceipts: requiredReceipts(workspace),
    reviewId: workspace ? `review:${workspace.id}` : null,
    checkpointId,
  });
}

export async function failRunWorker(handle, error, {
  workspace = null,
  runRef = null,
} = {}) {
  try {
    await enqueueRunLayer(handle, "timeline-settled", () => {
      throw error;
    }, { worktreeRef: workspace?.worktree });
  } catch {
    // The exact failed timeline receipt is the intended result; preserve the originating error.
  }
  return settleRunWorker(handle, { workspace, runRef });
}

export async function settleRunTimeline(handle, operation, {
  workspace = null,
  runRef = null,
  artifactRefs = null,
} = {}) {
  const settled = await enqueueRunLayer(handle, "timeline-settled", operation, {
    worktreeRef: workspace?.worktree,
    artifactRefs,
  });
  await settleRunWorker(handle, { workspace, runRef });
  return settled;
}

export function workerSnapshot(runId) {
  const state = runs.get(text(runId));
  if (!state) return { runId: text(runId), pending: 0, receipts: [], backpressure: null };
  const oldestWaitMs = state.queuedAt.length ? Math.max(0, Date.now() - Math.min(...state.queuedAt)) : 0;
  const founderRelevant = state.pending >= FOUNDER_RELEVANT_DEPTH || oldestWaitMs >= FOUNDER_RELEVANT_WAIT_MS;
  return {
    runId: state.runId,
    pending: state.pending,
    receipts: [...state.receipts].map(([type, receipt]) => ({ type, status: receipt.status })),
    backpressure: founderRelevant ? { pending: state.pending, oldestWaitMs } : null,
  };
}

export function __resetRunWorkers() {
  runs.clear();
  resources.clear();
}
