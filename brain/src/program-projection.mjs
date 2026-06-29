// The proof that the domain event log is authoritative, not decorative: a pure left-fold of the
// events back into current state. If `rebuildProjectState` does not equal the stored snapshots, one
// of two things is true — an event is lossy, or a command mutated state without recording it. The
// reconciliation test asserts they match, so this function is the executable guarantee behind DDD.md's
// claim that the system can "explain what changed without relying on a saved snapshot."
//
// State is keyed by aggregate id. This now projects the ProductModel aggregate (the Living Product
// Picture) — the only event-sourced domain aggregate the host still owns after the outcome-program
// machinery was removed.

import { listDomainEvents } from "./domain-events.mjs";

function emptyState() {
  return {
    // The ProductModel aggregate: one current record per lineage keyed by id (a revision keeps the
    // same id, so it overwrites the single current record while the event log retains every version).
    productModels: new Map(),
  };
}

// One event → a state transition. Pure: same events in, same state out, no I/O.
export function applyDomainEvent(state, event) {
  const data = event?.data ?? {};
  switch (event?.type) {
    case "ProductModelDerived":
    case "ProductModelRevised":
      // The full aggregate rides in data (DDD.md:125). A revision keeps the same id, so it
      // overwrites the single current record; the event log still holds the prior version.
      state.productModels.set(data.id, { ...data });
      break;
    case "ProductSignalRecorded": {
      // A real-world signal pinned onto a specific element. Fold the pin onto its parent model's
      // pinnedSignals. The signal body stays in feedback-ledger.mjs; only the pin lives here.
      const model = state.productModels.get(event.aggregateId);
      if (model) {
        model.pinnedSignals = [...(model.pinnedSignals ?? []), { ...data }];
      }
      break;
    }
    default:
      // Narration-only events are history, not state transitions for these aggregates — no-op.
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
    productModels: [...state.productModels.values()],
  };
}
