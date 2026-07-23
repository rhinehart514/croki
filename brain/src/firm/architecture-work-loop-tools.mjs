// Architecture tools available inside one teammate drive. They expose current semantic truth and the
// existing proposal-only write seam; they cannot mutate current architecture, create execution work,
// start a campaign, or decide a proposal.

import { ARCHITECTURE_OPERATIONS, getArchitecture } from "./architecture.mjs";
import { THEORY_OPERATIONS, getCurrentWorkingTheory, proposeArchitectureChange, recordWorkingTheory } from "./architecture-proposals.mjs";
import { appendConversationMessage, listConversation } from "./conversation.mjs";

// The operation items for these tools were once typed as a bare `{ type: "object" }`, which told a
// driving teammate nothing about the vocabulary — so it guessed `op` values ("assert", "note",
// "observe", …) and every guess was rejected as an "Unsupported working-theory operation" (a real
// teammate blocker seen in the field). Declare the exact `op` enum the validator enforces (kept in sync
// by importing the validator's own vocabulary) and the operation shape, so the contract is discoverable
// from the schema itself rather than by trial and error.
const THEORY_OPERATION_ITEM_SCHEMA = {
  type: "object",
  properties: {
    op: { type: "string", enum: [...THEORY_OPERATIONS] },
    id: {
      type: "string",
      description:
        "Stable id — a letter or digit followed by [A-Za-z0-9._-], ≤120 chars. Reuse the same id to update or remove a subject/relationship you already recorded.",
    },
    value: {
      type: "object",
      description:
        "The subject or relationship body. upsert-subject: { name, statement }. upsert-relationship: { fromRef: 'theory:<subjectId>', toRef: 'theory:<subjectId>', label }. Omit for remove-subject / remove-relationship.",
      properties: {
        name: { type: "string" },
        statement: { type: "string" },
        fromRef: { type: "string", description: "Source subject ref, 'theory:<subjectId>'." },
        toRef: { type: "string", description: "Target subject ref, 'theory:<subjectId>'." },
        label: { type: "string" },
      },
    },
  },
  required: ["op", "id"],
};

const ARCHITECTURE_OPERATION_ITEM_SCHEMA = {
  type: "object",
  description:
    "One semantic operation. Call read_venture_architecture first for the exact element ids, roles, and refs each op expects.",
  properties: {
    op: { type: "string", enum: [...ARCHITECTURE_OPERATIONS] },
    id: { type: "string", description: "Target element/connection/group id for update/remove/change ops." },
  },
  required: ["op"],
};

function readVentureArchitecture({ ventureId, options, trackCall }) {
  return {
    name: "read_venture_architecture",
    description: "Read the venture's current founder-confirmed intent, product loops, systems, motions, campaigns, connections, and revision before proposing a semantic change.",
    input_schema: { type: "object", properties: {}, required: [] },
    async run() {
      trackCall("read_venture_architecture");
      const architecture = getArchitecture(ventureId, options);
      return { architecture, workingTheory: getCurrentWorkingTheory(ventureId, options), revision: architecture.revision };
    },
  };
}

function recordVentureWorkingTheory({
  ventureId,
  teammateRef,
  configurationRevision,
  options,
  trackCall,
  capturedSources,
  target,
}) {
  return {
    name: "record_working_theory",
    description: "Record or supersede Croki's provisional, source-bearing current read. Each operation's `op` is one of upsert-subject, remove-subject, upsert-relationship, remove-relationship. This cannot create durable architecture, campaigns, sends, deploys, or spend.",
    input_schema: {
      type: "object",
      properties: {
        baseRevision: { type: "integer", minimum: 0 },
        intent: { type: "string" },
        supersedes: { type: ["string", "null"] },
        operations: { type: "array", minItems: 1, items: THEORY_OPERATION_ITEM_SCHEMA },
        anchors: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              subjectRef: { type: "string" },
              sourceRefs: { type: "array", items: { type: "string" }, minItems: 1 },
            },
            required: ["subjectRef", "sourceRefs"],
          },
        },
      },
      required: ["baseRevision", "intent", "operations", "anchors"],
    },
    async run({ baseRevision, intent, supersedes = null, operations, anchors } = {}) {
      trackCall("record_working_theory");
      const direction = listConversation(ventureId, options).findLast((message) => message.role === "founder" || message.role === "agent") ?? null;
      const directionRef = direction ? `conversation:${direction.id}` : null;
      const anchored = (anchors ?? []).map((anchor) => ({
        ...anchor,
        sourceRefs: [...new Set([...(anchor?.sourceRefs ?? []), directionRef].filter(Boolean))],
      }));
      const requestedSourceRefs = new Set(anchored.flatMap((anchor) => anchor.sourceRefs ?? []));
      const sources = [...capturedSources.values()].filter((source) => requestedSourceRefs.has(source.ref));
      const { theory, revision } = recordWorkingTheory({
        ventureId,
        baseRevision,
        intent,
        supersedes,
        operations,
        anchors: anchored,
        sources,
        conversationRefs: directionRef ? [directionRef] : [],
        proposedBy: { authority: "agent", id: teammateRef, configurationRevision },
        requiredSubjectId: target?.theorySubjectId ?? null,
        requiredRelationshipId: target?.theoryRelationshipId ?? null,
      }, options);
      appendConversationMessage({
        ventureId,
        role: "teammate",
        kind: "working-theory",
        content: theory.supersedes ? "I updated my current read from your correction." : "I grounded a provisional current read in the venture.",
        teammateRef,
        workingTheory: { theoryId: theory.id, supersedes: theory.supersedes, subjectIds: theory.subjects.map((subject) => subject.id) },
        target,
      }, options);
      return {
        theoryId: theory.id,
        supersedes: theory.supersedes,
        baseRevision: theory.baseRevision,
        currentRevision: revision,
        status: theory.status,
        subjectIds: theory.subjects.map((subject) => subject.id),
        relationshipIds: theory.relationships.map((relationship) => relationship.id),
        durableArchitectureChanged: false,
      };
    },
  };
}

function proposeVentureArchitecture({
  ventureId,
  teammateRef,
  configurationRevision,
  options,
  trackCall,
  consultedNames,
}) {
  return {
    name: "propose_architecture_change",
    description: "Stage finite semantic architecture operations for founder review. This changes no current truth, starts no campaign, creates no bet, and grants no outward authority.",
    input_schema: {
      type: "object",
      properties: {
        baseRevision: { type: "integer", minimum: 0 },
        intent: { type: "string" },
        operations: { type: "array", items: ARCHITECTURE_OPERATION_ITEM_SCHEMA, minItems: 1 },
        affectedExecutionContexts: { type: "array", items: { type: "string" } },
        evidenceRefs: { type: "array", items: { type: "string" } },
        unresolvedAssumptions: { type: "array", items: { type: "string" } },
        expectedExecutionEffect: { type: "string" },
      },
      required: ["baseRevision", "intent", "operations"],
    },
    async run({
      baseRevision,
      intent,
      operations,
      affectedExecutionContexts = [],
      evidenceRefs = [],
      unresolvedAssumptions = [],
      expectedExecutionEffect = null,
    } = {}) {
      if (!consultedNames.has("read_venture_architecture")) {
        const error = new Error("Read the current venture architecture before proposing a change.");
        error.code = "architecture_not_read";
        throw error;
      }
      trackCall("propose_architecture_change");
      const { proposal, revision, assemblyEvents } = proposeArchitectureChange({
        ventureId,
        baseRevision,
        intent,
        operations,
        affectedExecutionContexts,
        evidenceRefs,
        unresolvedAssumptions,
        expectedExecutionEffect,
        proposedBy: {
          authority: "agent",
          id: teammateRef,
          configurationRevision,
        },
      }, options);
      appendConversationMessage({
        ventureId,
        role: "teammate",
        kind: "proposal-assembly",
        content: `Validated ${assemblyEvents.length} architecture operation${assemblyEvents.length === 1 ? "" : "s"} for founder review.`,
        teammateRef,
        proposalAssembly: {
          proposalId: proposal.id,
          baseRevision: proposal.baseRevision,
          events: assemblyEvents,
        },
      }, options);
      return {
        proposalId: proposal.id,
        baseRevision: proposal.baseRevision,
        currentRevision: revision,
        status: proposal.status,
        intent: proposal.intent,
        operationCount: proposal.operations.length,
        assemblyEvents,
        applied: false,
      };
    },
  };
}

export function buildArchitectureWorkLoopTools(args) {
  return [readVentureArchitecture(args), recordVentureWorkingTheory(args), proposeVentureArchitecture(args)];
}
