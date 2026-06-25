// The proof that the domain event log is authoritative, not decorative: a pure left-fold of the
// events back into current state. If `rebuildProjectState` does not equal the stored snapshots
// (programs, policies, foundry instances/profiles), one of two things is true — an event is lossy,
// or a command mutated state without recording it. The reconciliation test asserts they match, so
// this function is the executable guarantee behind DDD.md's claim that the system can "explain what
// changed without relying on a saved snapshot."
//
// State is keyed by aggregate id. Versioned aggregates (policies, agent instances) are appended as
// new entries, never overwritten, mirroring the append-only lineage the stores hold on disk.

import { listDomainEvents } from "./domain-events.mjs";

// The legacy single-`status` → split mapping, kept local to the projection so a legacy
// ProgramStatusChanged event (which carried data.status) still folds correctly: lifecycle values set
// lifecycle, run values set lastRunStatus. New events carry data.lastRunStatus directly. Mirrors
// program-store.mjs's LEGACY_STATUS_MAP.
const LEGACY_STATUS_MAP = new Map([
  ["draft", { lifecycle: "draft" }],
  ["ready", { lifecycle: "active" }],
  ["active", { lifecycle: "active" }],
  ["retired", { lifecycle: "retired" }],
  ["running", { lastRunStatus: "running" }],
  ["waiting_for_gate", { lastRunStatus: "waiting_for_gate" }],
  ["learning", { lastRunStatus: "learning" }],
  ["complete", { lastRunStatus: "complete" }],
  ["blocked", { lastRunStatus: "blocked" }],
  ["paused", {}],
]);

// Split a created-program payload into the schemaVersion-2 shape. A current record already has
// lifecycle/lastRunStatus and passes through; a legacy record carrying a single `status` is mapped
// and the lineage triplet is backfilled. Kept local to avoid a cycle with program-store.mjs (which
// imports rebuildProjectState from here).
function foldCreatedProgram(data = {}) {
  const { status, ...rest } = data;
  const program = { ...rest };
  if (program.lifecycle === undefined || program.lastRunStatus === undefined) {
    const mapped = LEGACY_STATUS_MAP.get(String(status ?? "draft")) ?? {};
    if (program.lifecycle === undefined) program.lifecycle = mapped.lifecycle ?? "draft";
    if (program.lastRunStatus === undefined) program.lastRunStatus = mapped.lastRunStatus ?? null;
  }
  if (program.lineageId === undefined || program.lineageId === null) program.lineageId = program.id;
  if (program.previousProgramId === undefined) program.previousProgramId = null;
  if (program.version === undefined || program.version === null) program.version = 1;
  return program;
}

function emptyState() {
  return {
    programs: new Map(),
    policies: new Map(),
    profiles: new Map(),
    instances: new Map(),
    evaluations: [],
  };
}

// One event → a state transition. Pure: same events in, same state out, no I/O.
export function applyDomainEvent(state, event) {
  const data = event?.data ?? {};
  switch (event?.type) {
    case "OutcomeProgramCreated":
      // The created record carries lifecycle/lastRunStatus/lineage. A legacy create event (logged
      // before the status split) carried a single `status` instead — split it on the way in so a
      // rebuild from an old log produces the current shape.
      state.programs.set(data.id, foldCreatedProgram(data));
      break;
    case "MeasurementPlanDefined": {
      // The event carries the plan; fold it onto the program the same way the store does.
      const program = state.programs.get(event.aggregateId);
      if (program) program.measurementPlan = { ...data };
      break;
    }
    case "WorkflowComposed": {
      const program = state.programs.get(event.aggregateId);
      if (program) {
        // Composing a workflow makes the program runnable: the founder-controlled lifecycle becomes
        // "active". This replaces the old status:"ready" set.
        program.lifecycle = "active";
        program.channelId = data.channelId ?? program.channelId ?? null;
        program.graphId = data.graphId ?? program.graphId ?? null;
        program.workflowGraph = data.workflowGraph ?? program.workflowGraph ?? null;
      }
      break;
    }
    case "WorkflowGraphUpdated": {
      const program = state.programs.get(event.aggregateId);
      if (program) {
        program.graphId = data.graphId ?? data.workflowGraph?.id ?? program.graphId ?? null;
        program.workflowGraph = data.workflowGraph ?? program.workflowGraph ?? null;
      }
      break;
    }
    case "ProgramChannelMetadataUpdated": {
      const program = state.programs.get(event.aggregateId);
      if (program) {
        program.name = data.name ?? program.name;
        program.channelId = data.channelId ?? program.channelId ?? null;
        program.channelHypothesis = {
          ...(program.channelHypothesis ?? {}),
          ...(data.channelHypothesis ?? {}),
          label: data.name ?? program.channelHypothesis?.label ?? program.name,
          kind: data.kind ?? program.channelHypothesis?.kind ?? "custom",
          enabled: data.enabled ?? program.channelHypothesis?.enabled ?? true,
        };
        if (data.objective !== undefined) {
          program.desiredOutcome = {
            ...(program.desiredOutcome ?? {}),
            description: data.objective,
          };
        }
        if (data.workflowGraph) {
          program.graphId = data.workflowGraph.id ?? program.graphId ?? null;
          program.workflowGraph = data.workflowGraph;
        }
      }
      break;
    }
    case "ProgramStatusChanged": {
      const program = state.programs.get(event.aggregateId);
      if (program) {
        // New events carry the disposable run outcome directly.
        if (data.lastRunStatus !== undefined) {
          program.lastRunStatus = data.lastRunStatus;
        } else if (data.status !== undefined) {
          // Back-compat: a legacy event carried a single status. Interpret it through the migration
          // map — lifecycle values move lifecycle, run values move lastRunStatus.
          const mapped = LEGACY_STATUS_MAP.get(String(data.status)) ?? {};
          if (mapped.lifecycle !== undefined) program.lifecycle = mapped.lifecycle;
          if (mapped.lastRunStatus !== undefined) program.lastRunStatus = mapped.lastRunStatus;
        }
      }
      break;
    }
    case "AgentCreationPolicyCreated":
    case "AgentCreationPolicyUpdated":
      // Append-only: a revision is a new version keyed by its own id, never an overwrite.
      state.policies.set(data.id, { ...data });
      break;
    case "PersonalizationProfileAssembled":
      state.profiles.set(data.id, { ...data });
      break;
    case "PersonalizedAgentCreated":
    case "NextAgentVersionCreated":
      state.instances.set(data.id, { ...data });
      break;
    case "AgentEvaluated":
      state.evaluations.push({ ...data });
      break;
    default:
      // Narration-only events (run started, gate opened, founder decisions, observed outcomes)
      // are history, not state transitions for these aggregates — intentionally no-op.
      break;
  }
  return state;
}

// Fold an ordered event list into current state.
export function projectState(events = []) {
  return events.reduce(applyDomainEvent, emptyState());
}

// Rebuild a project's current state purely from its persisted domain events, returned as plain
// arrays so it can be compared field-for-field against the stores.
export function rebuildProjectState(projectId = "default", options = {}) {
  const events = listDomainEvents(projectId, options);
  const state = projectState(events);
  return {
    programs: [...state.programs.values()],
    policies: [...state.policies.values()],
    profiles: [...state.profiles.values()],
    instances: [...state.instances.values()],
    evaluations: state.evaluations,
  };
}
