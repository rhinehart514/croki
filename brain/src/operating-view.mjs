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
import { getProjectChannels, loadProject } from "./project-store.mjs";
import { loadFlow } from "./flow-store.mjs";
import { listConnectors } from "./connectors/registry.mjs";
import { deriveMotionEfficiency } from "./outcome-ingest.mjs";
import { deriveFunnel } from "./object-funnel.mjs";
import { getPendingInbox } from "./pending-inbox.mjs";
import { buildWovenGraph } from "./woven-graph.mjs";

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

export function getOperatingView({ projectId } = {}, options = {}) {
  const project = loadProject(projectId ? { ...options, projectId } : options);
  const resolvedProjectId = project.id;

  const channels = getProjectChannels(project, options);
  const connectors = (() => { try { return listConnectors(); } catch { return []; } })();

  // The one efficiency table, indexed by motionKind so each lane picks up its own row.
  const efficiency = (() => {
    try { return deriveMotionEfficiency({ projectId: resolvedProjectId }, options); }
    catch { return { motions: [] }; }
  })();
  const effByKind = new Map();
  for (const row of efficiency.motions ?? []) {
    if (row.motionKind) effByKind.set(row.motionKind, row);
  }

  // The pending founder decisions across this project — the parked lanes and the inbox rows the lens
  // routes to. Scoped to this project so a lane pulses only for its own gate.
  const inbox = (() => {
    try { return getPendingInbox({ projectId: resolvedProjectId }, options); }
    catch { return { decisions: [] }; }
  })();
  const parkedByPipeline = new Map();
  for (const d of inbox.decisions ?? []) {
    // Only gate/proposal/ideas/candidates decisions park a lane; a loose world-signal isn't a lane's gate.
    if (d.pipelineId) parkedByPipeline.set(String(d.pipelineId), d);
  }

  // The shared map: every touched object once (deriveFunnel), with the lane keys that touched it.
  const funnel = (() => {
    try { return deriveFunnel(resolvedProjectId, options); }
    catch { return { kinds: [] }; }
  })();
  const laneKeys = laneKeysByObject(resolvedProjectId, options);

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
  const lanes = [];
  for (const channel of channels) {
    if (!channel.graphId) continue;
    const { graph, runs } = (() => {
      try { return loadFlow(channel.graphId, null, options); }
      catch { return { graph: null, runs: [] }; }
    })();
    if (graph) channelGraphs.set(channel.graphId, graph);
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
        lanes: (view.lanes ?? []).map((l) => ({ ...l, channelId: norm(l.channelId) })),
        objects: (view.objects ?? []).map((o) => ({ ...o, lanes: (o.lanes ?? []).map(norm) })),
      };
      const wovenChannelGraphs = new Map();
      for (const [gid, g] of channelGraphs) wovenChannelGraphs.set(norm(gid), g);
      return buildWovenGraph(wovenView, { channelGraphs: wovenChannelGraphs, storeOptions: options });
    } catch { return null; }
  })();

  return view;
}
