// Phase 4 — Honest run to gate (GTM-ENGINE-REBUILD §4, Phase 4).
//
// Phase 2 produced a portfolio of ranked GTM paths, each already carrying its own MeasurementContract.
// This turns ONE selected path into a real, reviewable Run that stages at the founder gate — grounded
// on BOTH truth sides (the ProductTruths and MarketObjects the bet rests on), with its measurement
// contract bound at compile time, BEFORE anything could execute. Nothing sends: a run stages.
//
// The invariants this file holds (§2):
//   - The wall is UNTOUCHED. Compilation reuses the proven compose-to-gate engine
//     (composeGraphForChannel), which asserts the founder gate on every path to an execute node; this
//     module re-asserts it on the compiled topology and never adds a send. A run stages, it never sends.
//   - A MeasurementContract binds when possible. A missing or hollow contract is a repairable
//     Measurement weakness carried on the staged run, not a compile block — the founder gate stays the
//     only checkpoint.
//   - Deterministic code for everything but judgment (§2.4). Resolving the path, resolving its
//     contract, building grounding, staging the execution actions, and projecting the gate view are
//     all plain functions. The only fuzzy work — designing the executable topology — is the injected
//     composer (createClaudeComposer live), the same seam the rest of the engine uses.
//   - Open shapes (§2.2). Staged items and the gate view carry whatever fields the bet produced; no
//     field is required, no shape is rejected. The gate renders whatever was staged.

import { composeGraphForChannel, assertGateWall } from "./workflow-composer.mjs";
import { listCapabilities } from "./artifact-store.mjs";
import { gtmPathStore, measurementContractStore, runStore, productTruthStore, marketObjectStore } from "./gtm-store.mjs";
import { normalizeRunPlan } from "./graph-intelligence/compile-decompose.mjs";
import { runGraph } from "./graph.mjs";
import { recordRunDerivations } from "./run-derivation.mjs";
import { makeFailureSink } from "./failure-log.mjs";
import { resolveGitShaAsync } from "./friction.mjs";

function slug(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "path";
}

// ── The measurement-contract read ─────────────────────────────────────────────────────────────────
// The graph redesign makes unmeasurability loud without making it a second checkpoint. Compile reads
// the contract, binds it when useful, and carries a repairable Measurement weakness when missing.
export function isBindableContract(contract) {
  if (!contract || typeof contract !== "object") return false;
  const hasOutcomes = Array.isArray(contract.outcomeKinds) && contract.outcomeKinds.length > 0;
  const hasSources = Array.isArray(contract.sources) && contract.sources.length > 0;
  const hasJoinKey = Boolean(String(contract.joinKey ?? "").trim());
  const hasCriteria = Boolean(String(contract.successCriteria ?? "").trim());
  return hasOutcomes || hasSources || hasJoinKey || hasCriteria;
}

export function measurementWeaknessForContract(contract) {
  const missing = [];
  if (!contract || typeof contract !== "object") {
    missing.push("contract");
  } else {
    if (!Array.isArray(contract.outcomeKinds) || contract.outcomeKinds.length === 0) missing.push("outcomeKinds");
    if (!Array.isArray(contract.sources) || contract.sources.length === 0) missing.push("sources");
    if (!String(contract.joinKey ?? "").trim()) missing.push("joinKey");
    if (!String(contract.successCriteria ?? "").trim()) missing.push("successCriteria");
  }
  return {
    kind: "measurement",
    status: "open",
    statement: missing.includes("contract")
      ? "This path has no measurement plan yet."
      : `This path's measurement plan is missing ${missing.join(", ")}.`,
    signal: { missing },
    threshold: "Compile stages the run and carries this repairable weakness; the gate remains the only checkpoint.",
    repair: {
      verb: "patch_measurement",
      statement: "Bind an outcome, source, join key, and success criterion.",
      targetNodeId: null,
      compilable: true,
    },
  };
}

// Resolve the contract for a path: an injected contract wins (tests / a founder-edited plan), else the
// path's own linked MeasurementContract is read from the store. A missing link resolves to null so the
// compile can carry a repairable Measurement weakness instead of throwing an opaque store error.
function resolveContract({ path, contract, options }) {
  if (contract && typeof contract === "object") return contract;
  const id = String(path?.measurementContractId ?? "").trim();
  if (!id) return null;
  try {
    return measurementContractStore.get(id, options);
  } catch {
    return null;
  }
}

// ── Grounding on BOTH truths ─────────────────────────────────────────────────────────────────────
// The compile is grounded on the exact records the bet rests on: resolve the path's restsOn refs back
// to the stored ProductTruths and MarketObjects, so the composer designs the topology against real,
// cited truth — not a re-guess. When the bet cites nothing resolvable, fall back to the project's full
// truth picture rather than composing blind. Pure projection over stored records; no model call.
export function buildCompileGrounding({ path, projectId = "default", productTruths = null, marketObjects = null, options = {} } = {}) {
  const truths = Array.isArray(productTruths) ? productTruths : productTruthStore.list({ ...options, projectId });
  const markets = Array.isArray(marketObjects) ? marketObjects : marketObjectStore.list({ ...options, projectId });
  const truthById = new Map(truths.filter((t) => t && t.id).map((t) => [t.id, t]));
  const marketById = new Map(markets.filter((m) => m && m.id).map((m) => [m.id, m]));

  const restedTruths = [];
  const restedMarkets = [];
  for (const ref of Array.isArray(path?.restsOn) ? path.restsOn : []) {
    const id = ref && typeof ref === "object" ? ref.id : ref;
    if (!id) continue;
    if (truthById.has(id)) restedTruths.push(truthById.get(id));
    else if (marketById.has(id)) restedMarkets.push(marketById.get(id));
  }
  const usedTruths = restedTruths.length ? restedTruths : truths;
  const usedMarkets = restedMarkets.length ? restedMarkets : markets;

  const headline = [path?.summary, path?.bet?.buyer ? `Buyer: ${path.bet.buyer}` : "", path?.bet?.offer ? `Offer: ${path.bet.offer}` : ""]
    .filter(Boolean)
    .join(" — ");
  return {
    headline: headline || path?.summary || "",
    bet: path?.bet ?? {},
    productTruths: usedTruths
      .filter((t) => t && t.statement)
      .map((t) => ({ id: t.id, statement: t.statement, solidity: t.solidity ?? null, source: t.source ?? null })),
    marketObjects: usedMarkets
      .filter((m) => m && m.statement)
      .map((m) => ({ id: m.id, kind: m.kind, statement: m.statement, solidity: m.solidity ?? null, source: m.source ?? null })),
  };
}

// The channel the compose engine composes for — objective drawn from the path's own bet, so the model
// designs the topology THIS bet needs. Reuses the engine's channel shape; no new object.
function channelForPath(path, contextRefs = {}) {
  const bet = path?.bet ?? {};
  const objective = [
    path?.summary,
    bet.buyer ? `Reach: ${bet.buyer}` : "",
    bet.channel ? `Through: ${bet.channel}` : "",
    bet.offer ? `Offering: ${bet.offer}` : "",
    bet.message ? `Message: ${bet.message}` : "",
  ]
    .filter(Boolean)
    .join(". ");
  return {
    id: `path:${slug(path?.id || path?.summary)}`,
    title: path?.summary ? path.summary.slice(0, 60) : "GTM path run",
    objective: objective || path?.summary || "",
    kind: "gtm-path-run",
    questionId: contextRefs.questionId ?? path?.questionId ?? null,
    participantRefs: contextRefs.participantRefs ?? path?.participantRefs ?? [],
    productRefs: contextRefs.productRefs ?? path?.productRefs ?? [],
  };
}

function reviewPayloadForItem(item) {
  if (item?.reviewPayload) return item.reviewPayload;
  if (item?.kind === "audience-list") return "list";
  if (item?.kind === "patch") return "diff";
  if (item?.body || item?.subject || item?.draft) return "copy";
  return "action-summary";
}

function actionLabelForExecute(node) {
  const connector = String(node?.connector || node?.kind || node?.label || "local").toLowerCase();
  if (connector.includes("gmail") || connector.includes("email")) return "send_emails";
  if (connector.includes("deploy")) return "publish_page";
  if (connector.includes("crm")) return "update_crm";
  if (connector.includes("patch")) return "apply_patch";
  return connector || "stage_locally";
}

function gateBindingsForGraph(nodes, edges, items) {
  const executes = nodes.filter((node) => node.category === "execute");
  const incomingByTarget = new Map();
  for (const edge of edges) {
    if (!incomingByTarget.has(edge.target)) incomingByTarget.set(edge.target, []);
    incomingByTarget.get(edge.target).push(edge.source);
  }
  const gateIds = new Set(nodes.filter((node) => node.category === "gate").map((node) => node.id));
  const byProtects = new Map();
  for (const execute of executes) {
    const protects = actionLabelForExecute(execute);
    const upstreamGate = (incomingByTarget.get(execute.id) ?? []).find((id) => gateIds.has(id)) ?? null;
    const reviewPayload = items.find((item) => item.protects === protects)?.reviewPayload || items[0]?.reviewPayload || "action-summary";
    if (!byProtects.has(protects)) {
      byProtects.set(protects, {
        gateNodeId: upstreamGate,
        protects,
        requiredApproval: "founder",
        reviewPayload,
      });
    }
  }
  return [...byProtects.values()];
}

export function assertOrdinaryProductChangeBoundary(nodes, runPlan) {
  if (!runPlan?.patch) return;
  const unsafe = (Array.isArray(nodes) ? nodes : []).filter(
    (node) => node?.category === "execute" && !["local", "artifact"].includes(node.connector || "local"),
  );
  if (unsafe.length) {
    throw new Error(
      `An ordinary in-repo product change may prepare a worktree and reviewed diff only; ` +
      `execute node${unsafe.length === 1 ? "" : "s"} ${unsafe.map((node) => `"${node.id}" (${node.connector || "unknown"})`).join(", ")} ` +
      "would cross into commit, push, pull request, merge, publish, deploy, or another external effect.",
    );
  }
}

// ── Staging the execution actions ──────────────────────────────────────────────────────────────────
// What the founder reviews at the gate. The old spine staged one planned-action item; the graph path
// compile generalizes that into RunPlan sections while preserving the open item shape and joinKey rule.
function stageItemsForRun({ path, input, runPlan, measurementWeakness }) {
  const bet = path?.bet ?? {};
  const plan = {
    kind: "planned-action",
    plan: path?.summary ?? null,
    ...(bet.buyer ? { buyer: bet.buyer } : {}),
    ...(bet.channel ? { channel: bet.channel } : {}),
    ...(bet.offer ? { offer: bet.offer } : {}),
    ...(bet.message ? { message: bet.message, draft: bet.message } : {}),
    ...(bet.proof ? { proof: bet.proof } : {}),
    pathId: path?.id ?? null,
  };
  const staged = [];
  if (runPlan?.audience) {
    staged.push({
      kind: "audience-list",
      reviewPayload: "list",
      protects: "send_emails",
      pathId: path?.id ?? null,
      audience: runPlan.audience,
      items: runPlan.audience.items ?? runPlan.audience.contacts ?? [],
    });
  }
  for (const asset of runPlan?.assets ?? []) {
    staged.push({
      kind: asset.kind || asset.type || "asset",
      reviewPayload: asset.reviewPayload || "copy",
      protects: asset.protects || "send_emails",
      pathId: path?.id ?? null,
      ...asset,
    });
  }
  if (runPlan?.patch) {
    staged.push({
      kind: "patch",
      pathId: path?.id ?? null,
      ...runPlan.patch,
      reviewPayload: "diff",
      protects: "prepare_diff",
      effectBoundary: "reviewed_diff_only",
      externalEffectAuthorized: false,
      blockedEffects: ["commit", "push", "pull_request", "merge", "publish", "deploy"],
    });
  }
  for (const step of runPlan?.execution ?? []) {
    staged.push({
      kind: "execution",
      reviewPayload: step.reviewPayload || "action-summary",
      protects: step.protects || step.action || "stage_locally",
      pathId: path?.id ?? null,
      ...step,
    });
  }
  const founderItems = Array.isArray(input?.items) ? input.items.filter((i) => i && typeof i === "object") : [];
  if (founderItems.length) {
    // Carry the compiled plan onto each concrete item the founder supplied (their fields win).
    return founderItems.map((item) => ({
      ...plan,
      reviewPayload: reviewPayloadForItem(item),
      ...(measurementWeakness ? { measurementWeakness } : {}),
      ...item,
    }));
  }
  if (!staged.length) staged.push(plan);
  return staged.map((item) => ({
    ...item,
    reviewPayload: reviewPayloadForItem(item),
    ...(measurementWeakness ? { measurementWeakness } : {}),
  }));
}

// The gate view: project a staged Run's items into review cards regardless of their shape (§2.2 open
// shapes). Each card preserves the item's own content untouched and adds a STABLE action id (derived
// from the run id + the item's durable joinKey, so the same staged item always reviews under the same
// id) and a pending approval status. This proves the gate renders whatever was staged — it never
// inspects or requires a fixed field. It is a pure read; it approves nothing and sends nothing.
// A stable identity for a staged item, derived from the run id + the item's durable joinKey. Both the
// gate view (below) and the approval resume use it so the founder's per-item decision — keyed exactly
// the way the item rendered — resolves against the same item at the gate. Exported so the approve path
// stamps the identical id it reviews under.
export function stableActionId(run, item) {
  return `gtm-${slug(run?.id)}-${slug(item?.joinKey)}`;
}

export function gateReviewForRun(run) {
  const items = Array.isArray(run?.items) ? run.items : [];
  return {
    runId: run?.id ?? null,
    pathId: run?.pathId ?? null,
    questionId: run?.questionId ?? null,
    participantRefs: Array.isArray(run?.participantRefs) ? run.participantRefs : [],
    productRefs: Array.isArray(run?.productRefs) ? run.productRefs : [],
    status: run?.gateState?.status ?? "pending",
    // The bound measurement contract travels with the review, so the founder sees how this run will be
    // measured at the moment they approve it — measurement is set before, not after, the send.
    measurementContract: run?.measurementContract ?? null,
    measurementWeakness: run?.measurementWeakness ?? null,
    gates: run?.gateBindings ?? [],
    items: items.map((item) => {
      const actionId = stableActionId(run, item);
      return {
        actionId,
        joinKey: item?.joinKey ?? null,
        // The item's already-decided status (if the run was resumed) wins; a fresh staged item is pending.
        approvalStatus: item?.approvalStatus ?? "pending",
        protects: item?.protects ?? "stage_locally",
        reviewPayload: reviewPayloadForItem(item),
        // Whatever shape was staged, carried through untouched, plus a stable gtmActionId so the founder
        // gate keys their decision to the same identity the UI renders it under (draftKey/itemKey read it).
        item: { ...item, gtmActionId: item?.gtmActionId ?? actionId },
      };
    }),
    awaitingReview: items.filter((item) => (item?.approvalStatus ?? "pending") === "pending").length,
  };
}

// ── Persist the send facts back onto the run ─────────────────────────────────────────────────────────
// After a founder-approved run runs to completion, the execute node's output items carry the delivery
// facts a real send produced — the provider's message id (Gmail's, handed back at send time) and the
// sentAt timestamp — but the run is persisted from the GATE node's items, which never saw those facts. So
// the fields the automatic inbox reader keys its sent-item index on (item.providerMessageId + item.joinKey)
// are absent from the stored run, and every poll no-ops against an empty index.
//
// This merges the execute output back onto the gate items by their durable joinKey: for each staged item,
// if an execute-node output item with the same joinKey carried a providerMessageId, copy providerMessageId
// (and sentAt) onto it. It ONLY copies the two delivery facts and only when a real provider id exists — the
// gate items stay the persistence spine (they carry the decided/approved state); nothing else is overwritten,
// and an item that was never actually sent (staged locally, blocked for needs_connection, rate-limited)
// gets no fabricated id. Deterministic code over the run result; no model call.
function collectSentFactsByJoinKey(result) {
  const byJoinKey = new Map();
  const nodes = result?.nodes ?? {};
  for (const nodeResult of Object.values(nodes)) {
    if (nodeResult?.category !== "execute" && !Array.isArray(nodeResult?.items)) continue;
    for (const item of Array.isArray(nodeResult?.items) ? nodeResult.items : []) {
      const joinKey = String(item?.joinKey ?? "").trim();
      const providerMessageId = String(item?.providerMessageId ?? "").trim();
      // Only a truly-sent item — one carrying a real provider message id AND a joinKey to attribute it —
      // contributes a delivery fact. A staged/blocked/rate-limited item has no provider id and is skipped.
      if (!joinKey || !providerMessageId) continue;
      byJoinKey.set(joinKey, { providerMessageId, sentAt: item.sentAt ?? null });
    }
  }
  return byJoinKey;
}

export function mergeSendOutputOntoItems(items, result) {
  const list = Array.isArray(items) ? items : [];
  const sentFacts = collectSentFactsByJoinKey(result);
  if (sentFacts.size === 0) return list;
  return list.map((item) => {
    const joinKey = String(item?.joinKey ?? "").trim();
    const facts = joinKey ? sentFacts.get(joinKey) : null;
    if (!facts) return item;
    return {
      ...item,
      providerMessageId: facts.providerMessageId,
      // Keep an already-stamped sentAt on the item; else adopt the send's timestamp.
      sentAt: item.sentAt ?? facts.sentAt ?? null,
    };
  });
}

// ── Approve → run: release a staged compiled run through the SAME engine ─────────────────────────────
// A compiled run stages at the founder gate (compileRunFromPath). This is the other half: the founder's
// per-item decisions (approve / reject / edit) release it. It reuses runGraph — NOT a parallel runtime —
// resuming the founder gate on the exact reviewed items, so the approved ones continue downstream to the
// execute node, which stages them LOCALLY by default and never sends. The wall is untouched: only items
// the founder approved carry `approved === true`, runGraph re-asserts release authority when a guard is
// supplied, and the default execute connector stages, never sends. It persists the resolved run back onto
// the runStore record and fires recordRunDerivations, so taste, people, experiment, idea, and outcome
// derivations run exactly as they do for an operator run.
export async function approveCompiledRun({
  projectId = "default",
  runId = null,
  run = null,
  decisions = {},
  approvals = {},
  stepRuntime,
  market = null,
  grounding = null,
  designState = null,
  memory = null,
  loadLastRunItems = null,
  authorizeRelease = null,
  // The live delivery seam — HOW an approved item actually leaves (e.g. a real Gmail send). Host-supplied,
  // never composition. When present, a founder-approved item reaches the real send transport and gets back
  // a provider message id; without it the default execute connector stages locally (no id). Threading it
  // here matches the operator gate-resume path, which already passes it — and is what makes the compiled-run
  // approval able to genuinely send, and therefore able to persist the provider id the inbox reader needs.
  sendRunners = null,
  options = {},
} = {}) {
  const staged = run ?? runStore.get(runId, { ...options, projectId });
  const nodes = Array.isArray(staged.steps) ? staged.steps : [];
  const edges = Array.isArray(staged.edges) ? staged.edges : [];
  const gateNodes = nodes.filter((node) => node && node.category === "gate");
  if (!gateNodes.length) {
    throw new Error("This staged run has no founder gate, so there is nothing to approve.");
  }

  // Stamp every staged item with its stable id so a per-item founder decision — keyed exactly the way the
  // gate view rendered the item — resolves against it at the gate. These become the gate's upstream via
  // resumeResult, so the founder releases the EXACT artifacts they reviewed, not a re-drafted variant.
  const reviewedItems = (Array.isArray(staged.items) ? staged.items : []).map((item) => ({
    ...item,
    gtmActionId: item?.gtmActionId ?? stableActionId(staged, item),
  }));

  // The founder gate resumes on the exact reviewed items. Every gate node in the compiled topology
  // receives them (a compiled run carries one). Nothing else is restored, so any upstream step re-runs
  // live — but its output is DISCARDED at the gate's upstream override; the reviewed items are what
  // continue downstream, which is what keeps the approved content identical to what was reviewed.
  const resumeResult = {
    runId: staged.id,
    nodes: Object.fromEntries(gateNodes.map((node) => [node.id, { items: reviewedItems }])),
  };
  // Per-item decisions apply at each gate node the same way the operator gate applies them.
  const gateDecisions = Object.fromEntries(gateNodes.map((node) => [node.id, decisions ?? {}]));

  const graph = { nodes, edges, id: staged.id };

  // Self-observation on the compiled-run gate-approval leg — the parallel HTTP path to the operator
  // gate-resume run. Post-approval this run threads authorizeRelease, so approved items flow into
  // execute/send/deploy connectors and upstream steps re-run live; without this sink every node-error
  // and bad-output failure here fell to runGraph's no-op onFailure and was silently dropped. This is the
  // SAME shared sink both operator legs use, so a failure on this consequential wall-crossing run logs
  // identically. Git sha resolved ONCE off the hot path (explicit options.gitSha wins for tests).
  let approveFailureGitSha;
  if ("gitSha" in options) {
    approveFailureGitSha = options.gitSha;
  } else {
    try { approveFailureGitSha = await resolveGitShaAsync(); } catch { approveFailureGitSha = null; }
  }
  const onFailure = makeFailureSink({
    graphId: staged.id ?? null,
    graphLabel: staged.pathId ?? staged.runPlan?.summary ?? null,
    session: { id: staged.id ?? null, graphId: staged.id ?? null },
    gitSha: approveFailureGitSha,
    options,
  });

  const result = await runGraph(graph, {
    resumeResult,
    decisions: gateDecisions,
    approvals,
    onFailure,
    stepRuntime,
    market,
    grounding,
    designState,
    memory,
    loadLastRunItems,
    projectId,
    credentialOptions: options,
    authorizeRelease,
    // Only pass a send-runner map when one was supplied. Absent it, the execute connector stages locally
    // (the compiled-run default). Present, an approved item reaches the real transport and returns a
    // provider message id, which the merge below persists onto the run for the automatic inbox reader.
    ...(sendRunners ? { sendRunners } : {}),
  });

  // Persist the resolved run. Undecided items keep it staged (the gate still holds them); a fully
  // resolved run moves OFF staged — completed when it ran clean, blocked when a step failed.
  const stillPending = result.pendingGates.length > 0;
  const status = stillPending ? "staged" : result.ok ? "completed" : "blocked";
  const gateStatus = stillPending ? "pending" : result.ok ? "approved" : "blocked";
  const primaryGate = gateNodes[0];
  const gateResult = result.nodes[primaryGate.id];
  // The gate's stamped items (each now approved / rejected) become the run's items so a re-open shows the
  // decided state; fall back to the reviewed items if the gate produced none.
  const gateItems = Array.isArray(gateResult?.items) ? gateResult.items : reviewedItems;
  // Merge the execute node's send output — providerMessageId + sentAt, keyed on the durable joinKey — back
  // onto the persisted items. Without this, a truly-sent item's Gmail message id lives only in the transient
  // run result and is thrown away at save time, so the automatic inbox reader's sent-item index is always
  // empty live and every poll no-ops. The gate items are the persistence spine (they carry the decided
  // state); this only stamps the delivery facts a send produced onto the exact item that was sent.
  const decidedItems = mergeSendOutputOntoItems(gateItems, result);
  const awaitingReview = stillPending
    ? (typeof gateResult?.meta?.awaitingReview === "number"
        ? gateResult.meta.awaitingReview
        : decidedItems.filter((item) => item?.approvalStatus === "pending").length)
    : 0;
  const savedRun = runStore.save(
    { ...staged, items: decidedItems, status, gateState: { status: gateStatus, awaitingReview } },
    { ...options, projectId },
  );

  // Fire the SAME run-completion derivations an operator run fires (taste, people, experiment, idea,
  // outcomes). Best-effort and side-effect-only — it can never block, re-run, or send.
  const derivations = recordRunDerivations({ projectId, graph, result }, { ...options, projectId });

  return { run: savedRun, result, gate: gateReviewForRun(savedRun), derivations };
}

// ── The compile ────────────────────────────────────────────────────────────────────────────────────
// Compile a selected GTM path into a staged Run. In order: resolve the path, resolve measurement as a
// bound contract or repairable weakness, ground on both truths, normalize the RunPlan decomposition,
// reuse the compose-to-gate engine to design the executable topology, re-assert the wall, then persist.
// The run's status is "staged": it reaches the founder gate and stops. Returns { run, graph, contract, gate }.
export async function compileRunFromPath({
  projectId = "default",
  pathId = null,
  path = null,
  contract = null,
  productTruths = null,
  marketObjects = null,
  input = null,
  output = null,
  questionId = undefined,
  participantRefs = undefined,
  productRefs = undefined,
  runPlan = null,
  decompose = null,
  compose,
  options = {},
} = {}) {
  // 1. Resolve the path (injected for tests, else read from the store).
  const resolvedPath = path ?? (pathId ? gtmPathStore.get(pathId, { ...options, projectId }) : null);
  if (!resolvedPath) {
    throw new Error("compileRunFromPath needs a path or a pathId to compile.");
  }

  // 2. Bind measurement when possible; otherwise carry a repairable weakness, never a refusal.
  const resolvedContract = resolveContract({ path: resolvedPath, contract, options });
  const measurementWeakness = isBindableContract(resolvedContract) ? null : measurementWeaknessForContract(resolvedContract);

  // 3. Ground the compile on BOTH truth sides — the records the bet actually rests on.
  const grounding = buildCompileGrounding({ path: resolvedPath, projectId, productTruths, marketObjects, options });
  const normalizedRunPlan = normalizeRunPlan(
    runPlan ?? (typeof decompose === "function"
      ? await decompose({ path: resolvedPath, grounding, contract: resolvedContract, measurementWeakness })
      : {}),
    { pathId: resolvedPath.id, contract: resolvedContract },
  );
  const runContext = {
    questionId: questionId === undefined ? resolvedPath.questionId ?? null : questionId,
    participantRefs: participantRefs === undefined ? resolvedPath.participantRefs ?? [] : participantRefs,
    productRefs: productRefs === undefined ? resolvedPath.productRefs ?? [] : productRefs,
  };

  // 4. Reuse the proven compose-to-gate engine to design the executable steps. It asserts the founder
  //    gate on every path to an execute node; a run that could send without a gate never compiles.
  const channel = channelForPath(resolvedPath, runContext);
  const { nodes, edges } = await composeGraphForChannel({ channel, grounding, input, output, compose, capabilities: listCapabilities(options) });

  // 5. Re-assert the wall on the compiled topology (belt and suspenders — the wall is untouched).
  assertGateWall(nodes, edges);
  assertOrdinaryProductChangeBoundary(nodes, normalizedRunPlan);

  // 6. Stage the run: compiled-steps snapshot + the contract bound BEFORE execution + a pending gate.
  //    Nothing sends — the status is "staged" and the gate awaits the founder.
  const items = stageItemsForRun({ path: resolvedPath, input, runPlan: normalizedRunPlan, measurementWeakness });
  const gateBindings = gateBindingsForGraph(nodes, edges, items);
  const run = runStore.create(
    {
      projectId,
      pathId: resolvedPath.id,
      ...runContext,
      steps: nodes,
      edges,
      gateState: { status: "pending", awaitingReview: items.length },
      gateBindings,
      measurementContract: resolvedContract,
      measurementContractId: resolvedContract?.id ?? null,
      measurementWeakness,
      runPlan: normalizedRunPlan,
      items,
      status: "staged",
    },
    { ...options, projectId },
  );

  return { run, graph: { nodes, edges }, contract: resolvedContract, measurementWeakness, runPlan: normalizedRunPlan, gate: gateReviewForRun(run) };
}
