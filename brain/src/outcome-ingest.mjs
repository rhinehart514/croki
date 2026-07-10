// Phase 5 — Outcome store + join (GTM-ENGINE-REBUILD §4, Phase 5).
//
// Phase 4 staged a Run whose every item carries a durable joinKey (minted by the run store) so a real
// outcome can find its exact origin. This module closes that loop: it INGESTS an outcome from any of
// the three sources (a connected account, a product usage event, or a founder-entered note), JOINS it
// on that one key back to the run + item that produced it, records a Result tied to
// run/path/asset/message/channel/buyer/offer, and — for every Result — writes a Learning record.
// It also reads the ledger back out HONESTLY: an item with no outcome is reported as unmeasured, never
// papered over with a fake number.
//
// The invariants this file holds (§2):
//   - Deterministic code (§2.4). The join, the tie resolution, the aggregation, and the plain-language
//     readback are all plain functions over stored records. There is no model call anywhere here —
//     joining an outcome to its run is a lookup, not a judgment.
//   - Open shapes (§2.2). Source labels and outcomeKinds are OPEN strings; a source or outcome kind
//     that did not exist yesterday ingests without being rejected. Nothing is validated against a
//     closed enum.
//   - Honest measurement (Phase 5 guard). Unmeasured is shown as unmeasured. No conversion rate is
//     invented, no success is declared from free-text criteria a function cannot evaluate; the report
//     carries the real counts and lets the founder read which path actually produced outcomes.
//   - The wall is untouched (§2.1). Ingesting an outcome records what ALREADY happened; it never sends,
//     publishes, charges, or runs anything.
//
// Every Result also writes a Learning (§2.8): the structural signal (channel, outcome kind + value)
// stays physically separate from the identifying text (path, offer, message), so a later cross-company
// pool can strip PII at the write boundary. No aggregation across companies is performed here.

import {
  runStore,
  resultStore,
  learningStore,
  gtmPathStore,
  productImplicationProjection,
} from "./gtm-store.mjs";
import { closeOutcomeLoop } from "./object-graph-projection.mjs";
import { recordOutcomeIntoSoul } from "./soul-wiring.mjs";
import { deriveMotionKind } from "./engine.mjs";
import { getProjectChannels, loadProject, loadProjectRuns } from "./project-store.mjs";
import { loadFlow } from "./flow-store.mjs";

// The three canonical sources an outcome can arrive from. These are NAMES, not a gate — a source label
// is an open string (§2.2); ingestion accepts any label. These exist so callers spell the common three
// the same way, not to reject a fourth.
export const OUTCOME_SOURCES = {
  connectedAccount: "connected-account",
  productEvent: "product-event",
  founderEntered: "founder-entered",
};

function trimOrNull(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

// ── The join ─────────────────────────────────────────────────────────────────────────────────────
// One key. Every staged run item carries a durable joinKey; an outcome carries the same key. The join
// is a lookup of the item whose joinKey matches — deterministic code, never a model call. Returns the
// { run, item } the outcome came from, or null when the key matches nothing staged (an honest miss, not
// an error). Runs may be passed in so a batch reuses one store read instead of re-listing per outcome.
export function joinToRun({ joinKey, runs }) {
  const key = trimOrNull(joinKey);
  if (!key) return null;
  for (const run of Array.isArray(runs) ? runs : []) {
    for (const item of Array.isArray(run?.items) ? run.items : []) {
      if (trimOrNull(item?.joinKey) === key) return { run, item };
    }
  }
  return null;
}

// Project live flow-store receipts into the same joinable run shape as compiled gtm-store runs. Items
// are merged by joinKey across gate/execute node receipts so the final delivery fields win without
// duplicating one execution. Approval stamps remain lineage only; they never become outcomes.
export function projectFlowRunReceipts(flowRuns = []) {
  const projected = (Array.isArray(flowRuns) ? flowRuns : []).flatMap((receipt) => {
    const result = receipt?.result ?? {};
    const byJoinKey = new Map();
    for (const nodeResult of Object.values(result.nodes ?? {})) {
      for (const item of Array.isArray(nodeResult?.items) ? nodeResult.items : []) {
        const key = trimOrNull(item?.joinKey);
        if (!key) continue;
        byJoinKey.set(key, { ...(byJoinKey.get(key) ?? {}), ...item });
      }
    }
    if (!byJoinKey.size) return [];
    const snapshot = receipt.graphSnapshot ?? {};
    const executionRunId = trimOrNull(result.runId) ?? trimOrNull(receipt.id);
    const pendingGates = Array.isArray(receipt.pendingGates)
      ? receipt.pendingGates
      : (Array.isArray(result.pendingGates) ? result.pendingGates : []);
    return [{
      id: executionRunId,
      executionRunId,
      pathId: trimOrNull(result.graphId),
      questionId: trimOrNull(receipt.questionId ?? result.questionId ?? result.workContext?.questionId ?? snapshot.questionId),
      participantRefs: receipt.participantRefs ?? result.participantRefs
        ?? result.workContext?.participantRefs ?? snapshot.participantRefs ?? [],
      productRefs: receipt.productRefs ?? result.productRefs
        ?? result.workContext?.productRefs ?? snapshot.productRefs ?? [],
      decisionRef: receipt.decisionRef ?? result.decisionRef ?? null,
      steps: Array.isArray(snapshot.nodes) ? snapshot.nodes : [],
      edges: Array.isArray(snapshot.edges) ? snapshot.edges : [],
      items: [...byJoinKey.values()],
      sourceStore: "flow",
      completed: pendingGates.length === 0 && result.ok !== false,
      receiptAt: receipt.createdAt ?? result.completedAt ?? result.updatedAt ?? null,
    }];
  });
  // A joinKey can appear first on a pre-gate receipt and later on the completed resume. Completed
  // executions win over pending ones; ties choose the latest receipt, then id, so selection is stable.
  return projected.sort((a, b) =>
    Number(b.completed) - Number(a.completed)
    || String(b.receiptAt ?? "").localeCompare(String(a.receiptAt ?? ""))
    || String(b.executionRunId ?? "").localeCompare(String(a.executionRunId ?? "")));
}

function reconciledOutcomeRuns(projectId, options = {}) {
  const compiledRuns = runStore.list({ ...options, projectId });
  let flowRuns = [];
  try {
    flowRuns = projectFlowRunReceipts(loadProjectRuns(projectId, options));
  } catch {
    flowRuns = [];
  }
  // Compiled Runs remain the durable owner where both stores carry the same item. Flow-only items are
  // added once, from the completed/latest receipt selected by the ordering above.
  const seenJoinKeys = new Set(compiledRuns.flatMap((run) =>
    (run.items ?? []).map((item) => trimOrNull(item?.joinKey)).filter(Boolean)));
  const flowOnlyRuns = [];
  for (const run of flowRuns) {
    const items = (run.items ?? []).filter((item) => {
      const key = trimOrNull(item?.joinKey);
      if (!key || seenJoinKeys.has(key)) return false;
      seenJoinKeys.add(key);
      return true;
    });
    if (items.length) flowOnlyRuns.push({ ...run, items });
  }
  return { compiledRuns, flowRuns, runs: [...compiledRuns, ...flowOnlyRuns] };
}

function joinStoredExecution({ joinKey, projectId, options }) {
  const { compiledRuns, flowRuns } = reconciledOutcomeRuns(projectId, options);
  const compiled = joinToRun({ joinKey, runs: compiledRuns });
  const live = joinToRun({ joinKey, runs: flowRuns });
  if (!compiled && !live) return null;
  if (!compiled) return live;
  if (!live) return compiled;
  return {
    run: {
      ...live.run,
      ...compiled.run,
      executionRunId: live.run.executionRunId ?? live.run.id,
      steps: live.run.steps?.length ? live.run.steps : compiled.run.steps,
      edges: live.run.edges?.length ? live.run.edges : compiled.run.edges,
    },
    item: { ...compiled.item, ...live.item },
  };
}

// ── The motion dimension (GTM-MACHINE.md Area 7) ───────────────────────────────────────────────────
// Every Result carries ONE keying dimension: which motion earned it. It is DERIVED, never typed — from
// the joined run's own graph shape, reusing engine.deriveMotionKind (the same shape-derivation the engine
// already uses to name a motion), so two runs of the same-shaped motion key to one row and a novel shape
// keys to its own. The run stores its compiled topology (`steps` = nodes, `edges` = wiring), so the shape
// reconstructs from the run itself — no store re-read. `motionRef` is the stable per-motion ref: the run's
// pathId (the motion's durable identity across its runs). An outcome that joined to no run → both null,
// honestly unattributed. An explicit stamp on the outcome always overrides the derivation.
function deriveMotionForRun(run) {
  if (!run) return { motionKind: null, motionRef: null };
  const graph = { nodes: Array.isArray(run.steps) ? run.steps : [], edges: Array.isArray(run.edges) ? run.edges : [] };
  return {
    motionKind: deriveMotionKind(graph),
    motionRef: trimOrNull(run.pathId) ?? trimOrNull(run.id),
  };
}

// ── The Learning write ───────────────────────────────────────────────────────────────────────────
// For a Result, split the signal at the boundary the cross-company schema needs (§2.8): the STRUCTURAL
// half (channel, and the outcome kind + value, with whether it even joined) is non-identifying and safe
// to pool later; the IDENTIFYING half (the path, its market-object refs, the offer, the exact message)
// is company-specific and dropped at any future pooling boundary. Resolving the path is a best-effort
// read purely for the identifying refs — a missing path never blocks capturing the learning.
function writeLearningForResult({ result, run, item, projectId, options }) {
  const pathId = trimOrNull(result.pathId);
  let path = null;
  if (pathId) {
    try {
      path = gtmPathStore.get(pathId, { ...options, projectId });
    } catch {
      path = null;
    }
  }
  // Only the refs to market objects the bet rests on — a structural pointer set, not customer text.
  const marketObjectRefs = (Array.isArray(path?.restsOn) ? path.restsOn : []).filter((ref) =>
    String(ref?.type ?? "").toLowerCase().includes("market"),
  );

  return learningStore.create(
    {
      projectId,
      structural: {
        // No product-shape signal is available at ingest time; an honest null, never a guessed shape.
        productShape: null,
        runType: trimOrNull(run?.status) ? "gtm-path-run" : null,
        channel: result.channel,
        // Outcome kind + numeric value + whether it joined: a shape and a number, no customer text.
        result: {
          outcomeKind: result.outcomeKind ?? null,
          value: result.value ?? null,
          joined: Boolean(run),
        },
        promotionDecision: null,
      },
      identifying: {
        sourceResultId: result.id,
        pathId,
        marketObjectRefs,
        offer: result.offerRef ?? trimOrNull(path?.bet?.offer),
        message: trimOrNull(item?.message ?? item?.draft),
        questionId: result.questionId,
        productRefs: result.productRefs,
        participantRefs: result.participantRefs,
        decisionRef: result.decisionRef,
        executionRunId: result.executionRunId,
        proposalRef: result.proposalRef,
      },
    },
    { ...options, projectId },
  );
}

// ── Cross-tick dedupe ────────────────────────────────────────────────────────────────────────────
// A single real signal — one reply, one bounce — is observed REPEATEDLY by the automatic inbox reader:
// it polls every heartbeat and re-reads the same thread each tick. Without a durable seen-state that
// re-observation would create a fresh Result (+ Learning) every tick, fabricating hundreds of duplicate
// "wins" a day off ONE real reply. This is the durable dedupe: the persisted Result ledger IS the
// seen-state. When the provider supplies the inbound event and source identities, that pair is
// authoritative. Older callers retain the prior (joinKey, outcomeKind, messageId, source) fallback.
// If a Result with the selected identity already exists, re-ingesting it is a no-op.
//
// This holds the "numbers derive from real signals, never seeded/fake" invariant from the other side: a
// real reply produces EXACTLY one Result, and re-seeing it adds nothing. The identity is deliberately
// tight — a genuinely distinct provider event or fallback tuple still records. Founder-entered receipts
// never use the message fallback because their messageId may be contextual rather than an observation
// identity; only an explicit provider event identity may merge them. Deterministic; no model call.
function providerEventId(outcome = {}) {
  return trimOrNull(outcome.providerEventId ?? outcome.sourceEventId ?? outcome.eventId);
}

function outcomeIdentity({ joinKey, outcomeKind, messageId, source, providerEventId: eventId, providerSourceId }) {
  const providerEvent = trimOrNull(eventId);
  if (providerEvent) {
    return ["provider-event", trimOrNull(source) ?? "", trimOrNull(providerSourceId) ?? "", providerEvent].join("::");
  }
  return [
    "message-fallback",
    trimOrNull(joinKey) ?? "",
    trimOrNull(outcomeKind) ?? "",
    trimOrNull(messageId) ?? "",
    trimOrNull(source) ?? "",
  ].join("::");
}

// Is a Result with this outcome's identity already in the ledger? A found match means the same real
// signal was already recorded on an earlier tick, so this ingest should be skipped. `existingResults`
// may be passed in so a batch (or the poller) reads the ledger once instead of per-outcome.
function findExistingResult({ projectId, outcome, options, existingResults }) {
  const identity = outcomeIdentity(outcome);
  // A true provider event id is an explicit merge identity for every source. The legacy message fallback
  // is provider-only: founder-entered receipts may carry a contextual outbound message id, but repeated
  // founder observations are separate facts and must not collapse merely because that context matches.
  const explicitProviderIdentity = providerEventId(outcome);
  const providerMessageFallback = trimOrNull(outcome.source) !== OUTCOME_SOURCES.founderEntered
    && trimOrNull(outcome.messageId);
  if (!explicitProviderIdentity && !providerMessageFallback) return null;
  const results = Array.isArray(existingResults)
    ? existingResults
    : resultStore.list({ ...options, projectId });
  for (const r of results) {
    if (
      outcomeIdentity({
        joinKey: r.joinKey,
        outcomeKind: r.outcomeKind,
        messageId: r.messageId,
        source: r.source,
        providerEventId: r.providerEventId,
        providerSourceId: r.providerSourceId,
      }) === identity
    ) {
      return r;
    }
  }
  return null;
}

// ── Ingest one outcome ─────────────────────────────────────────────────────────────────────────────
// Take a raw outcome from any source, join it on its joinKey back to the run + item that produced it,
// record a Result that ties to run/path/asset/message/channel/buyer/offer (derived from the joined
// run + item, with any explicit field on the outcome winning), and write the paired Learning. An
// outcome whose key matches nothing staged is still captured honestly — the Result records runId/pathId
// as null and `joined` is false — so an out-of-band reply is never silently dropped.
//
// A signal already recorded on an earlier tick (same provider identity, or same compatible fallback
// tuple) is a durable no-op: it returns the existing Result with `deduped:true` and writes NOTHING new.
export function ingestOutcome(outcome = {}, options = {}) {
  const projectId = options.projectId ?? outcome.projectId ?? "default";
  const joinKey = trimOrNull(outcome.joinKey);
  if (!joinKey) {
    throw new Error("An outcome needs a joinKey to join back to what was sent.");
  }

  // Durable dedupe FIRST — before any write. The persisted Result ledger is the seen-state; a signal
  // already recorded (same identity tuple) on an earlier tick is returned as-is, joined per that Result,
  // and no second Result/Learning is minted. This is what stops one real reply becoming ~288/day.
  if (options.dedupe !== false) {
    const already = findExistingResult({ projectId, outcome: { ...outcome, joinKey }, options, existingResults: options.existingResults });
    if (already) {
      return { result: already, learning: null, joined: Boolean(already.runId), run: null, item: null, loop: { closed: false }, deduped: true };
    }
  }

  // Reuse a passed-in run snapshot (a batch reads once), else read the project's runs now.
  const match = Array.isArray(options.runs)
    ? joinToRun({ joinKey, runs: options.runs })
    : joinStoredExecution({ joinKey, projectId, options });
  const run = match?.run ?? null;
  const item = match?.item ?? null;

  // The motion dimension — derived from the joined run's shape, with an explicit stamp winning.
  const derivedMotion = deriveMotionForRun(run);
  const participantRefs = [
    ...(Array.isArray(run?.participantRefs) ? run.participantRefs : []),
    ...(Array.isArray(item?.participantRefs) ? item.participantRefs : []),
    ...(item?.agentRef ? [{ type: "teammate", id: item.agentRef }] : []),
    ...(Array.isArray(outcome.participantRefs) ? outcome.participantRefs : []),
    ...(Array.isArray(outcome.crewRefs) ? outcome.crewRefs : []),
  ];
  const productRefs = [
    ...(Array.isArray(run?.productRefs) ? run.productRefs : []),
    ...(Array.isArray(item?.productRefs) ? item.productRefs : []),
    ...(Array.isArray(outcome.productRefs) ? outcome.productRefs : []),
  ];
  const decisionRef = outcome.decisionRef ?? item?.decisionRef ?? run?.decisionRef ?? null;

  const result = resultStore.create(
    {
      projectId,
      joinKey,
      // Ties resolved from the joined run + item; an explicit field on the outcome overrides.
      runId: run?.id ?? null,
      executionRunId: run?.executionRunId ?? null,
      pathId: outcome.pathId ?? run?.pathId ?? null,
      assetId: outcome.assetId ?? item?.assetId ?? null,
      messageId: outcome.messageId ?? item?.messageId ?? null,
      providerEventId: providerEventId(outcome),
      providerSourceId: outcome.providerSourceId ?? outcome.sourceId ?? null,
      channel: outcome.channel ?? item?.channel ?? null,
      buyerRef: outcome.buyerRef ?? item?.buyer ?? null,
      offerRef: outcome.offerRef ?? item?.offer ?? null,
      // The single motion-keying dimension: explicit stamp overrides the shape-derivation; a run that
      // joined to nothing carries null (honestly unattributed).
      motionKind: outcome.motionKind ?? derivedMotion.motionKind,
      motionRef: outcome.motionRef ?? derivedMotion.motionRef,
      outcomeKind: outcome.outcomeKind ?? null,
      value: outcome.value ?? null,
      body: outcome.body ?? null,
      productImplication: outcome.productImplication ?? null,
      observedAt: outcome.observedAt ?? undefined,
      source: outcome.source ?? null,
      questionId: outcome.questionId ?? item?.questionId ?? run?.questionId ?? null,
      productRefs,
      participantRefs,
      decisionRef,
    },
    { ...options, projectId },
  );

  const learning = writeLearningForResult({ result, run, item, projectId, options });

  // Fold a real reply/win back into the soul of the teammate that produced the item it joined to — its
  // track record, plus a world learning capturing what landed. Only fires when the outcome joined to an
  // item carrying an agentRef, so the signal is real and attributable. Best-effort: recording the
  // outcome is the truth that must never fail, so a soul-write hiccup is non-fatal.
  try {
    if (item?.agentRef) {
      recordOutcomeIntoSoul(
        {
          projectId,
          agentRef: item.agentRef,
          outcomeKind: result.outcomeKind,
          message: item?.message ?? item?.draft ?? null,
          taskId: run?.id ?? result.runId ?? null,
          templateRef: item?.templateRef ?? null,
        },
        options,
      );
    }
  } catch (error) {
    console.warn(`[outcome-ingest] soul outcome-write skipped: ${error?.message ?? error}`);
  }

  // Close the loop back onto the object graph: an outcome that joined to a bet's path confirms or snaps
  // the belief links that bet was testing, and draws the feedback stroke from the outcome to the bet.
  // Recording the outcome is the truth that must never fail, so a graph writeback hiccup is non-fatal.
  let loop = { closed: false };
  try {
    loop = closeOutcomeLoop({ result, projectId, options });
  } catch (error) {
    console.warn(`[outcome-ingest] object-graph loop-close skipped: ${error?.message ?? error}`);
  }

  return { result, learning, joined: Boolean(run), run, item, loop };
}

// ── Ingest a batch from the three sources ────────────────────────────────────────────────────────
// `sources` maps an OPEN source label → a list of raw outcomes ingested under that label (the label is
// stamped as each outcome's `source` unless the outcome already names its own). Reads the project's
// runs once and reuses that snapshot for every join, so a hundred outcomes cost one store read. Returns
// what was ingested plus honest joined / unjoined tallies.
export function ingestBatch({ projectId = "default", sources = {} } = {}, options = {}) {
  const ingested = [];
  for (const [sourceLabel, list] of Object.entries(sources || {})) {
    for (const raw of Array.isArray(list) ? list : []) {
      if (!raw || typeof raw !== "object") continue;
      const outcome = { ...raw, source: raw.source ?? sourceLabel };
      ingested.push(ingestOutcome(outcome, { ...options, projectId }));
    }
  }
  return {
    ingested,
    joined: ingested.filter((x) => x.joined).length,
    unjoined: ingested.filter((x) => !x.joined).length,
  };
}

function safeOperationId(value) {
  const id = String(value ?? "outcome").trim().replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 64);
  return `product-change-${id || "outcome"}`;
}

// Derive the one reviewable operation from durable implication lineage and the owning project's
// pipeline registry. Outcome/client data may supply interpretation text and refs, but never graph ids,
// operation types, node authority, or arbitrary config. If lineage cannot resolve an owning graph the
// implication remains visible but deliberately has no actionable review plan.
function productChangeReview(implication, projectId, options = {}) {
  try {
    const scoped = { ...options, projectId };
    const project = loadProject(scoped);
    const channels = getProjectChannels(project, scoped);
    const attribution = implication?.attribution ?? {};
    const compiledRun = runStore.list(scoped).find((candidate) => candidate?.id === attribution.runId) ?? null;
    const receipt = loadProjectRuns(projectId, scoped).find((candidate) => {
      const executionId = candidate?.id ?? candidate?.runId ?? candidate?.result?.runId;
      return Boolean(executionId && (executionId === attribution.executionRunId
        || (!attribution.executionRunId && executionId === attribution.runId)));
    }) ?? null;
    const graphCandidates = new Set([
      receipt?.result?.graphId,
      receipt?.graphId,
      compiledRun?.pathId,
    ].map((value) => trimOrNull(value)).filter(Boolean));
    const channel = channels.find((candidate) => graphCandidates.has(candidate.graphId)
      || graphCandidates.has(candidate.id));
    if (!channel?.graphId) return null;
    const graph = loadFlow(channel.graphId, null, scoped).graph;
    if (!graph || graph.id !== channel.graphId) return null;
    const rightmost = (graph.nodes ?? []).reduce((max, node) => Math.max(
      max,
      Number.isFinite(node?.position?.x) ? node.position.x : 0,
    ), 0);
    return {
      kind: "product-change-proposal",
      pipelineRef: { type: "pipeline", id: channel.id },
      graphRef: { type: "graph", id: channel.graphId },
      operations: [{
        type: "add_node",
        node: {
          id: safeOperationId(implication.sourceOutcomeId),
          category: "context",
          connector: "product",
          label: "Review product implication",
          outputKind: "product-change",
          position: { x: rightmost + 240, y: 180 },
          config: {
            implicationId: implication.id,
            sourceOutcomeId: implication.sourceOutcomeId,
            interpretation: implication.body,
            questionId: implication.questionId ?? null,
            productRefs: implication.productRefs ?? [],
            participantRefs: implication.participantRefs ?? [],
            evidenceRefs: implication.evidenceRefs ?? [],
            authorRef: implication.authorRef ?? null,
            artifactRef: implication.artifactRef ?? null,
            reviewOnly: true,
          },
        },
      }],
    };
  } catch {
    return null;
  }
}

// Read-only product implications over explicit attributable model/agent interpretations linked to a
// source Result. The Result body remains evidence only; body text alone never becomes a recommendation.
// Nothing is persisted or applied by this projection.
export function projectProductImplications({ projectId = "default" } = {}, options = {}) {
  const learningByResult = new Map();
  for (const learning of learningStore.list({ ...options, projectId })) {
    const resultId = trimOrNull(learning?.identifying?.sourceResultId);
    if (resultId && !learningByResult.has(resultId)) learningByResult.set(resultId, learning);
  }
  return resultStore.list({ ...options, projectId })
    .map((result) => productImplicationProjection(result, learningByResult.get(result.id) ?? null))
    .filter(Boolean)
    .map((implication) => ({
      ...implication,
      review: productChangeReview(implication, projectId, options),
    }));
}

// Attach lineage to a proposal that the existing operator authority has already staged. This function
// neither creates nor applies the proposal. Repeating the same attachment is idempotent.
export function attachProductChangeProposal(
  { projectId = "default", implicationId, proposalSessionId, decisionRef = null } = {},
  options = {},
) {
  const implication = projectProductImplications({ projectId }, options)
    .find((candidate) => candidate.id === implicationId);
  if (!implication) throw new Error(`Product implication not found: ${implicationId}`);
  const sessionId = trimOrNull(proposalSessionId);
  if (!sessionId) throw new Error("A staged product-change proposal session is required.");
  const proposalRef = { type: "productChangeProposal", id: sessionId };

  const result = resultStore.get(implication.sourceOutcomeId, { ...options, projectId });
  resultStore.save({
    ...result,
    proposalRef,
    proposalDisposition: "staged",
    decisionRef: decisionRef ?? result.decisionRef,
  }, { ...options, projectId });

  if (implication.sourceLearningId) {
    const learning = learningStore.get(implication.sourceLearningId, { ...options, projectId });
    const identifying = learning.identifying && typeof learning.identifying === "object"
      ? learning.identifying
      : {};
    learningStore.save({
      ...learning,
      identifying: {
        ...identifying,
        proposalRef,
        proposalDisposition: "staged",
        decisionRef: decisionRef ?? identifying.decisionRef,
      },
    }, { ...options, projectId });
  }

  return projectProductImplications({ projectId }, options)
    .find((candidate) => candidate.id === implicationId);
}

// Resolve the projection status when the existing operator proposal is accepted or discarded. The
// proposal session remains an audit reference; disposition is explicit so it never reads as still staged.
export function settleProductChangeProposal(
  { projectId = "default", proposalSessionId, disposition } = {},
  options = {},
) {
  const sessionId = trimOrNull(proposalSessionId);
  const resolved = trimOrNull(disposition);
  if (!sessionId || !["accepted", "discarded"].includes(resolved)) return { updated: 0 };
  const results = resultStore.list({ ...options, projectId })
    .filter((result) => result.proposalRef?.type === "productChangeProposal" && result.proposalRef?.id === sessionId);
  let updated = 0;
  for (const result of results) {
    resultStore.save({ ...result, proposalDisposition: resolved }, { ...options, projectId });
    for (const learning of learningStore.list({ ...options, projectId })) {
      if (learning?.identifying?.sourceResultId !== result.id) continue;
      learningStore.save({
        ...learning,
        identifying: { ...learning.identifying, proposalDisposition: resolved },
      }, { ...options, projectId });
    }
    updated += 1;
  }
  return { updated };
}

// ── Honest readback ────────────────────────────────────────────────────────────────────────────────
// Fold the run ledger and the result ledger into a per-path picture the founder can read. The whole
// point of the guard: an item with no result is counted as UNMEASURED, not hidden and not turned into a
// rate. No success is asserted from a contract's free-text criteria — the report carries the real
// outcome counts and orders paths by how many outcomes they actually produced, so "which path worked"
// is answered by observed results, never by an invented score.

function pluralize(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// One plain-language sentence for a path's line in the report — founder register, strictly honest.
function plainSummary(entry, pathTitle) {
  const lead = pathTitle ? `${pathTitle}: ` : "";
  if (entry.staged === 0) return `${lead}Nothing staged under this path yet.`;
  if (entry.measured === 0) {
    return `${lead}${pluralize(entry.staged, "action")} staged. Nothing measured yet.`;
  }
  const outcomeParts = Object.entries(entry.outcomes)
    .sort((a, b) => b[1] - a[1])
    .map(([kind, n]) => `${n} ${kind}`);
  const measuredPart = outcomeParts.length ? outcomeParts.join(", ") : `${entry.measured} measured`;
  const tail = entry.unmeasured ? ` ${pluralize(entry.unmeasured, "action")} not yet measured.` : "";
  return `${lead}${pluralize(entry.staged, "action")} staged — ${measuredPart} so far.${tail}`;
}

export function outcomeReport({ projectId = "default" } = {}, options = {}) {
  const { runs } = reconciledOutcomeRuns(projectId, options);
  const results = resultStore.list({ ...options, projectId });

  // Index results by the key they joined on, so counting is a lookup per staged item.
  const resultsByJoinKey = new Map();
  for (const r of results) {
    const key = trimOrNull(r.joinKey);
    if (!key) continue;
    if (!resultsByJoinKey.has(key)) resultsByJoinKey.set(key, []);
    resultsByJoinKey.get(key).push(r);
  }

  // Which staged joinKeys exist at all, so we can tell an out-of-band (unjoined) result apart from one
  // that matched a staged item.
  const stagedJoinKeys = new Set();
  const paths = new Map();
  for (const run of runs) {
    const pathId = run.pathId ?? null;
    const entry =
      paths.get(pathId) ?? { pathId, runs: 0, staged: 0, measured: 0, unmeasured: 0, outcomes: {} };
    entry.runs += 1;
    for (const item of Array.isArray(run.items) ? run.items : []) {
      const key = trimOrNull(item?.joinKey);
      if (!key) continue;
      stagedJoinKeys.add(key);
      entry.staged += 1;
      const attached = resultsByJoinKey.get(key) ?? [];
      if (attached.length) {
        entry.measured += 1;
        for (const r of attached) {
          const kind = r.outcomeKind ?? "unlabeled";
          entry.outcomes[kind] = (entry.outcomes[kind] ?? 0) + 1;
        }
      } else {
        entry.unmeasured += 1;
      }
    }
    paths.set(pathId, entry);
  }

  // Results whose key matched no staged item — captured, but honestly reported apart so nothing is
  // silently attributed to a path it did not come from.
  const unjoinedResults = results.filter((r) => {
    const key = trimOrNull(r.joinKey);
    return key && !stagedJoinKeys.has(key);
  }).length;

  const pathReadouts = [...paths.values()]
    // Order by observed outcomes, then by how much is measured — "which path worked" from real results.
    .sort((a, b) => {
      const ao = Object.values(a.outcomes).reduce((s, n) => s + n, 0);
      const bo = Object.values(b.outcomes).reduce((s, n) => s + n, 0);
      return bo - ao || b.measured - a.measured;
    })
    .map((entry) => {
      let title = null;
      if (entry.pathId) {
        try {
          title = trimOrNull(gtmPathStore.get(entry.pathId, { ...options, projectId })?.summary);
        } catch {
          title = null;
        }
      }
      return { ...entry, pathSummary: title, summary: plainSummary(entry, title) };
    });

  const staged = pathReadouts.reduce((s, e) => s + e.staged, 0);
  const measured = pathReadouts.reduce((s, e) => s + e.measured, 0);

  return {
    projectId,
    paths: pathReadouts,
    implications: projectProductImplications({ projectId }, options),
    totals: {
      runs: runs.length,
      staged,
      measured,
      // Honest: unmeasured is a real count, never derived from a fabricated rate.
      unmeasured: staged - measured,
      results: results.length,
      unjoinedResults,
    },
  };
}

// ── deriveMotionEfficiency — the ONE per-motion efficiency reader (GTM-MACHINE.md Area 7) ────────────
//
// This is the SINGLE keying dimension the whole operation aggregates on. There is exactly ONE efficiency
// reader in the codebase (the eval greps for it): Area 3's reallocation and Area 6's funnel table both
// consume THIS, never a second derivation. It reuses outcomeReport's counting spine and its honest-
// unmeasured accounting — deterministic code over stored records, no model call anywhere.
//
// Per motionKind (the shape-derived open string on each Result / each run's shape):
//   - staged            — how many actions this motion's runs put on the ledger
//   - measured          — how many of them drew a real, joined outcome
//   - outcomesByKind    — the per-outcome-kind counts (reply / signup / ranked / cited / … — open)
//   - coverage          — measured / staged, or null when nothing is staged (NEVER a fabricated rate)
//   - lastOutcomeAt     — the most recent observed outcome, or null
//   - orderRank         — 0-based rank when ordered by observed outcomes (most-observed first)
//
// A motion with staged work and zero measured outcomes reads honestly (measured 0, coverage 0), never a
// made-up win rate. An out-of-band Result whose motionKind is null lands in its own "unattributed" bucket,
// kept apart so nothing is silently credited to a motion it did not come from.
export function deriveMotionEfficiency({ projectId = "default" } = {}, options = {}) {
  const { runs } = reconciledOutcomeRuns(projectId, options);
  const results = resultStore.list({ ...options, projectId });

  // Each run's motion identity, derived from its own stored shape — the same derivation ingest stamps
  // onto a Result, so a run's staged items and the outcomes joined to it land in the SAME motion row.
  const rows = new Map();
  const rowFor = (motionKind) => {
    const key = motionKind ?? "__unattributed__";
    if (!rows.has(key)) {
      rows.set(key, {
        motionKind: motionKind ?? null,
        motionRef: null,
        staged: 0,
        measured: 0,
        outcomesByKind: {},
        lastOutcomeAt: null,
      });
    }
    return rows.get(key);
  };

  // Index results by joinKey so a staged item's measurement is a lookup.
  const resultsByJoinKey = new Map();
  for (const r of results) {
    const key = trimOrNull(r.joinKey);
    if (!key) continue;
    if (!resultsByJoinKey.has(key)) resultsByJoinKey.set(key, []);
    resultsByJoinKey.get(key).push(r);
  }

  const stagedJoinKeys = new Set();
  for (const run of runs) {
    const { motionKind: runKind, motionRef } = deriveMotionForRun(run);
    const runRow = rowFor(runKind);
    if (!runRow.motionRef && motionRef) runRow.motionRef = motionRef;
    for (const item of Array.isArray(run.items) ? run.items : []) {
      const key = trimOrNull(item?.joinKey);
      if (!key) continue;
      stagedJoinKeys.add(key);
      // Staged count + coverage belong to the run's own shape row (what was actually put on the ledger).
      runRow.staged += 1;
      const attached = resultsByJoinKey.get(key) ?? [];
      if (attached.length) {
        for (const r of attached) {
          // A measured outcome attributes to the RESULT's motionKind — the resolved stamp-or-derived
          // truth ingest already settled. In the common case it equals the run's shape kind, so measured
          // and staged land in the SAME row; an explicit re-stamp credits the outcome to the kind the
          // founder named while staged/coverage stay honest to the run that produced it.
          const outcomeRow = rowFor(trimOrNull(r.motionKind) ?? runKind);
          if (!outcomeRow.motionRef && trimOrNull(r.motionRef)) outcomeRow.motionRef = trimOrNull(r.motionRef);
          outcomeRow.measured += 1;
          const kind = r.outcomeKind ?? "unlabeled";
          outcomeRow.outcomesByKind[kind] = (outcomeRow.outcomesByKind[kind] ?? 0) + 1;
          if (r.observedAt && (!outcomeRow.lastOutcomeAt || r.observedAt > outcomeRow.lastOutcomeAt)) {
            outcomeRow.lastOutcomeAt = r.observedAt;
          }
        }
      }
    }
  }

  // Out-of-band Results — joined to no staged item — keyed by their OWN stamped motionKind (a probe
  // reading that named its motion), or the unattributed bucket. They contribute measured outcomes their
  // motion earned even when the staging run isn't in this snapshot; never credited to a wrong motion.
  for (const r of results) {
    const key = trimOrNull(r.joinKey);
    if (key && stagedJoinKeys.has(key)) continue;
    const row = rowFor(trimOrNull(r.motionKind));
    if (!row.motionRef && trimOrNull(r.motionRef)) row.motionRef = trimOrNull(r.motionRef);
    row.measured += 1;
    const kind = r.outcomeKind ?? "unlabeled";
    row.outcomesByKind[kind] = (row.outcomesByKind[kind] ?? 0) + 1;
    if (r.observedAt && (!row.lastOutcomeAt || r.observedAt > row.lastOutcomeAt)) {
      row.lastOutcomeAt = r.observedAt;
    }
  }

  const motions = [...rows.values()]
    .map((row) => ({
      ...row,
      // Coverage is measured/staged — null (not 0, not a guessed rate) when nothing is staged, so an
      // out-of-band-only or unattributed row reads honestly rather than as a fabricated 0% or 100%.
      coverage: row.staged > 0 ? row.measured / row.staged : null,
    }))
    // Order by observed outcomes (most first), then by measured, then staged — "which motion is working"
    // answered by real results, never an invented score.
    .sort((a, b) => {
      const ao = Object.values(a.outcomesByKind).reduce((s, n) => s + n, 0);
      const bo = Object.values(b.outcomesByKind).reduce((s, n) => s + n, 0);
      return bo - ao || b.measured - a.measured || b.staged - a.staged;
    })
    .map((row, index) => ({ ...row, orderRank: index }));

  return {
    projectId,
    motions,
    totals: {
      motions: motions.length,
      staged: motions.reduce((s, m) => s + m.staged, 0),
      measured: motions.reduce((s, m) => s + m.measured, 0),
    },
  };
}
