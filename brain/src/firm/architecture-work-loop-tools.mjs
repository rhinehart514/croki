// Architecture tools available inside one teammate drive. They expose current semantic truth and the
// existing proposal-only write seam; they cannot mutate current architecture, create execution work,
// start a campaign, or decide a proposal.

import { getArchitecture } from "./architecture.mjs";
import { getCurrentWorkingTheory, proposeArchitectureChange, recordWorkingTheory } from "./architecture-proposals.mjs";
import { appendConversationMessage, listConversation } from "./conversation.mjs";

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
    description: "Record or supersede Drover's provisional, source-bearing current read. This cannot create durable architecture, campaigns, sends, deploys, or spend.",
    input_schema: {
      type: "object",
      properties: {
        baseRevision: { type: "integer", minimum: 0 },
        intent: { type: "string" },
        supersedes: { type: ["string", "null"] },
        operations: { type: "array", minItems: 1, items: { type: "object" } },
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
        operations: { type: "array", items: { type: "object" }, minItems: 1 },
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
