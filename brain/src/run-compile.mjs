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
import { gtmPathStore, measurementContractStore, runStore, productTruthStore, marketObjectStore } from "./gtm-store.mjs";
import { normalizeRunPlan } from "./graph-intelligence/compile-decompose.mjs";

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
function channelForPath(path) {
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
      reviewPayload: "diff",
      protects: "apply_patch",
      pathId: path?.id ?? null,
      ...runPlan.patch,
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
export function gateReviewForRun(run) {
  const items = Array.isArray(run?.items) ? run.items : [];
  return {
    runId: run?.id ?? null,
    pathId: run?.pathId ?? null,
    status: run?.gateState?.status ?? "pending",
    // The bound measurement contract travels with the review, so the founder sees how this run will be
    // measured at the moment they approve it — measurement is set before, not after, the send.
    measurementContract: run?.measurementContract ?? null,
    measurementWeakness: run?.measurementWeakness ?? null,
    gates: run?.gateBindings ?? [],
    items: items.map((item) => ({
      actionId: `gtm-${slug(run?.id)}-${slug(item?.joinKey)}`,
      joinKey: item?.joinKey ?? null,
      approvalStatus: "pending",
      protects: item?.protects ?? "stage_locally",
      reviewPayload: reviewPayloadForItem(item),
      item, // whatever shape was staged, carried through untouched
    })),
    awaitingReview: items.length,
  };
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

  // 4. Reuse the proven compose-to-gate engine to design the executable steps. It asserts the founder
  //    gate on every path to an execute node; a run that could send without a gate never compiles.
  const channel = channelForPath(resolvedPath);
  const { nodes, edges } = await composeGraphForChannel({ channel, grounding, input, output, compose });

  // 5. Re-assert the wall on the compiled topology (belt and suspenders — the wall is untouched).
  assertGateWall(nodes, edges);

  // 6. Stage the run: compiled-steps snapshot + the contract bound BEFORE execution + a pending gate.
  //    Nothing sends — the status is "staged" and the gate awaits the founder.
  const items = stageItemsForRun({ path: resolvedPath, input, runPlan: normalizedRunPlan, measurementWeakness });
  const gateBindings = gateBindingsForGraph(nodes, edges, items);
  const run = runStore.create(
    {
      projectId,
      pathId: resolvedPath.id,
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
