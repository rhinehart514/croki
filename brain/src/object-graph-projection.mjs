import {
  productTruthStore,
  marketObjectStore,
  gtmPathStore,
  measurementContractStore,
  runStore,
  resultStore,
  persistProductTruthsFromScan,
} from "./gtm-store.mjs";
import { scanRepo } from "./scan.mjs";
import { objectGraphLayoutStore, objectGraphStore, normalizeObjectEdge, normalizeObjectNode, genObjectGraphId } from "./object-graph-store.mjs";
import { marketObjectToNode } from "./graph-intelligence/spray.mjs";
import { deriveWeaknessForGraph } from "./graph-intelligence/weakness.mjs";
import { recommend } from "./graph-intelligence/path-ranking.mjs";
import { now } from "./store-fs.mjs";

const RETIRED_SOURCE_STATUSES = new Set(["cancelled", "canceled", "superseded"]);

function sourceRef(kind, ref, preview) {
  return { kind, ref, preview: preview || ref, at: now() };
}

function objectIdForRecord(id) {
  return `obj-${id}`;
}

function slug(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64) || "item";
}

function evidenceForStored(kind, id, claim) {
  return [{ claim, source: `${kind}:${id}`, solidity: "observed", capturedAt: now() }];
}

function productTruthToNode(truth, { projectId }) {
  return normalizeObjectNode({
    id: objectIdForRecord(truth.id),
    projectId,
    domain: "product",
    type: "capability",
    maturity: "typed",
    statement: truth.statement,
    evidence: truth.evidence,
    sources: (truth.evidence ?? []).map((item) => sourceRef("scan", item.source || truth.id, item.notes || item.claim || truth.statement)),
    origin: "scan",
    originRef: truth.id,
    payload: { productTruthId: truth.id, citations: (truth.evidence ?? []).map((item) => ({ source: item.source, text: item.notes })) },
  });
}

function measurementContractToNode(contract, { projectId }) {
  return normalizeObjectNode({
    id: objectIdForRecord(contract.id),
    projectId,
    domain: "measurement",
    type: "contract",
    maturity: "execution",
    statement: contract.successCriteria || `Measure ${contract.outcomeKinds?.join(", ") || "this path"}`,
    evidence: [],
    sources: [sourceRef("run", contract.id, "stored measurement contract")],
    origin: "run",
    originRef: contract.id,
    payload: {
      measurementContractId: contract.id,
      outcomeKinds: contract.outcomeKinds ?? [],
      sources: contract.sources ?? [],
      joinKey: contract.joinKey ?? null,
      successCriteria: contract.successCriteria ?? null,
      pathId: contract.pathId ?? null,
    },
  });
}

function pathToNode(path, { projectId }) {
  const restsOn = (path.restsOn ?? []).map((ref) => {
    const id = typeof ref === "string" ? ref : ref?.id;
    return id ? { type: ref?.type ?? null, id: objectIdForRecord(id), sourceId: id } : null;
  }).filter(Boolean);
  return normalizeObjectNode({
    id: objectIdForRecord(path.id),
    projectId,
    domain: "runs",
    type: "path",
    maturity: "typed",
    statement: path.summary,
    evidence: [],
    sources: [sourceRef("run", path.id, "stored GTM path")],
    origin: "spray",
    originRef: path.id,
    payload: {
      gtmPathId: path.id,
      bet: path.bet ?? {},
      restsOn,
      rankingSignals: path.rankingSignals ?? {},
      risk: path.risk ?? null,
      measurementContractId: path.measurementContractId ? objectIdForRecord(path.measurementContractId) : null,
    },
  });
}

function runToNode(run, { projectId }) {
  const status = String(run.status || "staged").toLowerCase();
  return normalizeObjectNode({
    id: objectIdForRecord(run.id),
    projectId,
    domain: "runs",
    type: "run",
    maturity: "execution",
    statement: `Run ${run.status || "staged"} for ${run.pathId}`,
    evidence: evidenceForStored("run", run.id, "Compiled run is staged in the run ledger"),
    sources: [sourceRef("run", run.id, `run ledger · ${run.status || "staged"}`)],
    origin: "run",
    originRef: run.id,
    payload: {
      runId: run.id,
      pathId: run.pathId,
      status: run.status,
      gateState: run.gateState ?? null,
      gateBindings: run.gateBindings ?? [],
      measurementContractId: run.measurementContractId ?? null,
      measurementContract: run.measurementContract ?? null,
      measurementWeakness: run.measurementWeakness ?? null,
      runPlan: run.runPlan ?? null,
      itemCount: Array.isArray(run.items) ? run.items.length : 0,
    },
    ...(RETIRED_SOURCE_STATUSES.has(status) ? { retiredAt: run.updatedAt || now() } : {}),
  });
}

function gateNodesForRun(run, { projectId }) {
  const bindings = Array.isArray(run.gateBindings) && run.gateBindings.length
    ? run.gateBindings
    : [{ protects: "stage_locally", requiredApproval: "founder", reviewPayload: "action-summary", gateNodeId: null }];
  return bindings.map((binding, index) => {
    const protects = binding.protects || "stage_locally";
    return normalizeObjectNode({
      id: objectIdForRecord(`${run.id}:gate:${binding.gateNodeId || slug(protects) || index}`),
      projectId,
      domain: "runs",
      type: "gate",
      maturity: "execution",
      statement: `Founder approval for ${protects.replace(/_/g, " ")}`,
      evidence: evidenceForStored("run", run.id, "Gate binding is derived from the compiled execution graph"),
      sources: [sourceRef("run", run.id, `gate protects ${protects}`)],
      origin: "run",
      originRef: run.id,
      payload: {
        runId: run.id,
        gateNodeId: binding.gateNodeId ?? null,
        protects,
        requiredApproval: binding.requiredApproval || "founder",
        reviewPayload: binding.reviewPayload || "action-summary",
        gateState: run.gateState ?? null,
      },
    });
  });
}

function itemNodeForRunItem(run, item, index, { projectId }) {
  const reviewPayload = item?.reviewPayload || "action-summary";
  const isList = reviewPayload === "list" || item?.kind === "audience-list";
  const isPatch = reviewPayload === "diff" || item?.kind === "patch";
  const domain = isList ? "audience" : isPatch ? "assets" : "assets";
  const type = isList ? "list" : isPatch ? "patch" : item?.kind || "action";
  const subject = item?.subject || item?.summary || item?.plan || item?.message || item?.draft || item?.body;
  return normalizeObjectNode({
    id: objectIdForRecord(`${run.id}:item:${item?.joinKey || index}`),
    projectId,
    domain,
    type,
    maturity: "execution",
    statement: subject ? String(subject).slice(0, 140) : `Staged ${reviewPayload.replace(/_/g, " ")}`,
    evidence: evidenceForStored("run", run.id, `Staged ${reviewPayload} item exists in the run ledger`),
    sources: [sourceRef("run", run.id, `staged ${reviewPayload} · ${item?.joinKey || index}`)],
    origin: "run",
    originRef: run.id,
    payload: {
      runId: run.id,
      pathId: run.pathId,
      joinKey: item?.joinKey ?? null,
      protects: item?.protects ?? "stage_locally",
      reviewPayload,
      item,
    },
  });
}

function expandedRunId(value) {
  const id = String(value ?? "").trim();
  if (!id) return null;
  return id.startsWith("obj-") ? id.slice(4) : id;
}

const CUSTOMER_OUTCOME_KINDS = new Set(["activation", "usage", "retention", "expansion", "churn", "testimonial"]);

function resultToNode(result, { projectId }) {
  const kind = result.outcomeKind || "outcome";
  const domain = CUSTOMER_OUTCOME_KINDS.has(kind) ? "customer" : "pipeline";
  const value = result.value === null || result.value === undefined ? null : String(result.value);
  return normalizeObjectNode({
    id: objectIdForRecord(result.id),
    projectId,
    domain,
    type: kind,
    maturity: "outcome",
    statement: value ? `${kind}: ${value}` : kind,
    evidence: evidenceForStored("outcome", result.id, `Founder-entered outcome ${kind}`),
    sources: [sourceRef(result.source || "outcome", result.joinKey, `outcome ${kind} · ${result.joinKey}`)],
    origin: "ingest",
    originRef: result.id,
    payload: {
      resultId: result.id,
      runId: result.runId ?? null,
      pathId: result.pathId ?? null,
      joinKey: result.joinKey,
      value: result.value ?? null,
      observedAt: result.observedAt ?? null,
      source: result.source ?? null,
    },
  });
}

function addEdge(edges, seen, input) {
  const key = `${input.source}\0${input.target}\0${input.type}`;
  if (seen.has(key)) return;
  seen.add(key);
  edges.push(normalizeObjectEdge({
    id: input.id || genObjectGraphId("edge"),
    projectId: input.projectId,
    source: input.source,
    target: input.target,
    type: input.type,
    status: input.status || "proposed",
    basis: input.basis,
    confidence: input.confidence ?? 100,
    label: input.label,
  }));
}

function projectedEdges(nodes, { projectId }) {
  const ids = new Set(nodes.map((node) => node.id));
  const edges = [];
  const seen = new Set();
  for (const pathNode of nodes.filter((node) => node.domain === "runs" && node.type === "path")) {
    for (const ref of pathNode.payload?.restsOn ?? []) {
      if (!ids.has(ref.id)) continue;
      addEdge(edges, seen, {
        projectId,
        source: ref.id,
        target: pathNode.id,
        type: "supports",
        basis: [sourceRef("run", pathNode.originRef, "path rests on this card")],
      });
      const rested = nodes.find((node) => node.id === ref.id);
      if (rested?.domain === "market" || rested?.domain === "audience") {
        addEdge(edges, seen, {
          projectId,
          source: pathNode.id,
          target: ref.id,
          type: "targets",
          basis: [sourceRef("run", pathNode.originRef, "path targets this market card")],
        });
      } else {
        addEdge(edges, seen, {
          projectId,
          source: pathNode.id,
          target: ref.id,
          type: "uses",
          basis: [sourceRef("run", pathNode.originRef, "path uses this product proof")],
        });
      }
    }
    if (pathNode.payload?.measurementContractId && ids.has(pathNode.payload.measurementContractId)) {
      addEdge(edges, seen, {
        projectId,
        source: pathNode.id,
        target: pathNode.payload.measurementContractId,
        type: "measured_by",
        basis: [sourceRef("run", pathNode.originRef, "path measurement contract")],
      });
    }
  }
  for (const runNode of nodes.filter((node) => node.domain === "runs" && node.type === "run")) {
    const runId = runNode.payload?.runId;
    const pathObjectId = objectIdForRecord(runNode.payload?.pathId);
    if (ids.has(pathObjectId)) {
      addEdge(edges, seen, {
        projectId,
        source: pathObjectId,
        target: runNode.id,
        type: "produced",
        basis: [sourceRef("run", runId, "path compiled into this staged run")],
      });
    }
    const contractObjectId = objectIdForRecord(runNode.payload?.measurementContractId || runNode.payload?.measurementContract?.id);
    if (ids.has(contractObjectId)) {
      addEdge(edges, seen, {
        projectId,
        source: runNode.id,
        target: contractObjectId,
        type: "measured_by",
        basis: [sourceRef("run", runId, "run measurement contract")],
      });
    }
    const gateNodes = nodes.filter((node) => node.domain === "runs" && node.type === "gate" && node.payload?.runId === runId);
    const actionNodes = nodes.filter((node) => node.payload?.runId === runId && node.payload?.joinKey);
    for (const gateNode of gateNodes) {
      addEdge(edges, seen, {
        projectId,
        source: runNode.id,
        target: gateNode.id,
        type: "produced",
        basis: [sourceRef("run", runId, "run pauses at this founder gate")],
      });
      for (const actionNode of actionNodes.filter((node) => (node.payload?.protects || "stage_locally") === gateNode.payload?.protects)) {
        addEdge(edges, seen, {
          projectId,
          source: gateNode.id,
          target: actionNode.id,
          type: "produced",
          basis: [sourceRef("run", runId, "gate protects this staged action")],
        });
      }
    }
    for (const actionNode of actionNodes) {
      addEdge(edges, seen, {
        projectId,
        source: runNode.id,
        target: actionNode.id,
        type: actionNode.domain === "audience" ? "targets" : "uses",
        basis: [sourceRef("run", runId, "run staged this review item")],
      });
    }
  }
  for (const outcomeNode of nodes.filter((node) => node.maturity === "outcome")) {
    const runObjectId = outcomeNode.payload?.runId ? objectIdForRecord(outcomeNode.payload.runId) : null;
    if (runObjectId && ids.has(runObjectId)) {
      addEdge(edges, seen, {
        projectId,
        source: runObjectId,
        target: outcomeNode.id,
        type: "produced",
        basis: [sourceRef("outcome", outcomeNode.originRef, "outcome joined to this run")],
      });
    }
  }
  return edges;
}

function mergeNodes(existing, projected) {
  const byId = new Map();
  for (const node of projected) byId.set(node.id, node);
  for (const node of existing) byId.set(node.id, node);
  return [...byId.values()];
}

function mergeEdges(existing, projected) {
  const byTriple = new Map();
  for (const edge of projected) byTriple.set(`${edge.source}\0${edge.target}\0${edge.type}`, edge);
  for (const edge of existing) byTriple.set(`${edge.source}\0${edge.target}\0${edge.type}`, edge);
  return [...byTriple.values()];
}

function isRetiredNode(node) {
  if (node?.retiredAt) return true;
  const status = String(node?.payload?.status ?? node?.payload?.gateState?.status ?? node?.status ?? "").toLowerCase();
  return RETIRED_SOURCE_STATUSES.has(status) || Boolean(node?.payload?.supersededBy);
}

function visibleGraph({ projectId, nodes, edges, includeRetired = false }) {
  const visibleNodes = includeRetired ? nodes : nodes.filter((node) => !isRetiredNode(node));
  const ids = new Set(visibleNodes.map((node) => node.id));
  return {
    schemaVersion: 1,
    projectId,
    nodes: visibleNodes,
    edges: edges.filter((edge) =>
      ids.has(edge.source) &&
      ids.has(edge.target) &&
      edge.status !== "removed" &&
      (includeRetired || edge.status !== "suppressed")),
  };
}

function latestProductScanAt(productTruths = []) {
  const times = productTruths
    .map((truth) => Date.parse(truth?.scanRef?.scannedAt ?? ""))
    .filter(Number.isFinite);
  return times.length ? Math.max(...times) : 0;
}

function projectRepository(project) {
  return String(project?.sharedContext?.repository?.repo ?? "").trim() || null;
}

function projectWinEvent(project) {
  return String(project?.sharedContext?.repository?.outcome ?? "").trim() || "project_created";
}

export function objectGraphNeedsScan(project, { projectId = "default", options = {}, staleAfterMs = 6 * 60 * 60 * 1000 } = {}) {
  const repo = projectRepository(project);
  if (!repo) return false;
  const truths = productTruthStore.list({ ...options, projectId });
  if (!truths.length) return true;
  const latest = latestProductScanAt(truths);
  if (!latest) return true;
  return Date.now() - latest > staleAfterMs;
}

export function ensureObjectGraphProductScan(project, { projectId = project?.id ?? "default", options = {}, force = false } = {}) {
  const repo = projectRepository(project);
  if (!repo) return { scanned: false, reason: "no repository", created: [], skipped: 0, report: null };
  if (!force && !objectGraphNeedsScan(project, { projectId, options })) {
    return { scanned: false, reason: "current", created: [], skipped: 0, report: null };
  }
  const report = scanRepo(repo, { winEvent: projectWinEvent(project) });
  const persisted = persistProductTruthsFromScan(report, { projectId, options });
  return { scanned: true, reason: "scan-on-open", report, ...persisted };
}

// ── Close the outcome → belief loop ──────────────────────────────────────────────────────────────
// A run tested a bet. When a real outcome comes back and joins to that run's path, the beliefs the bet
// rested on are no longer guesses — the market answered. This writes that answer back onto the object
// graph so the canvas shows it, and draws the feedback stroke that was always in the vocabulary but
// never fed:
//   - a POSITIVE outcome (a reply, a booked meeting, a purchase, a signup) CONFIRMS: it raises the
//     confidence on the "supports" links from the bet's beliefs, marks them confirmed, and records the
//     outcome as real OBSERVED evidence on those belief cards — which clears their "thin evidence"
//     weakness on the next derive. The weakness recompute reads the new evidence; nothing is
//     hand-maintained in parallel.
//   - a NEGATIVE outcome (ignored, an objection) SNAPS: it cuts that confidence and marks the links
//     "challenged", which pulls their support out of each belief's proof on the next derive (the
//     weakness detectors already ignore challenged links).
//   - EITHER way it adds an "updates" edge FROM the outcome card back TO the bet it changed — the
//     return stroke the canvas draws but nothing produced until now.
// Deterministic: outcome kind → polarity → a fixed confidence delta. No model call, no new store.

// One real-world "yes" nudges a belief up; one "no" cuts deeper than a "yes" lifts — a single objection
// should outweigh a single reply. That skepticism is the same bias the founder gate is built on.
const CONFIRM_DELTA = 20;
const SNAP_DELTA = -30;

// The bet's belief links carry the "supports" verb from a belief card into the path. Those are the
// links a real outcome actually tests, so those are the ones an outcome confirms or snaps.
const TESTED_EDGE_TYPE = "supports";

const POSITIVE_OUTCOME_KINDS = new Set(["reply", "meeting", "purchase", "signup"]);
const NEGATIVE_OUTCOME_KINDS = new Set(["ignored", "objection"]);

function outcomePolarity(kind) {
  const label = String(kind ?? "").trim().toLowerCase();
  if (POSITIVE_OUTCOME_KINDS.has(label)) return "confirm";
  if (NEGATIVE_OUTCOME_KINDS.has(label)) return "snap";
  return null; // an outcome we can't read as clearly good or bad leaves the graph untouched, honestly
}

function clampConfidence(value) {
  return Math.min(100, Math.max(0, Math.round(Number(value) || 0)));
}

// Drop the derived fields so the projection recomputes them fresh from the changed evidence — storing
// them would be the parallel copy the harness forbids.
function withoutDerived(node) {
  const { weaknesses, weaknessReport, confidence, solidity, ...rest } = node;
  return rest;
}

export function closeOutcomeLoop({ result, projectId = "default", options = {} } = {}) {
  const pathId = result?.pathId ? String(result.pathId) : null;
  const polarity = outcomePolarity(result?.outcomeKind);
  // Nothing to close: an out-of-band outcome (no path) or one whose kind isn't clearly good or bad.
  if (!pathId || !polarity || !result?.id) return { closed: false };

  const pathObjectId = objectIdForRecord(pathId);
  const outcomeObjectId = objectIdForRecord(result.id);

  // The live graph names which belief links actually touch this bet and their current confidence.
  const { graph } = objectGraphForProject(projectId, options);
  const liveNodes = new Map(graph.nodes.map((node) => [node.id, node]));
  if (!liveNodes.has(pathObjectId)) return { closed: false };

  const testedEdges = graph.edges.filter(
    (edge) => edge.type === TESTED_EDGE_TYPE && edge.target === pathObjectId,
  );

  const stored = objectGraphStore.load(projectId, options);
  const edgesByTriple = new Map(
    stored.edges.map((edge) => [`${edge.source}\0${edge.target}\0${edge.type}`, edge]),
  );
  const nodesById = new Map(stored.nodes.map((node) => [node.id, node]));

  const delta = polarity === "confirm" ? CONFIRM_DELTA : SNAP_DELTA;
  const status = polarity === "confirm" ? "confirmed" : "challenged";
  const outcomeRef = {
    kind: "outcome",
    ref: `outcome:${result.id}`,
    preview: polarity === "confirm" ? "A real outcome confirmed this bet." : "A real outcome challenged this bet.",
    at: now(),
  };

  const changedBeliefIds = [];
  for (const edge of testedEdges) {
    const triple = `${edge.source}\0${edge.target}\0${edge.type}`;
    const current = edgesByTriple.get(triple) ?? edge;
    edgesByTriple.set(triple, normalizeObjectEdge({
      ...current,
      projectId,
      source: edge.source,
      target: edge.target,
      type: TESTED_EDGE_TYPE,
      status,
      basis: current.basis?.length ? current.basis : edge.basis,
      confidence: clampConfidence((current.confidence ?? 100) + delta),
    }));
    changedBeliefIds.push(edge.source);
  }

  // The feedback stroke: the outcome card updates the bet it changed.
  const updatesTriple = `${outcomeObjectId}\0${pathObjectId}\0updates`;
  edgesByTriple.set(updatesTriple, normalizeObjectEdge({
    id: edgesByTriple.get(updatesTriple)?.id || genObjectGraphId("edge"),
    projectId,
    source: outcomeObjectId,
    target: pathObjectId,
    type: "updates",
    status,
    basis: [outcomeRef],
    confidence: 100,
    label: outcomeRef.preview,
  }));

  // A positive outcome is observed proof for the beliefs under the bet. Record it on those cards so
  // their "thin evidence" weakness clears when the projection re-derives (it reads the new evidence —
  // no separate weakness ledger). A negative outcome adds no proof; the challenged links speak for it.
  if (polarity === "confirm") {
    for (const beliefId of changedBeliefIds) {
      const base = nodesById.get(beliefId) ?? liveNodes.get(beliefId);
      if (!base) continue;
      const evidence = [
        ...(Array.isArray(base.evidence) ? base.evidence : []),
        {
          claim: outcomeRef.preview,
          source: `outcome:${result.id}`,
          solidity: "observed",
          notes: `A real ${result.outcomeKind} outcome joined back to this belief.`,
          capturedAt: now(),
        },
      ];
      nodesById.set(beliefId, normalizeObjectNode(withoutDerived({ ...base, projectId, evidence })));
    }
  }

  objectGraphStore.save({
    projectId,
    nodes: [...nodesById.values()],
    edges: [...edgesByTriple.values()],
    revision: (stored.revision ?? 0) + 1,
  }, options);

  return {
    closed: true,
    polarity,
    pathId,
    supportsUpdated: testedEdges.length,
    beliefsConfirmed: polarity === "confirm" ? changedBeliefIds.length : 0,
  };
}

export function objectGraphForProject(projectId = "default", options = {}) {
  const stored = objectGraphStore.load(projectId, options);
  const productNodes = productTruthStore.list({ ...options, projectId }).map((truth) => productTruthToNode(truth, { projectId }));
  const marketNodes = marketObjectStore.list({ ...options, projectId }).map((object) => marketObjectToNode(object, { projectId }));
  const pathNodes = gtmPathStore.list({ ...options, projectId }).map((path) => pathToNode(path, { projectId }));
  const contractNodes = measurementContractStore.list({ ...options, projectId }).map((contract) => measurementContractToNode(contract, { projectId }));
  const runs = runStore.list({ ...options, projectId });
  const runNodes = runs.map((run) => runToNode(run, { projectId }));
  const gateNodes = runs.flatMap((run) => gateNodesForRun(run, { projectId }));
  const runToExpand = expandedRunId(options.expandRun);
  const itemNodes = runToExpand
    ? runs
        .filter((run) => run.id === runToExpand)
        .flatMap((run) => (run.items ?? []).map((item, index) => itemNodeForRunItem(run, item, index, { projectId })))
    : [];
  const outcomeNodes = resultStore.list({ ...options, projectId }).map((result) => resultToNode(result, { projectId }));
  const projectedNodes = [...productNodes, ...marketNodes, ...pathNodes, ...contractNodes, ...runNodes, ...gateNodes, ...itemNodes, ...outcomeNodes];
  const nodes = mergeNodes(stored.nodes ?? [], projectedNodes);
  const visible = visibleGraph({
    projectId,
    nodes,
    edges: mergeEdges(stored.edges ?? [], projectedEdges(nodes, { projectId })),
    includeRetired: options.includeRetired === true,
  });
  const graph = deriveWeaknessForGraph({
    ...visible,
    revision: stored.revision ?? 0,
    updatedAt: now(),
  });
  const layout = objectGraphLayoutStore.load(projectId, options);
  return {
    graph,
    positions: layout.positions,
    expandedRun: runToExpand ? {
      runId: runToExpand,
      itemCount: itemNodes.length,
    } : null,
    recommendation: recommend(graph, { ...options, projectId }),
  };
}
