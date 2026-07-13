// getOperatingView — the ONE Operator lens read (GTM-MACHINE.md Area 6). A pure cross-fleet projection
// that COMPOSES what already exists — it derives nothing new and seeds nothing:
//
//   - per channel: getEngineState (its emergent stages + derived health) over the channel's own graph +
//     runs + live connectors — the SAME figures the engine node badge shows, never a second number;
//   - deriveMotionEfficiency (Area 7): the one per-motion efficiency table, matched onto each lane by
//     its shape-derived motionKind so the lane's outcome row is the same row the Measure table renders;
//   - the touch ledger (Area 1, via deriveFunnel): every touched object drawn ONCE, tied to the lanes
//     that touched it (a touch's motionId IS the channel/graph id, so the tie is a direct match);
//   - project channel status + getPendingInbox: the parked state that pulses a lane and routes one click
//     to the real founder gate;
//   - Area 4's operation plan (when supplied): its not-yet-run motions as proposed lanes in the SAME
//     grammar — a grounded code-native motion reads different from a bet, but it is the same lane shape.
//
// STRICTLY read-only. No writes, no run triggers, no gate. It emits no next-move prose — it renders state
// and hands back the ties/decisions the lens routes to. Every health number and object bucket carries a
// provenance receipt so a founder can trace it back to the run/outcome that produced it.

import { getEngineState } from "./engine.mjs";
import { getProjectChannels, loadProject, loadProjectReadOnly, projectAgents } from "./project-store.mjs";
import { loadFlow } from "./flow-store.mjs";
import { listConnectors } from "./connectors/registry.mjs";
import { deriveMotionEfficiency, projectProductImplications } from "./outcome-ingest.mjs";
import { deriveFunnel } from "./object-funnel.mjs";
import { getPendingInbox } from "./pending-inbox.mjs";
import { listUnroutedInputs } from "./inputs-store.mjs";
import { buildWovenGraph } from "./woven-graph.mjs";
import { getProductModel } from "./product-model-store.mjs";
import { crewRosterStore } from "./crew-roster-store.mjs";
import { projectQuestions } from "./clarity-store.mjs";
import { loadFeedbackLedger } from "./feedback-ledger.mjs";
import { gtmPathStore, productTruthStore, resultStore, runStore } from "./gtm-store.mjs";
import { objectGraphLayoutStore, PROJECT_CANVAS_LAYOUT_NAMESPACE } from "./object-graph-store.mjs";
import { getOperatorSession, listOperatorSessions } from "./operator-store.mjs";
import { listGoalRelations, listGoals } from "./goal-store.mjs";
import { listWorkArtifacts, listWorkRelationships } from "./work-artifact-store.mjs";
import { listCanvasRegions } from "./canvas-region-store.mjs";
import { listGoalConflictDecisions } from "./goal-conflict-decision-store.mjs";
import { projectOpenCanvas } from "./open-canvas-projection.mjs";
import { listProductChangeReceipts } from "./product-change-receipts.mjs";

// Map a subsystem's derived health onto the lens's stage vocabulary. getEngineState exposes per-
// subsystem health only (no explicit state word); the lens needs done / active / waiting / blind. The
// active step is decided by the caller (the live runningNodeId), not the engine, so `activeId` is passed
// in. This never fabricates: a subsystem with no signal reads "blind", not 0-done.
function stageState(subsystem, activeId) {
  if (!subsystem) return "idle";
  if (activeId && (subsystem.id === activeId)) return "active";
  if (typeof subsystem.health === "number") {
    if (subsystem.health >= 66) return "done";
    if (subsystem.health > 0) return "waiting";
    return "blind";
  }
  return "idle";
}

// The lane's emergent stage strip — the motion's OWN stages in flow order. getEngineState partitions its
// subsystems around the gate in flow order; we keep that order and drop the universal framing stages
// (research/context/measure/learn) that aren't the motion's own steps, so an outbound lane and a page
// lane each read their own middle, never a shared skeleton.
const FRAMING_STAGES = new Set(["research", "context", "measure", "learn"]);
function lanesStagesFrom(engine, activeId) {
  const subs = Array.isArray(engine?.subsystems) ? engine.subsystems : [];
  return subs
    .filter((s) => !FRAMING_STAGES.has(s.id))
    .map((s, i) => ({
      id: s.id ?? `stage-${i}`,
      label: s.label ?? s.id ?? `Step ${i + 1}`,
      state: stageState(s, activeId),
      active: Boolean(activeId && s.id === activeId),
    }));
}

// A lane's single health figure — the mean of its OWN motion stages' health, the same numbers the engine
// node badges show (no second figure invented). Universal framing stages are excluded so an unbuilt
// Learn phantom never drags a real motion's health toward zero. A motion with no stages reads 0 (blind).
function laneHealth(engine) {
  const subs = (Array.isArray(engine?.subsystems) ? engine.subsystems : [])
    .filter((s) => !FRAMING_STAGES.has(s.id) && typeof s.health === "number");
  if (!subs.length) return 0;
  return Math.round(subs.reduce((sum, s) => sum + s.health, 0) / subs.length);
}

// Health provenance — where a lane's health number came from, in plain words plus the ids that let the
// lens route to the real run. A motion with no run yet reads honestly as a bet; a run-backed one is
// grounded and names the last run it read.
function healthProvenance(runs) {
  const lastRun = Array.isArray(runs) ? runs.at(-1) : null;
  if (!lastRun) {
    return { basis: "no run yet — nothing observed", kind: "bet", runId: null, outcomeId: null, probe: null };
  }
  const runCount = runs.length;
  return {
    basis: runCount === 1 ? "from 1 run of this motion" : `from ${runCount} runs of this motion`,
    kind: "grounded",
    runId: lastRun.runId ?? lastRun.id ?? null,
    outcomeId: null,
    probe: null,
  };
}

// The efficiency row for a lane, matched by motionKind. deriveMotionEfficiency keys every row by the
// shape-derived motionKind, which the engine derives from the SAME graph shape as the motion name
// (deriveMotionName). So the lane's motion name is the join key onto its own efficiency row — the SAME
// row the Measure table shows. Honest-null when a motion has no row yet.
function efficiencyForLane({ effByKind, motionKind }) {
  const row = motionKind ? effByKind.get(motionKind) : null;
  if (!row) return null;
  const staged = row.staged ?? 0;
  return {
    motionKind: row.motionKind ?? motionKind ?? null,
    staged,
    measured: row.measured ?? 0,
    coverage: staged > 0 ? Math.min(1, (row.measured ?? 0) / staged) : null,
    outcomesByKind: row.outcomesByKind ?? {},
    lastOutcomeAt: row.lastOutcomeAt ?? null,
  };
}

// The object provenance — a touched object's bucket is derived at read time from its touches + outcome
// joins (deriveFunnel), never a stored state. The receipt says which and names the touch count.
function objectProvenance(obj) {
  const grounded = obj.touchCount > 0;
  return {
    basis: grounded
      ? `${obj.bucket} — derived from ${obj.touchCount} touch${obj.touchCount === 1 ? "" : "es"} across ${obj.motionCount} motion${obj.motionCount === 1 ? "" : "s"}`
      : "seen — no touch recorded yet",
    kind: grounded ? "grounded" : "bet",
    runId: null,
    outcomeId: null,
    probe: null,
  };
}

// Which lanes (channelIds) touched each object. A touch's motionId is the channel/graph id, so the
// funnel object's touching-motion set IS its lane set. deriveFunnel already counts distinct motions, but
// it doesn't return the motion ids; so we thread the ledger's touches through by reading them here.
import { listObjectTouches } from "./gtm-store.mjs";
function laneKeysByObject(projectId, options) {
  const map = new Map();
  let records = [];
  try { records = listObjectTouches(projectId, options); } catch { records = []; }
  for (const record of records) {
    if (!record?.objectKey) continue;
    const lanes = new Set();
    for (const t of Array.isArray(record.touches) ? record.touches : []) {
      if (t.motionId) lanes.add(String(t.motionId));
    }
    map.set(record.objectKey, [...lanes]);
  }
  return map;
}

// A run-state read for a lane: parked (a run waiting at the founder gate — the lane pulses, one click
// flies to it), running (a live run), error (a failed run), or idle. Derived from the channel's derived
// status + the pending inbox's decision for this lane. Never a stored flag.
function runStateForLane({ channel, parkedByPipeline }) {
  const parked = parkedByPipeline.get(channel.graphId) ?? parkedByPipeline.get(channel.id) ?? null;
  if (parked) {
    return {
      runState: "parked",
      parked: {
        decisionId: parked.id,
        sessionId: parked.sessionId ?? null,
        pipelineId: parked.pipelineId ?? channel.graphId ?? null,
        waitingSince: parked.waitingSince ?? null,
      },
    };
  }
  if (channel.status === "running") return { runState: "running", parked: null };
  if (channel.lastRunOk === false) return { runState: "error", parked: null };
  return { runState: "idle", parked: null };
}

// A proposed plan motion (Area 4) as a lane — same shape, `proposed:true`, no run/efficiency, its origin
// mirroring the plan's derived-vs-speculative label so a grounded code-native motion looks distinct from
// a bet. The channelId is a stable synthetic key (the plan doesn't persist) so React keys stay stable.
function proposedLaneFromMotion(motion, index) {
  const origin = motion.origin === "derived" ? "derived" : "speculative";
  return {
    channelId: `plan:${index}:${String(motion.type ?? motion.label ?? index).slice(0, 60)}`,
    name: String(motion.label ?? motion.type ?? "Proposed motion"),
    motionKind: motion.type ? String(motion.type) : null,
    health: 0,
    healthProvenance: {
      basis: origin === "derived" ? "proposed from your code — not run yet" : "a bet — not run yet",
      kind: "bet", runId: null, outcomeId: null, probe: null,
    },
    stages: [],
    efficiency: null,
    runState: "idle",
    parked: null,
    proposed: true,
    origin,
    rationale: motion.rationale ? String(motion.rationale) : null,
    objectKeys: [],
  };
}

function sourceRead(owner, fallback, read) {
  try { return { owner, available: true, value: read() }; }
  catch { return { owner, available: false, value: fallback }; }
}

function operatorQuestionArtifacts(projectId, options) {
  const transientQuestions = [];
  const positions = [];
  const sourceRecords = [];
  const summaries = listOperatorSessions({ ...options, projectId });
  for (const summary of summaries) {
    let session;
    try { session = getOperatorSession(summary.id, options); } catch { continue; }
    sourceRecords.push({ ...session, projectId, sourceRef: { type: "operator-session", id: session.id } });
    if (session.pendingQuestion) {
      const pending = typeof session.pendingQuestion === "object" ? session.pendingQuestion : { question: session.pendingQuestion };
      transientQuestions.push({
        ...pending,
        id: pending.id ?? `${session.id}:pending-question`,
        projectId,
        participantRefs: pending.participantRefs ?? session.participantRefs,
        productRefs: pending.productRefs ?? session.productRefs,
        sourceRef: { type: "operator-session", id: session.id },
        createdAt: pending.createdAt ?? session.updatedAt,
      });
    }
    for (const event of session.events ?? []) {
      const data = event?.data && typeof event.data === "object" ? event.data : {};
      const position = data.position && typeof data.position === "object" ? data.position : data;
      const questionId = position.questionId ?? data.questionId ?? session.questionId;
      const statement = position.statement ?? position.claim ?? position.answer ?? position.recommendation;
      if (questionId && statement) {
        positions.push({
          ...position,
          id: position.id ?? event.id,
          projectId,
          questionId,
          statement,
          participantRef: position.participantRef ?? position.teammateRef ?? position.agentRef ?? data.ref,
          sourceRef: { type: "operator-event", id: event.id },
          createdAt: event.createdAt,
        });
      }
      if (questionId) sourceRecords.push({
        ...event,
        projectId,
        questionId,
        sourceRef: { type: "operator-event", id: event.id },
      });
    }
  }
  return { transientQuestions, positions, sourceRecords };
}

function executionQuestionArtifacts(projectId, flowRuns) {
  const positions = [];
  const sourceRecords = [];
  for (const run of flowRuns) {
    const questionId = run.questionId ?? run.result?.questionId ?? run.result?.workContext?.questionId ?? null;
    const runId = run.id ?? run.runId ?? run.result?.runId;
    if (questionId && runId) sourceRecords.push({
      ...run,
      id: runId,
      projectId,
      questionId,
      sourceRef: { type: "execution-run", id: runId },
    });
    for (const [nodeId, node] of Object.entries(run.result?.nodes ?? {})) {
      for (const [index, item] of (node?.items ?? []).entries()) {
        const itemQuestionId = item?.questionId ?? node?.questionId ?? questionId;
        const statement = item?.statement ?? item?.claim ?? item?.answer ?? item?.recommendation;
        if (!itemQuestionId || !statement) continue;
        positions.push({
          ...item,
          id: item.id ?? `${runId}:${nodeId}:${index}`,
          projectId,
          questionId: itemQuestionId,
          statement,
          participantRef: item.participantRef ?? item.teammateRef ?? item.agentRef,
          sourceRef: { type: "run-item", id: item.id ?? `${runId}:${nodeId}:${index}` },
          createdAt: run.createdAt ?? null,
        });
      }
    }
  }
  return { positions, sourceRecords };
}

// The reply-shaped world-signals still sitting UNROUTED in the inbox — warm leads the market sent back that
// the founder hasn't decided on yet. The recorded-outcome ledger (resultStore) only holds replies that have
// already been ingested/joined; a reply that just landed and is still "in play" lives here, in the input
// store, until the founder decides together with the crew what it feeds. The experiment-machine spec wants
// THESE to loop back to the front of the pipeline that earned them — visible motion, not a panel row.
//
// This is a PURE PROJECTION over data the backend already holds: it mints no new authority, schema, or enum.
// Each unrouted reply is folded into the SAME outcomes stream as a synthetic warm outcome, carrying the
// run id it joins to (from the inbound reader's stamped joinKey/runId) so the existing outcome lineage
// resolves its originating pipeline — and its outcomeKind is 'reply', which outcomeDisplayKind already maps
// to 'observed-response' (the warm/ember register the loop-back layer draws). A reply with no resolvable run
// carries a null runId; the loop-back layer then honestly skips it (no pipeline front to circle back to) —
// never a stranded or invented stroke. Nothing here is persisted; it re-derives on every re-weave.
function warmReplyOutcomes(projectId, runs, existingOutcomes, options) {
  let unrouted = [];
  try { unrouted = listUnroutedInputs(projectId, options); } catch { return []; }
  const replyKinds = new Set(["reply", "response", "meeting", "objection"]);
  // A reply already recorded as an outcome (same joinKey) must not double-draw — the recorded one wins.
  const recordedJoinKeys = new Set(
    (existingOutcomes ?? []).map((o) => String(o?.joinKey ?? "").trim()).filter(Boolean),
  );
  // Resolve a reply's origin run by matching its stamped joinKey against a staged run item's joinKey — the
  // same deterministic join outcome-ingest uses; no model call, no invention. Direct payload.runId wins.
  const runByJoinKey = new Map();
  for (const run of runs ?? []) {
    const receiptItems = Object.values(run?.result?.nodes ?? {}).flatMap((node) => node?.items ?? []);
    for (const item of [...(run?.items ?? []), ...receiptItems]) {
      const key = String(item?.joinKey ?? "").trim();
      if (key && !runByJoinKey.has(key)) runByJoinKey.set(key, run.id ?? run.runId ?? run.result?.runId);
    }
  }
  const out = [];
  for (const input of unrouted) {
    const kind = String(input?.kind ?? "").trim().toLowerCase();
    if (!replyKinds.has(kind)) continue;
    const payload = input?.payload ?? {};
    const joinKey = String(payload.joinKey ?? "").trim();
    if (joinKey && recordedJoinKeys.has(joinKey)) continue; // already loops back as a recorded outcome.
    const runId = String(payload.runId ?? "").trim() || (joinKey ? runByJoinKey.get(joinKey) ?? null : null);
    out.push({
      id: `pending-reply:${input.id}`,
      runId,
      joinKey: joinKey || null,
      outcomeKind: kind,          // → outcomeDisplayKind → 'observed-response' (warm register).
      body: String(payload.summary ?? payload.body ?? input.source ?? "").trim() || "Reply in play",
      value: null,
      status: "observed",
      observedAt: input.receivedAt ?? null,
      updatedAt: input.receivedAt ?? null,
      productRefs: [],
      participantRefs: [],
      // A stable marker so a downstream reader can tell a still-in-play inbox reply from a recorded result.
      pending: true,
    });
  }
  return out;
}

function canvasSources(project, channels, flowRuns, options) {
  const projectId = project.id;
  const overrides = options.terrainSourceReaders ?? {};
  const read = (key, owner, fallback, reader) => sourceRead(owner, fallback, () => (
    typeof overrides[key] === "function" ? overrides[key]({ projectId, project, options }) : reader()
  ));
  const truth = read("productTruth", "gtm-product-truths", [], () => productTruthStore.list({ ...options, projectId }));
  const model = read("productModel", "product-model-store", null, () => getProductModel(projectId, { ...options, projectId }));
  const includeLegacy = options.includeLegacyMachinery === true || process.env.GTM_IDE_ENABLE_LEGACY_MACHINERY === "1";
  const paths = includeLegacy
    ? read("paths", "gtm-paths", [], () => gtmPathStore.list({ ...options, projectId }))
    : { owner: "gtm-paths", value: [], available: true };
  const runs = includeLegacy
    ? read("runs", "gtm-runs", [], () => runStore.list({ ...options, projectId }))
    : { owner: "gtm-runs", value: [], available: true };
  const outcomes = read("outcomes", "gtm-results", [], () => resultStore.list({ ...options, projectId }));
  const implications = read("implications", "outcome-ingest.implications", [], () => projectProductImplications({ projectId }, options));
  const feedback = read("feedback", "feedback-ledger", { signals: [], decisions: [] }, () => loadFeedbackLedger(projectId, options));
  const operatorArtifacts = read("operatorArtifacts", "operator-store", { transientQuestions: [], positions: [], sourceRecords: [] }, () => operatorQuestionArtifacts(projectId, options));
  const executionArtifacts = executionQuestionArtifacts(projectId, flowRuns);
  const questions = read("questions", "clarity-store", [], () => projectQuestions(projectId, {
    transientQuestions: operatorArtifacts.value.transientQuestions,
    positions: [...operatorArtifacts.value.positions, ...executionArtifacts.positions],
    sourceRecords: [
      ...(includeLegacy ? [...paths.value, ...runs.value] : []), ...outcomes.value,
      ...operatorArtifacts.value.sourceRecords, ...executionArtifacts.sourceRecords,
    ],
  }, options));
  const usedCrew = read("projectAgents", "project-agent-projection", [], () => projectAgents(projectId, options));
  const roster = read("crewRoster", "crew-roster-store", { members: [] }, () => crewRosterStore.load(projectId, options));
  const geometry = read("geometry", "object-graph-layout", {
    revision: 0, positions: {}, collapsedGroups: [], pinnedCrew: [], viewport: null, updatedAt: null,
  }, () => objectGraphLayoutStore.loadNamespace(projectId, PROJECT_CANVAS_LAYOUT_NAMESPACE, options));
  const crew = new Map();
  for (const member of [...usedCrew.value, ...(roster.value.members ?? [])]) {
    if (!member?.ref) continue;
    crew.set(member.ref, { ...crew.get(member.ref), ...member, ref: member.ref });
  }
  const scanTimes = truth.value.map((item) => Date.parse(item?.scanRef?.scannedAt ?? "")).filter(Number.isFinite);
  const latestScanAt = scanTimes.length ? new Date(Math.max(...scanTimes)).toISOString() : null;
  const issues = [truth, model, paths, runs, outcomes, implications, feedback, operatorArtifacts, questions, usedCrew, roster, geometry]
    .filter((read) => !read.available)
    .map((read) => ({ kind: "unavailable", owner: read.owner }));
  if (project.sharedContext?.repository?.repo && !truth.value.length && truth.available) {
    issues.push({ kind: "missing", owner: truth.owner, detail: "Repository configured with no cited product truth." });
  }
  if (latestScanAt && Date.now() - Date.parse(latestScanAt) > 6 * 60 * 60 * 1000) {
    issues.push({ kind: "stale", owner: truth.owner, at: latestScanAt });
  }
  if (model.value?.groundingRef?.scannedAt && latestScanAt
    && Date.parse(model.value.groundingRef.scannedAt) < Date.parse(latestScanAt)) {
    issues.push({ kind: "stale", owner: model.owner, at: model.value.groundingRef.scannedAt });
  }
  for (const pin of model.value?.pinnedSignals ?? []) {
    if (!(feedback.value.signals ?? []).some((item) => item.id === pin.signalId)) {
      issues.push({ kind: "unresolved", owner: feedback.owner, ref: pin.signalId });
    }
  }
  return {
    project,
    productTruth: truth.value,
    productModel: model.value,
    crew: [...crew.values()],
    questions: questions.value,
    pipelines: [
      ...channels.map((item) => ({ ...item, sourceKind: "channel" })),
      ...(includeLegacy ? paths.value.map((item) => ({ ...item, sourceKind: "path" })) : []),
    ],
    runs: runs.value,
    executionRuns: flowRuns,
    questionArtifacts: [
      ...operatorArtifacts.value.positions,
      ...operatorArtifacts.value.sourceRecords,
      ...executionArtifacts.positions,
      ...executionArtifacts.sourceRecords,
    ],
    decisions: feedback.value.decisions ?? [],
    signals: (model.value?.pinnedSignals ?? []).map((pin) => ({
      ...pin,
      resolved: (feedback.value.signals ?? []).some((item) => item.id === pin.signalId),
    })),
    // Recorded outcomes plus the still-in-play warm replies from the inbox — both loop back on the canvas.
    // The pending replies ride the SAME outcome projection so no second code path or authority is created.
    outcomes: [...outcomes.value, ...warmReplyOutcomes(projectId, [...runs.value, ...flowRuns], outcomes.value, options)],
    implications: implications.value,
    geometry: geometry.value,
    state: {
      kind: issues.some((item) => item.kind !== "stale") ? "partial" : "ready",
      stale: issues.some((item) => item.kind === "stale"),
      issues,
    },
  };
}

function buildOperatingView(project, options = {}) {
  const resolvedProjectId = project.id;
  // Projection readers that need the project receive this already-scoped snapshot. In particular,
  // projectAgents must not fall back to the mutable active-project catalog during a terrain read.
  const sourceOptions = { ...options, project };

  const channels = getProjectChannels(project, sourceOptions);
  const connectors = (() => { try { return listConnectors(); } catch { return []; } })();

  // The one efficiency table, indexed by motionKind so each lane picks up its own row.
  const efficiency = (() => {
    try { return deriveMotionEfficiency({ projectId: resolvedProjectId }, sourceOptions); }
    catch { return { motions: [] }; }
  })();
  const effByKind = new Map();
  for (const row of efficiency.motions ?? []) {
    if (row.motionKind) effByKind.set(row.motionKind, row);
  }

  // The pending founder decisions across this project — the parked lanes and the inbox rows the lens
  // routes to. Scoped to this project so a lane pulses only for its own gate.
  const inbox = (() => {
    try { return getPendingInbox({ projectId: resolvedProjectId }, sourceOptions); }
    catch { return { decisions: [] }; }
  })();
  const parkedByPipeline = new Map();
  for (const d of inbox.decisions ?? []) {
    // Only gate/proposal/ideas/candidates decisions park a lane; a loose world-signal isn't a lane's gate.
    if (d.pipelineId) parkedByPipeline.set(String(d.pipelineId), d);
  }

  // The shared map: every touched object once (deriveFunnel), with the lane keys that touched it.
  const funnel = (() => {
    try { return deriveFunnel(resolvedProjectId, sourceOptions); }
    catch { return { kinds: [] }; }
  })();
  const laneKeys = laneKeysByObject(resolvedProjectId, sourceOptions);

  const objects = [];
  for (const group of funnel.kinds ?? []) {
    for (const obj of group.objects ?? []) {
      objects.push({
        objectKey: obj.objectKey,
        kind: obj.kind,
        label: obj.label ?? null,
        bucket: obj.bucket,
        lanes: laneKeys.get(obj.objectKey) ?? [],
        motionCount: obj.motionCount ?? 0,
        touchCount: obj.touchCount ?? 0,
        lastSeenAt: obj.lastSeenAt ?? null,
        provenance: objectProvenance(obj),
      });
    }
  }

  // A quick lane-key → object-keys index so each lane names the objects it touched (the tie endpoints).
  const objectKeysByLane = new Map();
  for (const obj of objects) {
    for (const laneKey of obj.lanes) {
      if (!objectKeysByLane.has(laneKey)) objectKeysByLane.set(laneKey, []);
      objectKeysByLane.get(laneKey).push(obj.objectKey);
    }
  }

  // Build a lane per built channel from its own engine read. Collect each lane's loaded graph as we go —
  // buildWovenGraph reuses these (already in hand for the engine read, so no second disk read) to anchor
  // ties on real steps and derive each lane's kind. Keyed by graphId, the same key lanes carry.
  const channelGraphs = new Map();
  const flowRuns = [];
  const lanes = [];
  for (const channel of channels) {
    if (!channel.graphId) continue;
    const { graph, runs } = (() => {
      try { return loadFlow(channel.graphId, null, sourceOptions); }
      catch { return { graph: null, runs: [] }; }
    })();
    if (graph) channelGraphs.set(channel.graphId, graph);
    flowRuns.push(...(runs ?? []));
    const engine = getEngineState({ graph, runs: runs ?? [], connectors, results: [] });
    // The motion's shape-derived name IS its efficiency-table key (both go through deriveMotionName over
    // the same graph). The engine puts it on `motion.name`; fall back to the channel name only for a lane
    // with no built graph (which won't match a row, and reads honestly unmeasured).
    const motionKind = engine?.motion?.name ?? channel.name ?? channel.graphId;
    const { runState, parked } = runStateForLane({ channel, parkedByPipeline });
    lanes.push({
      channelId: channel.graphId,
      name: engine?.motion?.name ?? channel.name ?? channel.graphId,
      motionKind,
      health: laneHealth(engine),
      healthProvenance: healthProvenance(runs ?? []),
      stages: lanesStagesFrom(engine, null),
      efficiency: efficiencyForLane({ effByKind, motionKind }),
      runState,
      parked,
      proposed: false,
      objectKeys: objectKeysByLane.get(channel.graphId) ?? objectKeysByLane.get(channel.id) ?? [],
    });
  }

  // Proposed plan lanes (Area 4) — supplied by the caller when a fresh plan read is on hand, rendered in
  // the same grammar. The plan does not persist; it's regenerated on demand, so the view never fetches
  // it itself (that would spend the subscription on every lens read). When absent, no proposed lanes.
  const planMotions = Array.isArray(options.planMotions) ? options.planMotions : [];
  planMotions.forEach((motion, i) => lanes.push(proposedLaneFromMotion(motion, i)));
  const projectedCanvasSources = canvasSources(project, channels, flowRuns, sourceOptions);

  const view = {
    projectId: resolvedProjectId,
    lanes,
    objects,
    pending: inbox.decisions ?? [],
    planStale: options.planStale === true ? true : undefined,
    generatedAt: new Date().toISOString(),
  };

  // The intertwined canvas's one woven projection (docs/INTERTWINED-CANVAS.md §2) — object/tie/kind
  // families over the same lanes + objects, computed from the graphs already loaded above and the touch
  // ledger the store already holds. Nothing new is read from disk; it's a reshape of what this view built.
  // Attached so the canvas gets real ties (with ledger verbs) and kinds without a second round trip. A
  // failure here never breaks the base read — the canvas degrades to the raw lanes/objects.
  // The woven projection MUST speak the same lane-id space the client canvas namespaces its step nodes with:
  // the BARE channel.id (App keys channelGraphs, and the merged canvas keys step nodes as `${channel.id}::…`).
  // This view's lanes/objects/channelGraphs above are keyed by graphId (and the ledger may stamp either), so
  // normalize every lane key to the bare channel.id for the woven build ONLY — the base lanes/objects stay
  // untouched for their other consumers. Without this, a tie references `${graphId}::step` while the canvas
  // node is `${channelId}::step`, so every tie and every object chip is silently dropped and the weave renders
  // empty (docs/INTERTWINED-CANVAS.md id-namespace defect).
  view.woven = (() => {
    try {
      const bareIdOf = new Map();
      for (const channel of channels) {
        if (!channel?.id) continue;
        bareIdOf.set(String(channel.id), String(channel.id));
        if (channel.graphId) bareIdOf.set(String(channel.graphId), String(channel.id));
      }
      const norm = (k) => (k == null ? k : (bareIdOf.get(String(k)) ?? String(k)));
      const wovenView = {
        ...view,
        canvasSources: projectedCanvasSources,
        lanes: (view.lanes ?? []).map((l) => ({ ...l, channelId: norm(l.channelId) })),
        objects: (view.objects ?? []).map((o) => ({ ...o, lanes: (o.lanes ?? []).map(norm) })),
      };
      const wovenChannelGraphs = new Map();
      for (const [gid, g] of channelGraphs) wovenChannelGraphs.set(norm(gid), g);
      const woven = buildWovenGraph(wovenView, { channelGraphs: wovenChannelGraphs, storeOptions: sourceOptions });
      // Goals and open work are independent authorities projected onto the same canvas. An empty
      // authority is ordinary; a corrupt/unavailable authority degrades the read through the outer
      // catch without changing any of the established truth, gate, outcome, or geometry authorities.
      const authorityIssues = [];
      const safeRead = (owner, read) => {
        try { return read(); }
        catch (error) {
          authorityIssues.push({ kind: "unavailable", owner, detail: error instanceof Error ? error.message : String(error) });
          return [];
        }
      };
      woven.canvas = projectOpenCanvas(woven.canvas, {
        projectId: resolvedProjectId,
        goals: safeRead("goal-store", () => listGoals(resolvedProjectId, sourceOptions)),
        goalRelations: safeRead("goal-store", () => listGoalRelations(resolvedProjectId, sourceOptions)),
        artifacts: safeRead("work-artifact-store", () => listWorkArtifacts(resolvedProjectId, sourceOptions)),
        workRelationships: safeRead("work-artifact-store", () => listWorkRelationships(resolvedProjectId, sourceOptions)),
        productChanges: safeRead("product-change-receipts", () => listProductChangeReceipts(resolvedProjectId, sourceOptions)),
        regions: safeRead("canvas-region-store", () => listCanvasRegions(resolvedProjectId, sourceOptions)),
        conflictDecisions: safeRead("goal-conflict-decision-store", () => listGoalConflictDecisions(resolvedProjectId, sourceOptions).decisions),
      });
      if (authorityIssues.length) {
        woven.canvas.state.issues.push(...authorityIssues);
        woven.canvas.state.kind = "partial";
      }
      return woven;
    } catch { return null; }
  })();

  return view;
}

// Compatibility read. It deliberately keeps the historical active-project fallback and response shape.
export function getOperatingView({ projectId } = {}, options = {}) {
  const project = loadProject(projectId ? { ...options, projectId } : options);
  return buildOperatingView(project, options);
}

function ref(type, id) {
  const value = String(id ?? "").trim();
  return value ? { type, id: value } : null;
}

function refKey(value) {
  return value?.type && value?.id ? `${value.type}:${value.id}` : null;
}

function terrainRef(raw, fallbackType, projectId) {
  if (!raw) return null;
  const value = typeof raw === "string" ? { type: fallbackType, id: raw } : raw;
  const rawType = String(value.type ?? value.kind ?? fallbackType ?? "record").trim();
  const canonicalTypes = new Map([
    ["producttruth", "productTruth"],
    ["productmodel", "productModel"],
    ["terrain-read", "terrain-read"],
    ["terrain-hypothesis", "terrain-hypothesis"],
  ]);
  const type = canonicalTypes.get(rawType.toLowerCase()) ?? rawType.toLowerCase();
  const id = String(value.id ?? value.ref ?? value.key ?? "").trim();
  if (!type || !id) return null;
  const owner = String(value.projectId ?? value.project ?? "").trim() || null;
  return { ref: { type, id }, inProject: !owner || owner === projectId, owner };
}

function terrainRefs(values, fallbackType, projectId) {
  const seen = new Set();
  const normalized = [];
  for (const raw of Array.isArray(values) ? values : []) {
    const value = terrainRef(raw, fallbackType, projectId);
    const key = refKey(value?.ref);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    normalized.push(value);
  }
  return normalized;
}

function terrainObservation(anchor) {
  const body = anchor?.body ?? {};
  const evidence = Array.isArray(body.evidence) ? body.evidence : [];
  const claim = String(body.claim ?? body.statement ?? anchor?.label ?? "").trim();
  return {
    ref: anchor.ref,
    ...body,
    id: String(body.id ?? anchor.ref.id),
    claim,
    label: String(anchor?.label || claim || "Product truth"),
    provenance: evidence.some((item) => item?.solidity === "observed") ? "observed" : "founder-stated",
    evidenceRefs: evidence
      .map((item) => ref("evidence", item?.source))
      .filter(Boolean),
    productRefs: Array.isArray(body.productRefs) ? body.productRefs : [],
    source: evidence[0]?.source ?? null,
  };
}

function terrainOverlay(projectId, read, canvas) {
  const issues = [];
  if (!read) return { hypotheses: [], relationships: [], issues, readRef: null };
  if (read.projectId && read.projectId !== projectId) {
    issues.push({ kind: "unresolved", owner: "terrain-read", ref: `terrain-read:${read.id ?? "unknown"}`, detail: `Read belongs to project ${read.projectId}.` });
    return { hypotheses: [], relationships: [], issues, readRef: null };
  }
  const readRef = ref("terrain-read", read.id);
  const known = new Set((canvas?.anchors ?? []).map((item) => refKey(item.ref)).filter(Boolean));
  if (readRef) known.add(refKey(readRef));
  const hypotheses = [];
  const relationships = [];
  const seenRelations = new Set();
  const addRelationship = (sourceValue, targetValue, kind, inProject = true) => {
    if (!sourceValue || !targetValue) return;
    const key = `${refKey(sourceValue)}|${kind}|${refKey(targetValue)}`;
    if (seenRelations.has(key)) return;
    seenRelations.add(key);
    const resolved = inProject && known.has(refKey(sourceValue)) && known.has(refKey(targetValue));
    const relation = {
      id: `relation:${key}`,
      source: sourceValue,
      target: targetValue,
      kind,
      resolved,
      authority: { owner: "terrain-read", projectId },
    };
    relationships.push(relation);
    if (!resolved) issues.push({ kind: "unresolved", owner: "terrain-read", ref: relation.id });
  };
  for (const raw of Array.isArray(read.hypotheses) ? read.hypotheses : []) {
    if (!raw?.id) continue;
    const hypothesisRef = ref("terrain-hypothesis", raw.id);
    known.add(refKey(hypothesisRef));
    const evidence = terrainRefs(raw.evidenceRefs, "evidence", projectId);
    const products = terrainRefs(raw.productRefs, "productmodel", projectId);
    const market = terrainRefs(raw.marketRefs, "market", projectId);
    const counter = terrainRefs(raw.counterEvidenceRefs, "evidence", projectId);
    const crew = terrainRefs(raw.crewRefs, "teammate", projectId);
    const hypothesis = {
      ...raw,
      ref: hypothesisRef,
      readRef,
      evidenceRefs: evidence.map((item) => item.ref),
      productRefs: products.map((item) => item.ref),
      marketRefs: market.map((item) => item.ref),
      counterEvidenceRefs: counter.map((item) => item.ref),
      crewRefs: crew.map((item) => item.ref),
    };
    hypotheses.push(hypothesis);
    if (readRef) addRelationship(readRef, hypothesisRef, "contains");
    for (const item of evidence) addRelationship(item.ref, hypothesisRef, "supports", item.inProject);
    for (const item of products) addRelationship(item.ref, hypothesisRef, "grounds", item.inProject);
    for (const item of market) addRelationship(item.ref, hypothesisRef, "supports", item.inProject);
    for (const item of counter) addRelationship(item.ref, hypothesisRef, "challenges", item.inProject);
    for (const item of crew) addRelationship(item.ref, hypothesisRef, "authored", item.inProject);
  }
  return { hypotheses, relationships, issues, readRef };
}

// Canonical deterministic terrain projection. The project id is mandatory: this path never consults
// the mutable active project. `readTerrainProjection`, when supplied by the Lane A integration, must be
// a synchronous read of an already-produced TerrainRead; GET never generates one or persists anything.
export function getTerrainView({ projectId } = {}, options = {}) {
  if (!projectId) throw new Error("A projectId is required for the terrain read.");
  const project = loadProjectReadOnly({ ...options, projectId });
  const operating = buildOperatingView(project, options);
  const canvas = operating.woven?.canvas ?? { anchors: [], relationships: [], outcomes: [], implications: [], state: { kind: "empty", stale: false, issues: [] }, geometry: null };
  const suppliedRead = typeof options.readTerrainProjection === "function"
    ? options.readTerrainProjection({ projectId })
    : options.terrainRead ?? null;
  const overlay = terrainOverlay(projectId, suppliedRead, canvas);
  const anchors = canvas.anchors ?? [];
  const anchorsOf = (types) => anchors.filter((item) => types.has(item.ref?.type));
  const truthAnchors = anchorsOf(new Set(["productTruth"]));
  const modelAnchor = anchors.find((item) => item.ref?.type === "productModel") ?? null;
  const questions = anchorsOf(new Set(["question"])).map((item) => item.ref);
  const moves = anchorsOf(new Set(["pipeline", "path"])).map((item) => item.ref);
  const outcomes = (canvas.outcomes ?? []).map((item) => item.ref).filter(Boolean);
  const implications = (canvas.implications ?? []).map((item) => item.ref).filter(Boolean);
  const crew = anchorsOf(new Set(["teammate"])).map((item) => item.ref);
  const repository = project.sharedContext?.repository ?? {};
  const grounded = Boolean(repository.repo);
  const issues = [...(canvas.state?.issues ?? []), ...overlay.issues];
  if (grounded && !modelAnchor) issues.push({ kind: "missing", owner: "product-model-store", detail: "No interpretive product model is available yet." });
  if (grounded && !suppliedRead) {
    issues.push({
      kind: options.runtimeAvailable === false ? "unavailable" : "missing",
      owner: "terrain-read",
      detail: options.runtimeAvailable === false
        ? "No runtime is connected; cited product terrain remains available."
        : "No model-owned terrain read has been supplied.",
    });
  }
  const stale = Boolean(
    canvas.state?.stale
    || suppliedRead?.stale === true
    || options.terrainReadStale === true
    || (options.terrainInputFingerprint && suppliedRead?.inputFingerprint
      && options.terrainInputFingerprint !== suppliedRead.inputFingerprint),
  );
  if (stale && !issues.some((item) => item.kind === "stale" && item.owner === "terrain-read")) {
    issues.push({ kind: "stale", owner: "terrain-read", at: suppliedRead?.generatedAt ?? null });
  }
  const contentCount = truthAnchors.length + (modelAnchor ? 1 : 0) + overlay.hypotheses.length
    + questions.length + moves.length + outcomes.length + implications.length + crew.length;
  const state = {
    kind: contentCount === 0 ? "empty" : issues.some((item) => item.kind !== "stale") ? "partial" : "ready",
    stale,
    issues,
  };
  return {
    schemaVersion: 1,
    projectId,
    generatedAt: new Date().toISOString(),
    state,
    product: {
      projectRef: ref("project", projectId),
      repository: { path: repository.repo ?? null, winEvent: repository.outcome ?? null },
      truths: truthAnchors.map(terrainObservation),
      modelRef: modelAnchor?.ref ?? null,
      model: modelAnchor?.body ?? null,
    },
    hypotheses: overlay.hypotheses,
    questions,
    moves,
    outcomes,
    implications,
    crew,
    relationships: [...(canvas.relationships ?? []), ...overlay.relationships],
    geometry: canvas.geometry,
    terrainReadRef: overlay.readRef,
  };
}
