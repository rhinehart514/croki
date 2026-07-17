// Venture-scoped evidence wiring for traceability derivation. Pure reads over venture truth: given a
// ventureId, it builds the resolveEvidenceRef and enumerateEvidenceRefs functions that
// deriveVentureTraceability (venture-traceability.mjs) needs, so cross-boundary gaps fail toward
// VISIBILITY (FIRM-SPEC section 7) against REAL venture evidence rather than an absent resolver.
//
// Evidence kinds carried here (a subset of EVIDENCE_REF_KINDS in evidence-ref.mjs) are the ones a
// venture actually persists as durable evidence: outcome, work (staged bet artifacts), wall-item
// (decisions), conversation, and architecture-revision. A ref of a kind we cannot load resolves to
// "unresolved" — which keeps its claim a visible gap rather than optimistically clearing it.

import { listVentureDocs } from "./venture-store.mjs";
import { resolveEvidenceRef as resolveRef } from "./evidence-ref.mjs";

function list(value) {
  return Array.isArray(value) ? value : [];
}

// Index the venture's durable evidence records by kind:id once, so both the loader and the enumerator
// read from the same snapshot. No mutation, no persistence.
function indexVentureEvidence(ventureId, options) {
  const outcomes = new Map();
  const work = new Map();
  const wallItems = new Map();
  const conversation = new Map();
  const architectureRevisions = new Map();

  for (const outcome of listVentureDocs(ventureId, "outcomes", options)) {
    if (outcome?.id) outcomes.set(outcome.id, outcome);
  }
  for (const bet of listVentureDocs(ventureId, "bets", options)) {
    for (const artifact of [...list(bet.staged), ...list(bet.evidence)]) {
      if (artifact?.id) work.set(artifact.id, { ...artifact, betId: bet.id });
    }
  }
  for (const decision of listVentureDocs(ventureId, "decisions", options)) {
    if (decision?.id) wallItems.set(decision.id, decision);
  }
  for (const message of listVentureDocs(ventureId, "conversation", options)) {
    if (message?.id) conversation.set(message.id, message);
  }
  // Architecture revisions live inside the architecture compatibility state; a ref to one resolves
  // when the revision number exists. Kept lazy: only the revision list is needed to load by id.
  return { outcomes, work, wallItems, conversation, architectureRevisions };
}

const KIND_LOADERS = {
  outcome: (index, id) => index.outcomes.get(id) ?? null,
  work: (index, id) => index.work.get(id) ?? null,
  "wall-item": (index, id) => index.wallItems.get(id) ?? null,
  conversation: (index, id) => index.conversation.get(id) ?? null,
  "architecture-revision": (index, id) => index.architectureRevisions.get(id) ?? null,
};

// Evidence kinds we enumerate as the venture's known external evidence, for the disconnected-evidence
// gap. Repository citations and conversations are excluded from enumeration: a repository ref is a
// point-in-time digest, not a durable venture record, and conversation volume would drown the signal;
// both still RESOLVE when referenced, they just are not treated as "must be referenced" evidence.
function enumerateFrom(index) {
  const refs = [];
  for (const id of index.outcomes.keys()) refs.push(`outcome:${id}`);
  for (const id of index.work.keys()) refs.push(`work:${id}`);
  for (const id of index.wallItems.keys()) refs.push(`wall-item:${id}`);
  return refs;
}

// Build the venture-scoped { resolveEvidenceRef, enumerateEvidenceRefs } pair over one evidence
// snapshot. The resolver covers every evidence kind the venture persists; a ref of an unknown kind
// (or a missing record) returns { state: "unresolved" }, so its claim stays a visible gap.
export function ventureEvidenceResolvers(ventureId, options = {}) {
  const index = indexVentureEvidence(ventureId, options);
  const load = (kind, id) => (KIND_LOADERS[kind] ? KIND_LOADERS[kind](index, id) : null);
  return {
    resolveEvidenceRef(ref) {
      try {
        return resolveRef(ref, { ventureId, load });
      } catch {
        // A malformed or cross-scope ref cannot be confirmed live: fail toward visibility.
        return { state: "unresolved", ref, record: null, reason: "unresolvable" };
      }
    },
    enumerateEvidenceRefs() {
      return enumerateFrom(index);
    },
  };
}
