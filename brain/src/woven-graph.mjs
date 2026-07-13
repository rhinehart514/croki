// buildWovenGraph — the ONE projector that turns the three regions of the Operator lens into a single
// woven graph (docs/INTERTWINED-CANVAS.md §2, "Backend projection — one pure function"). It COMPOSES what
// getOperatingView already returns (lanes + objects + the laneKeysByObject join) plus the per-channel
// GTMGraphs already in memory, and emits one graph of three synthetic node/edge families layered over the
// real step + gate nodes:
//
//   - obj:<objectKey>            — one synthetic node per touched OperatingObject. Kind is the ledger's
//                                  OPEN string (person / geo / keyword / page / partner / change / …), never
//                                  an enum. Carries motionCount (its degree — v2 sizes on this), bucket, and
//                                  the object's provenance receipt. The 2+-touch rule rides as `draw`: only
//                                  objects touched by 2+ motions draw individually; single-touch objects
//                                  collapse to a per-lane "+N touched once" badge (see `collapsedByLane`).
//   - tie:<channelId>:<objectKey> — one synthetic edge per (lane, object) touch, from the lane's LAST
//                                  data-producing step (or its gate, if that is later) to the object node.
//                                  Carries the touch's `verb` (real, from the ledger) and the anchor step id
//                                  so a thread can label itself ("emailed", "converted via page") and land on
//                                  the exact step. An object two motions touched has two ties converging on
//                                  one node — the intertwining is the convergence, drawn once.
//   - kind:<motionKind>          — one synthetic cluster node per distinct shape-derived motion name
//                                  (deriveMotionName over the graph's own stages — an OPEN string, never an
//                                  enum), grouping the lanes whose motion matches. A pipeline whose engine
//                                  name resolves to one kind sits in one cluster; the render straddles a
//                                  blended pipeline across two clusters by listing it in both — this function
//                                  reports every kind a lane belongs to, so nothing is forced into a bucket.
//
// NOTHING here is persisted. Every obj:/tie:/kind: id is derived fresh on each call and thrown away — the
// same deriveFunnel discipline. Change the join rule and the picture changes next call with nothing to
// migrate. Pure, read-only, honest-blind: an empty project returns empty node/edge arrays and empty
// collapse/cluster maps, never a seeded node.
//
// On the "step id already in the ledger" note in the change map: the touch ledger records
// { motionId, runId, verb, at } — it does NOT persist a per-touch step id (see normalizeTouch in
// gtm-store.mjs). So the tie's anchor step is DERIVED deterministically from the lane's own graph (its last
// data-producing step, or its gate) rather than read from a field the ledger doesn't carry. The verb IS
// read from the ledger. This keeps the tie honest without inventing a ledger field.

import { deriveMotionName } from "./engine.mjs";
import { listObjectTouches } from "./gtm-store.mjs";

// The universal framing categories that are never a motion's OWN step. A tie should anchor on the motion's
// real work (its emergent middle) or its gate — never on context/resource scaffolding or a measure/learn
// tail that produced no items to touch an object with.
const UNIVERSAL_NONWORK = new Set(["context", "resource"]);

// The graph's last DATA-PRODUCING step: the rightmost node (by position.x, the same left-to-right order the
// engine and lane layout use) that is a motion's own work — not context/resource scaffolding. This is the
// causal point where the lane last touched the world, so a tie leaving it lands at the depth the crossing
// actually happens (approach 2's mean-X intent, resolved to a real anchor node). Ties then carry that x so
// the renderer can place the object chip at the mean-X of its anchors. Falls back to the gate, then to the
// rightmost node of any kind, then null for an empty graph.
function anchorStepFor(graph) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  if (!nodes.length) return null;
  const xOf = (n) => (typeof n?.position?.x === "number" ? n.position.x : 0);

  // Prefer the rightmost real work step (the last data-producing node).
  const work = nodes.filter((n) => n?.category && !UNIVERSAL_NONWORK.has(n.category) && n.category !== "gate");
  let anchor = work.length ? work.reduce((best, n) => (xOf(n) >= xOf(best) ? n : best)) : null;

  // The gate terminates the lane; if it sits at or after the last work step, anchor the tie there instead
  // so a lane whose only downstream is its gate still ties to the object honestly.
  const gate = nodes.filter((n) => n?.category === "gate").reduce((best, n) => (!best || xOf(n) > xOf(best) ? n : best), null);
  if (gate && (!anchor || xOf(gate) >= xOf(anchor))) anchor = gate;

  // Nothing categorized — fall back to the plain rightmost node so a tie still has a home.
  if (!anchor) anchor = nodes.reduce((best, n) => (xOf(n) >= xOf(best) ? n : best));

  return anchor ? { id: anchor.id, x: xOf(anchor), category: anchor.category ?? null } : null;
}

// Build a lane index by BOTH its channel graph id and its channel id, since a touch's motionId may be
// either (the ledger records whatever the run stamped). getOperatingView keys lanes by channelId === the
// graph id, so that's the primary key; we also index by any alias the caller supplies.
function indexLanes(lanes) {
  const byKey = new Map();
  for (const lane of lanes ?? []) {
    if (lane?.channelId) byKey.set(String(lane.channelId), lane);
  }
  return byKey;
}

// The touches for one object, per lane, as { laneKey → verb }. The ledger carries one record per objectKey
// with a touches[] array; each touch names its motionId (the lane) and verb. When a lane touched an object
// more than once we keep the MOST RECENT verb (touches are appended in time order) so the tie labels itself
// with what the lane last did. A touch with no motionId can't tie to a lane and is skipped.
function versByLaneFor(record) {
  const out = new Map();
  for (const t of Array.isArray(record?.touches) ? record.touches : []) {
    const laneKey = t?.motionId ? String(t.motionId) : null;
    if (!laneKey) continue;
    // Later touches overwrite earlier — the tie carries the lane's latest verb on this object.
    out.set(laneKey, { verb: t.verb ?? null, runId: t.runId ?? null, at: t.at ?? null });
  }
  return out;
}

function stableRef(type, id) {
  const value = String(id ?? "").trim();
  return value ? { type: type || null, id: value } : null;
}

function refKey(ref) {
  return ref?.id ? `${ref.type ?? "record"}:${ref.id}` : null;
}

function outcomeDisplayKind(item) {
  const kind = String(item?.outcomeKind ?? "").toLowerCase();
  if (!kind) return "unmeasured";
  if (["sent", "published", "released"].includes(kind)) return "sent";
  if (["activation", "usage", "retention", "churn"].includes(kind)) return "product-activation";
  if (["purchase", "revenue", "expansion", "conversion"].includes(kind)) return "business-outcome";
  if (["reply", "meeting", "response", "objection", "ignored"].includes(kind)) return "observed-response";
  return item?.source === "founder-entered" ? "founder-entered" : "observed-response";
}

// Result.channel is the delivery connector (gmail, slack, ...), not the pipeline that earned the
// result. Resolve operating lineage only through records already present in the canonical read: the
// compiled run owns the GTM path, while the matching flow receipt owns the executable graph and that
// graph resolves to a project-registered pipeline. Missing joins remain null instead of inventing ids.
function outcomeOperatingLineage(item, sources) {
  const compiledRun = (sources.runs ?? []).find((run) => run?.id === item?.runId) ?? null;
  const executionRun = (sources.executionRuns ?? []).find((receipt) => {
    const receiptId = receipt?.id ?? receipt?.runId ?? receipt?.result?.runId;
    return Boolean(receiptId && (receiptId === item?.executionRunId
      || (!item?.executionRunId && !compiledRun && receiptId === item?.runId)));
  }) ?? null;
  const executionRunId = executionRun?.id ?? executionRun?.runId ?? executionRun?.result?.runId ?? null;
  const graphCandidates = new Set([
    executionRun?.result?.graphId,
    executionRun?.graphId,
    compiledRun?.pathId,
  ].map((value) => String(value ?? "").trim()).filter(Boolean));
  const pipeline = (sources.pipelines ?? []).find((candidate) => candidate?.sourceKind !== "path"
    && (graphCandidates.has(String(candidate?.graphId ?? "")) || graphCandidates.has(String(candidate?.id ?? "")))) ?? null;
  const path = (sources.pipelines ?? []).find((candidate) => candidate?.sourceKind === "path"
    && candidate?.id === compiledRun?.pathId) ?? null;
  return {
    pipelineRef: stableRef("pipeline", pipeline?.id),
    graphRef: stableRef("graph", pipeline?.graphId),
    pathRef: stableRef("path", path?.id),
    runRef: stableRef("run", compiledRun?.id),
    executionRunRef: stableRef("execution-run", executionRunId),
    deliveryRef: stableRef("delivery-connector", item?.channel),
  };
}

function projectCanvas(view, knownWovenIds = []) {
  const sources = view.canvasSources;
  if (!sources) return { anchors: [], relationships: [], state: { kind: "empty", stale: false, issues: [] }, geometry: null };
  const outcomeLineageById = new Map((sources.outcomes ?? []).map((item) => [
    item.id,
    outcomeOperatingLineage(item, sources),
  ]));
  const anchors = [];
  const byRef = new Map();
  const addAnchor = (ref, kind, label, body, owner, updatedAt = null) => {
    const key = refKey(ref);
    if (!key || byRef.has(key)) return;
    const anchor = {
      id: `anchor:${key}`,
      ref,
      kind,
      label: String(label ?? "").trim() || ref.id,
      body,
      authority: { owner, id: ref.id, projectId: view.projectId, updatedAt },
    };
    byRef.set(key, anchor);
    anchors.push(anchor);
  };
  addAnchor(stableRef("project", sources.project?.id), "product", sources.project?.name, sources.project, "project-store", sources.project?.updatedAt);
  for (const item of sources.productTruth ?? []) addAnchor(stableRef("productTruth", item.id), "product-truth", item.statement, item, "gtm-product-truths", item.updatedAt);
  const model = sources.productModel;
  if (model) {
    addAnchor(stableRef("productModel", model.id), "product-model", sources.project?.name, model, "product-model-store", model.updatedAt);
    const bags = { things: "thing", relationships: "relationship", userGoals: "goal", states: "state", ia: "ia", workflows: "workflow", interactions: "interaction", transitions: "transition" };
    for (const [bag, type] of Object.entries(bags)) {
      for (const item of model[bag] ?? []) addAnchor(stableRef(type, item.id), `product-${type}`, item.name ?? item.goal ?? item.label, item, "product-model-store", model.updatedAt);
    }
  }
  for (const item of sources.crew ?? []) addAnchor(stableRef("teammate", item.ref), "teammate", item.name || item.ref, item, "crew-roster/project-agent", item.addedAt);
  for (const item of sources.questions ?? []) addAnchor(stableRef("question", item.id), "question", item.text, item, item.pinned ? "clarity-store" : "operator-artifact", item.updatedAt);
  for (const item of sources.pipelines ?? []) {
    const type = item.sourceKind === "path" ? "path" : "pipeline";
    addAnchor(stableRef(type, item.id), "pipeline", item.name ?? item.summary, item, item.sourceKind === "path" ? "gtm-paths" : "project-store.channels", item.updatedAt);
  }
  for (const item of sources.runs ?? []) addAnchor(stableRef("run", item.id), "run", item.status, item, "gtm-runs", item.updatedAt);
  for (const item of sources.executionRuns ?? []) addAnchor(stableRef("execution-run", item.id ?? item.runId), "run", item.status ?? (item.ok === false ? "failed" : "observed"), item, "flow-store", item.createdAt);
  for (const item of sources.questionArtifacts ?? []) {
    const ref = stableRef(item.sourceRef?.type ?? "question-artifact", item.sourceRef?.id ?? item.id);
    if (ref) addAnchor(ref, "question-artifact", item.statement ?? item.title ?? item.text, item, ref.type === "operator-event" || ref.type === "operator-session" ? "operator-store" : "flow-store", item.createdAt);
  }
  for (const item of sources.decisions ?? []) addAnchor(stableRef("decision", item.id), "founder-decision", item.kind, item, "feedback-ledger", item.createdAt);
  for (const item of sources.signals ?? []) addAnchor(stableRef("signal", item.id), "pinned-signal", item.summary ?? item.type, item, "product-model-store.pinnedSignals", item.observedAt);
  for (const item of sources.outcomes ?? []) {
    const { body: _body, ...metadata } = item;
    const lineage = outcomeLineageById.get(item.id);
    addAnchor(stableRef("outcome", item.id), "outcome", item.outcomeKind, {
      ...metadata,
      channelId: lineage?.pipelineRef?.id ?? null,
      lineage,
    }, "gtm-results", item.observedAt);
  }
  for (const item of sources.implications ?? []) {
    const { body: _body, ...metadata } = item;
    addAnchor(stableRef("implication", item.id), "product-implication", item.status, metadata, "outcome-ingest.implications", item.observedAt);
  }

  const relationships = [];
  const seen = new Set();
  const resolveKnownRef = (ref) => {
    if (!ref || byRef.has(refKey(ref))) return ref;
    const matches = anchors.filter((anchor) => anchor.ref.id === ref.id);
    return matches.length === 1 ? matches[0].ref : ref;
  };
  const addRelationship = (rawSource, rawTarget, kind, owner) => {
    const source = resolveKnownRef(rawSource);
    const target = resolveKnownRef(rawTarget);
    if (!source || !target) return;
    const key = `${refKey(source)}|${kind}|${refKey(target)}`;
    if (seen.has(key)) return;
    seen.add(key);
    relationships.push({
      id: `relation:${key}`,
      source,
      target,
      kind,
      resolved: byRef.has(refKey(source)) && byRef.has(refKey(target)),
      authority: { owner, projectId: view.projectId },
    });
  };
  const typed = (raw, fallback) => raw && typeof raw === "object"
    ? stableRef(raw.type ?? raw.kind ?? fallback, raw.id ?? raw.ref)
    : stableRef(fallback, raw);
  for (const question of sources.questions ?? []) {
    const q = stableRef("question", question.id);
    for (const ref of question.relevantParticipantRefs ?? question.participantRefs ?? []) addRelationship(q, typed(ref, "teammate"), "involves", "clarity-store");
    for (const ref of question.productRefs ?? []) addRelationship(q, typed(ref, "productModel"), "about", "clarity-store");
    for (const ref of question.evidenceRefs ?? []) addRelationship(typed(ref, "evidence"), q, "informs", "clarity-store");
    for (const ref of question.backlinks ?? []) addRelationship(q, typed(ref, "record"), "has-context", "source-record");
    for (const position of question.positions ?? []) {
      const positionRef = typed(position.sourceRef, "question-artifact");
      addRelationship(positionRef, q, position.relation ?? "position-on", positionRef?.type === "operator-event" ? "operator-store" : "flow-store");
      if (position.participantRef) addRelationship(typed(position.participantRef, "teammate"), positionRef, "authored", positionRef?.type === "operator-event" ? "operator-store" : "flow-store");
      for (const ref of position.evidenceRefs ?? []) addRelationship(typed(ref, "evidence"), positionRef, "supports", positionRef?.type === "operator-event" ? "operator-store" : "flow-store");
    }
  }
  for (const pipeline of sources.pipelines ?? []) {
    const p = stableRef(pipeline.sourceKind === "path" ? "path" : "pipeline", pipeline.id);
    if (pipeline.questionId) addRelationship(stableRef("question", pipeline.questionId), p, "serves", pipeline.sourceKind === "path" ? "gtm-paths" : "project-store.channels");
    for (const ref of pipeline.productRefs ?? []) addRelationship(typed(ref, "productModel"), p, "grounds", pipeline.sourceKind === "path" ? "gtm-paths" : "project-store.channels");
    for (const ref of pipeline.participantRefs ?? []) addRelationship(typed(ref, "teammate"), p, "works-on", pipeline.sourceKind === "path" ? "gtm-paths" : "project-store.channels");
    for (const ref of pipeline.restsOn ?? []) addRelationship(typed(ref, "record"), p, "supports", "gtm-paths");
  }
  for (const run of sources.runs ?? []) addRelationship(stableRef("path", run.pathId), stableRef("run", run.id), "produced", "gtm-runs");
  for (const decision of sources.decisions ?? []) {
    const d = stableRef("decision", decision.id);
    if (decision.questionId) addRelationship(stableRef("question", decision.questionId), d, "settled-by", "feedback-ledger");
    for (const ref of decision.contextRefs ?? []) {
      if (decision.sourceRef && ref?.type === decision.sourceRef.type && ref?.id === decision.sourceRef.id) continue;
      addRelationship(typed(ref, "record"), d, "context-for", "feedback-ledger");
    }
  }
  for (const signal of sources.signals ?? []) {
    addRelationship(stableRef("signal", signal.id), typed(signal.target, "productModel"), "pinned-to", "product-model-store");
  }
  for (const outcome of sources.outcomes ?? []) {
    const o = stableRef("outcome", outcome.id);
    const lineage = outcomeLineageById.get(outcome.id);
    if (lineage?.pipelineRef) addRelationship(lineage.pipelineRef, o, "resulted-in", "gtm-results");
    if (lineage?.pathRef) addRelationship(lineage.pathRef, o, "resulted-in", "gtm-results");
    if (lineage?.runRef) addRelationship(lineage.runRef, o, "produced", "gtm-results");
    if (lineage?.executionRunRef) addRelationship(lineage.executionRunRef, o, "produced", "gtm-results");
    if (outcome.questionId) addRelationship(o, stableRef("question", outcome.questionId), "returns-to", "gtm-results");
    for (const ref of outcome.productRefs ?? []) addRelationship(o, typed(ref, "productModel"), "returns-to", "gtm-results");
    for (const ref of outcome.participantRefs ?? []) addRelationship(typed(ref, "teammate"), o, "contributed-to", "gtm-results");
    for (const ref of outcome.decisionRefs ?? (outcome.decisionRef ? [outcome.decisionRef] : [])) addRelationship(typed(ref, "decision"), o, "authorized", "gtm-results");
  }
  for (const implication of sources.implications ?? []) {
    const i = stableRef("implication", implication.id);
    addRelationship(stableRef("outcome", implication.sourceOutcomeId), i, "suggests", "outcome-ingest.implications");
    if (implication.questionId) addRelationship(i, stableRef("question", implication.questionId), "returns-to", "outcome-ingest.implications");
    for (const ref of implication.productRefs ?? []) addRelationship(i, typed(ref, "productModel"), "affects", "outcome-ingest.implications");
    for (const ref of implication.participantRefs ?? []) addRelationship(typed(ref, "teammate"), i, "interpreted", "outcome-ingest.implications");
    for (const ref of implication.decisionRefs ?? (implication.decisionRef ? [implication.decisionRef] : [])) addRelationship(typed(ref, "decision"), i, "decided", "outcome-ingest.implications");
    if (implication.proposalRef) addRelationship(i, typed(implication.proposalRef, "productChangeProposal"), "staged-as", "outcome-ingest.implications");
  }

  const issues = [...(sources.state?.issues ?? [])];
  for (const relation of relationships.filter((item) => !item.resolved)) issues.push({ kind: "unresolved", ref: relation.id, owner: relation.authority.owner });
  const geometry = sources.geometry ? {
    namespace: sources.geometry.namespace ?? "project-canvas",
    // The canvas client uses this revision for compare-and-set position and viewport writes. Dropping it
    // made every refresh look like revision zero even when a layout already existed, so the first founder
    // pan after reload was correctly—but uselessly—rejected as stale.
    revision: sources.geometry.revision ?? 0,
    positions: sources.geometry.positions ?? {},
    collapsedGroups: sources.geometry.collapsedGroups ?? [],
    pinnedCrew: sources.geometry.pinnedCrew ?? [],
    viewport: sources.geometry.viewport ?? null,
    updatedAt: sources.geometry.updatedAt ?? null,
  } : null;
  const knownGeometryIds = new Set([...anchors.map((item) => item.id), ...knownWovenIds]);
  if (geometry) {
    geometry.compatibilityPositionRefs = Object.keys(geometry.positions).filter((id) => id.startsWith("obj-") && !knownGeometryIds.has(id));
    geometry.detachedPositionRefs = Object.keys(geometry.positions).filter((id) => !knownGeometryIds.has(id) && !id.startsWith("obj-"));
    for (const ref of geometry.detachedPositionRefs) issues.push({ kind: "unresolved", ref, owner: "object-graph-layout" });
  }
  const contentCount = anchors.filter((item) => item.kind !== "product").length;
  const outcomes = (sources.outcomes ?? []).map((item) => {
    const operatingLineage = outcomeLineageById.get(item.id) ?? {};
    return {
      id: item.id,
      ref: stableRef("outcome", item.id),
      body: item.body ?? null,
      kind: outcomeDisplayKind(item),
      label: item.body ?? item.outcomeKind ?? "Recorded outcome",
      status: item.status ?? (item.runId || item.executionRunId ? "observed" : "unattributed"),
      outcomeKind: item.outcomeKind ?? null,
      value: item.value ?? null,
      observedAt: item.observedAt ?? null,
      channelId: operatingLineage.pipelineRef?.id ?? null,
      questionId: item.questionId ?? null,
      productRefs: (item.productRefs ?? []).map((ref) => ref?.id ?? ref).filter(Boolean),
      crewRefs: (item.participantRefs ?? []).map((ref) => ref?.id ?? ref).filter(Boolean),
      runId: operatingLineage.runRef?.id ?? operatingLineage.executionRunRef?.id ?? null,
      authority: { owner: "gtm-results", id: item.id, projectId: view.projectId, updatedAt: item.updatedAt ?? item.observedAt ?? null },
      lineage: {
        ...operatingLineage,
        questionRef: stableRef("question", item.questionId),
        productRefs: item.productRefs ?? [],
        participantRefs: item.participantRefs ?? [],
        decisionRefs: item.decisionRefs ?? (item.decisionRef ? [item.decisionRef] : []),
      },
    };
  });
  const implications = (sources.implications ?? []).map((item) => ({
    id: item.id,
    ref: stableRef("implication", item.id),
    body: item.body ?? null,
    text: item.body ?? "",
    status: item.status ?? "proposed",
    observedAt: item.observedAt ?? null,
    sourceOutcomeId: item.sourceOutcomeId ?? null,
    questionId: item.questionId ?? null,
    productRefs: (item.productRefs ?? []).map((ref) => ref?.id ?? ref).filter(Boolean),
    disposition: item.status === "staged" ? "accepted" : "proposed",
    review: item.review ?? null,
    authority: {
      owner: "outcome-ingest.implications",
      id: item.id,
      projectId: view.projectId,
      sourceOutcomeRef: stableRef("outcome", item.sourceOutcomeId),
      sourceLearningRef: stableRef("learning", item.sourceLearningId),
    },
    lineage: {
      questionRef: stableRef("question", item.questionId),
      productRefs: item.productRefs ?? [],
      participantRefs: item.participantRefs ?? [],
      decisionRefs: item.decisionRefs ?? (item.decisionRef ? [item.decisionRef] : []),
      proposalRef: item.proposalRef ?? null,
      attribution: item.attribution ?? null,
      pipelineRef: item.review?.pipelineRef ?? null,
      graphRef: item.review?.graphRef ?? null,
    },
  }));
  return {
    anchors,
    relationships,
    outcomes,
    implications,
    state: {
      kind: !contentCount ? "empty" : issues.some((item) => item.kind !== "stale") ? "partial" : "ready",
      stale: Boolean(sources.state?.stale),
      issues,
    },
    geometry,
  };
}

// buildWovenGraph(view, opts) — the projector.
//
//   view — exactly what getOperatingView returns: { projectId, lanes[], objects[], pending, ... }.
//   opts.channelGraphs — a Map<channelId, GTMGraph> of the per-channel graphs already in memory (App's
//                        channelGraphs). Used ONLY to derive each tie's anchor step and each lane's kind;
//                        never mutated. A lane with no graph here still emits ties (anchor id null) so an
//                        object it touched is not silently dropped.
//   opts.touchRecords — the raw touch ledger (listObjectTouches output). Optional: when omitted, it is read
//                        from the store using view.projectId + opts.storeOptions. Passing it in keeps the
//                        function pure and testable and avoids a second store read when the caller already
//                        has it.
//   opts.storeOptions — passed through to listObjectTouches when touchRecords is not supplied (the temp-home
//                        root in tests, etc).
//
// Returns:
//   {
//     projectId,
//     objectNodes: [{ id:"obj:<key>", objectKey, kind, label, bucket, motionCount, touchCount,
//                     draw:boolean, provenance, laneKeys:[...], anchorMeanX:number|null }],
//     ties:        [{ id:"tie:<channelId>:<key>", channelId, objectKey, verb, runId,
//                     anchorStepId:string|null, anchorX:number|null, drawn:boolean }],
//     kindClusters:[{ id:"kind:<motionKind>", motionKind, laneKeys:[...], laneCount }],
//     laneKinds:   { <laneKey>: [<motionKind>, ...] }  // every kind each lane belongs to (blended = 2+)
//     collapsedByLane: { <laneKey>: { count, objectKeys:[...] } }  // the single-touch "+N touched once" badge
//     stats: { objectCount, drawnObjectCount, collapsedObjectCount, tieCount, drawnTieCount, kindCount }
//   }
//
// The 2+-touch rule is DATA the renderer applies, not a filter here: every object is emitted with `draw`
// set, and single-touch objects are ALSO tallied into `collapsedByLane` so the renderer can show the badge
// without re-deriving anything. A `tie.drawn` mirrors its object's `draw` so a tie to a collapsed object
// isn't rendered as an individual thread.
export function buildWovenGraph(view = {}, opts = {}) {
  const projectId = view.projectId ?? "default";
  const lanesByKey = indexLanes(view.lanes);
  const channelGraphs = opts.channelGraphs instanceof Map ? opts.channelGraphs : new Map();

  // The raw ledger — passed in (pure/testable path) or read once from the store.
  const touchRecords = Array.isArray(opts.touchRecords)
    ? opts.touchRecords
    : (() => { try { return listObjectTouches(projectId, opts.storeOptions ?? {}); } catch { return []; } })();
  const recordByKey = new Map();
  for (const r of touchRecords) {
    if (r?.objectKey) recordByKey.set(String(r.objectKey), r);
  }

  // Precompute each lane's anchor step once (used by every tie leaving that lane).
  const anchorByLane = new Map();
  for (const laneKey of lanesByKey.keys()) {
    const graph = channelGraphs.get(laneKey) ?? null;
    anchorByLane.set(laneKey, anchorStepFor(graph));
  }

  const objectNodes = [];
  const ties = [];
  const collapsedByLane = new Map(); // laneKey → { count, objectKeys[] }

  for (const obj of view.objects ?? []) {
    const objectKey = obj.objectKey;
    if (!objectKey) continue;
    const motionCount = obj.motionCount ?? 0;
    // The load-bearing scale rule: only objects 2+ motions touch draw individually.
    const draw = motionCount >= 2;

    objectNodes.push({
      id: `obj:${objectKey}`,
      objectKey,
      kind: obj.kind ?? null,
      label: obj.label ?? null,
      bucket: obj.bucket ?? null,
      motionCount,
      touchCount: obj.touchCount ?? 0,
      draw,
      provenance: obj.provenance ?? null,
      laneKeys: Array.isArray(obj.lanes) ? [...obj.lanes] : [],
      // Filled below once its ties' anchor xs are known (the mean-X placement rule, v1).
      anchorMeanX: null,
    });

    const versByLane = versByLaneFor(recordByKey.get(objectKey));
    const anchorXs = [];
    for (const laneKey of obj.lanes ?? []) {
      const anchor = anchorByLane.get(laneKey) ?? null;
      const touchMeta = versByLane.get(laneKey) ?? null;
      if (typeof anchor?.x === "number") anchorXs.push(anchor.x);
      ties.push({
        id: `tie:${laneKey}:${objectKey}`,
        channelId: laneKey,
        objectKey,
        verb: touchMeta?.verb ?? null,
        runId: touchMeta?.runId ?? null,
        anchorStepId: anchor?.id ?? null,
        anchorX: typeof anchor?.x === "number" ? anchor.x : null,
        // A tie to a collapsed (single-touch) object is not drawn as an individual thread; it rides the
        // per-lane count badge instead. Mirrors the object's draw so the renderer never re-derives it.
        drawn: draw,
      });
    }

    // The mean-X placement (v1): the object chip sits at the causal depth its touches happen at.
    const objNode = objectNodes[objectNodes.length - 1];
    objNode.anchorMeanX = anchorXs.length ? anchorXs.reduce((a, b) => a + b, 0) / anchorXs.length : null;

    // Single-touch collapse: tally the object into the one lane that touched it, so the renderer can draw a
    // "+N touched once" badge on that lane instead of an individual chip + thread.
    if (!draw) {
      const laneKey = (obj.lanes ?? [])[0] ?? null;
      if (laneKey) {
        const entry = collapsedByLane.get(laneKey) ?? { count: 0, objectKeys: [] };
        entry.count += 1;
        entry.objectKeys.push(objectKey);
        collapsedByLane.set(laneKey, entry);
      }
    }
  }

  // Kind clusters — group lanes by their shape-derived motion name (deriveMotionName over the graph's own
  // stages). A lane's kind is the graph's composer-given name when it has one (the real, goal-specific
  // identity), else its first-stage fallback — exactly what the engine and efficiency table key on, so the
  // cluster a lane joins is the SAME kind its efficiency row lives under. A lane with no loaded graph falls
  // back to the lane's own reported motionKind so it still clusters honestly rather than vanishing.
  const clusterMembers = new Map(); // motionKind → Set(laneKey)
  const laneKinds = {}; // laneKey → [motionKind, ...] (every kind a lane belongs to; 2+ = blended/straddling)
  for (const [laneKey, lane] of lanesByKey) {
    const graph = channelGraphs.get(laneKey) ?? null;
    // deriveMotionName wants the graph's own stage categories; when we have the graph, derive from it, else
    // trust the lane's precomputed motionKind (getOperatingView set it from the same engine read).
    const kinds = kindsForLane(graph, lane);
    laneKinds[laneKey] = kinds;
    for (const k of kinds) {
      if (!clusterMembers.has(k)) clusterMembers.set(k, new Set());
      clusterMembers.get(k).add(laneKey);
    }
  }
  const kindClusters = [...clusterMembers.entries()]
    .map(([motionKind, set]) => ({
      id: `kind:${motionKind}`,
      motionKind,
      laneKeys: [...set].sort(),
      laneCount: set.size,
    }))
    .sort((a, b) => b.laneCount - a.laneCount || a.motionKind.localeCompare(b.motionKind));

  const drawnObjectCount = objectNodes.filter((o) => o.draw).length;
  const drawnTieCount = ties.filter((t) => t.drawn).length;
  const canvas = projectCanvas(view, [
    ...objectNodes.map((item) => item.id),
    ...ties.map((item) => item.id),
    ...kindClusters.map((item) => item.id),
  ]);

  return {
    projectId,
    objectNodes,
    ties,
    kindClusters,
    laneKinds,
    collapsedByLane: Object.fromEntries(collapsedByLane),
    canvas,
    stats: {
      objectCount: objectNodes.length,
      drawnObjectCount,
      collapsedObjectCount: objectNodes.length - drawnObjectCount,
      tieCount: ties.length,
      drawnTieCount,
      kindCount: kindClusters.length,
    },
  };
}

// The kind(s) a lane belongs to. Primary: the shape-derived motion name from its own graph (the un-caging —
// an open string from deriveMotionName over the stages actually present, never an enum). When the lane has
// no loaded graph, fall back to its precomputed motionKind so it still clusters. A lane may report more than
// one kind only when a caller explicitly supplies additional blend kinds on the lane (lane.blendKinds) —
// this is how a pipeline whose shape straddles two motions is drawn in BOTH clusters rather than forced into
// one. We never invent a second kind; a single-shape lane returns exactly one.
function kindsForLane(graph, lane) {
  const kinds = [];
  const primary = motionKindFromGraph(graph) ?? (lane?.motionKind ? String(lane.motionKind) : null);
  if (primary) kinds.push(primary);
  // Honest straddling: if the lane itself reports blend kinds (a shape the composer flagged as spanning two
  // motions), include them so the render straddles both clusters. Open strings, de-duped, never forced.
  for (const b of Array.isArray(lane?.blendKinds) ? lane.blendKinds : []) {
    const k = b ? String(b) : null;
    if (k && !kinds.includes(k)) kinds.push(k);
  }
  // A lane with nothing to name at all still gets one honest bucket so it clusters rather than vanishing.
  if (!kinds.length) kinds.push(lane?.name ? String(lane.name) : "GTM loop");
  return kinds;
}

// The motion's shape-derived name from its graph — the same derivation the engine and efficiency table use
// (deriveMotionName over the graph's own emergent stage categories, preferring a composer-given graph name).
// Null when there is no graph to name, so the caller can fall back to the lane's precomputed kind.
function motionKindFromGraph(graph) {
  if (!graph || !Array.isArray(graph.nodes) || !graph.nodes.length) return null;
  // The emergent stage categories, left-to-right, excluding the universal framing (deriveMotionName names
  // after the first EMERGENT stage). We reuse the engine's rule: a motion's own stages are its non-universal
  // categories; a composer-given graph.name wins regardless (deriveMotionName handles that).
  const UNIVERSAL = new Set(["context", "gate", "measure", "learn", "resource"]);
  const seen = new Set();
  const cats = [];
  const sorted = [...graph.nodes].sort((a, b) => (a.position?.x ?? 0) - (b.position?.x ?? 0));
  for (const n of sorted) {
    const cat = n?.category;
    if (!cat || UNIVERSAL.has(cat) || seen.has(cat)) continue;
    seen.add(cat);
    cats.push(cat);
  }
  return deriveMotionName(cats, graph.name ?? null);
}
