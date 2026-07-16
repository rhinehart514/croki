import { describe, expect, it } from "vitest";
import type {
  FirmArchitectureDocument,
  FirmArchitectureOperation,
  FirmArchitectureProposal,
} from "@/types";
import {
  projectArchitectureProposal,
  projectArchitectureProposalGhostScene,
} from "./architectureProposalProjection";

const baseArchitecture: FirmArchitectureDocument = {
  schemaVersion: 1,
  ventureId: "venture-1",
  revision: 4,
  intent: { statement: "Turn credible work into qualified demand", constraints: [] },
  elements: [{ id: "system-proof", role: "system", name: "Proof record", does: "Carries product truth." }],
  connections: [],
  groups: [],
  evidenceAnnotations: [],
};

function proposal(
  operations: FirmArchitectureOperation[],
  overrides: Partial<FirmArchitectureProposal> = {},
): FirmArchitectureProposal {
  return {
    id: "proposal-1",
    ventureId: "venture-1",
    baseRevision: 4,
    intent: "Add a grounded outbound motion",
    operations,
    affectedExecutionContexts: ["whole venture"],
    evidenceRefs: ["repository:src/product.ts#L4"],
    unresolvedAssumptions: ["The founder has not confirmed the first audience."],
    expectedExecutionEffect: "Semantic proposal only; no campaign or outward act starts.",
    proposedBy: { authority: "agent", id: "operator" },
    configurationRevision: 3,
    status: "pending",
    createdAt: "2026-07-15T12:00:00.000Z",
    decidedAt: null,
    decision: null,
    ...overrides,
  };
}

describe("architecture proposal projection", () => {
  it("projects only real semantic operations and exact derivable counts", () => {
    const source = proposal([
      { op: "update-intent", value: { statement: "Turn proof into relevant conversations" } },
      {
        op: "create-element",
        element: {
          id: "system-research",
          role: "system",
          name: "Account research",
          does: "Grounds a possible buyer in product and market truth.",
        },
      },
      {
        op: "create-element",
        element: {
          id: "motion-outbound",
          role: "motion",
          name: "Founder-led outbound",
          actor: "Founder",
          entry: "Qualified account",
          value: "Relevant conversation",
          repeatabilityClaim: "Grounded research repeatedly opens relevant conversations.",
          systemIds: ["system-research"],
          productRefs: [],
        },
      },
      {
        op: "create-connection",
        connection: {
          id: "connection-proof-outbound",
          fromRef: "architecture:system-proof",
          toRef: "architecture:motion-outbound",
          label: "grounds",
          assertion: "tentative",
        },
      },
    ]);

    const view = projectArchitectureProposal(source, 4, { baseArchitecture });

    expect(view.canDecide).toBe(true);
    expect(view.scene.proposedIntent?.statement).toBe("Turn proof into relevant conversations");
    expect(view.scene.elements.map((entry) => [entry.role, entry.name])).toEqual([
      ["system", "Account research"],
      ["motion", "Founder-led outbound"],
    ]);
    expect(view.scene.connections[0]?.connection.label).toBe("grounds");
    expect(view.scene.receiptCounts).toMatchObject({
      operations: 4,
      createdElements: 2,
      createdRoles: { system: 1, motion: 1 },
      createdConnections: 1,
    });
    expect(view.assumptions).toEqual(["The founder has not confirmed the first audience."]);
    expect(view.scene.gaps).toContain(
      "Architecture proposal operations do not define a sequence of steps, approval counts, or teammate assignments.",
    );
    expect(JSON.stringify(view.scene)).not.toMatch(/stageCount|gateCount|teammateAssignments|reasoningProgress/);
  });

  it("projects only persisted assembly receipts tied to their real operation", () => {
    const operations: FirmArchitectureOperation[] = [
      { op: "create-element", element: { id: "system-research", role: "system", name: "Research", does: "Grounds an opening." } },
      { op: "create-element", element: { id: "concept-door", role: "concept", name: "Possible door" } },
    ];
    const source = proposal(operations, {
      assemblyEvents: [
        { operationIndex: 0, op: "create-element", role: "system", elementId: "system-research", label: "create-element: Research", validated: true, at: "2026-07-15T12:00:01.000Z" },
        { operationIndex: 1, op: "wrong-op", elementId: "concept-door", label: "wrong receipt", validated: true, at: "2026-07-15T12:00:01.001Z" },
      ],
    });

    const view = projectArchitectureProposal(source, 4);

    expect(view.assemblyEvents.map((event) => event.label)).toEqual(["create-element: Research"]);
  });

  it("marks ghost campaigns for compensated whole-system acceptance", () => {
    const source = proposal([{
      op: "create-element",
      element: {
        id: "campaign-first",
        role: "campaign",
        name: "First outbound proof",
        audience: "Design-led founders",
        objective: "Open grounded conversations",
        primaryMotionId: "motion-outbound",
        motionIds: ["motion-outbound"],
        governingBetSeed: "A grounded opening earns a useful reply",
        supportingBetIds: [],
        measurement: { observation: "Relevant reply", window: "Within fourteen days" },
      },
    }]);

    expect(projectArchitectureProposal(source, 4).requiresSystemAcceptance).toBe(true);
  });

  it("counts a campaign only when a valid campaign operation actually creates one", () => {
    const source = proposal([{
      op: "create-element",
      element: {
        id: "campaign-first",
        role: "campaign",
        name: "First outbound proof",
        audience: "Design-led founders",
        objective: "Open grounded conversations",
        primaryMotionId: "motion-outbound",
        motionIds: ["motion-outbound"],
        governingBetId: "bet-outbound",
        supportingBetIds: [],
        measurement: { observation: "Relevant replies", window: "First twenty sends" },
      },
    }]);

    const scene = projectArchitectureProposalGhostScene(source);

    expect(scene.receiptCounts.createdRoles).toEqual({ campaign: 1 });
    expect(scene.receiptCounts).not.toHaveProperty("workflowStages");
    expect(scene.receiptCounts).not.toHaveProperty("gates");
    expect(scene.elements[0]?.element).not.toHaveProperty("stages");
  });

  it("does not fabricate an updated ghost when the base revision value is unavailable", () => {
    const source = proposal([{
      op: "update-element",
      elementId: "system-proof",
      value: { does: "Carries cited product and market truth." },
    }]);

    const withoutBase = projectArchitectureProposalGhostScene(source);
    expect(withoutBase.elements).toEqual([]);
    expect(withoutBase.gaps[0]).toMatch(/base-revision value is unavailable/i);

    const withBase = projectArchitectureProposalGhostScene(source, baseArchitecture);
    expect(withBase.elements[0]).toMatchObject({
      id: "system-proof",
      role: "system",
      change: "update",
      element: { does: "Carries cited product and market truth." },
    });
  });

  it("preserves stale, read-only, and settled decision states independently", () => {
    const pending = proposal([{
      op: "create-element",
      element: { id: "concept-door", role: "concept", name: "Possible door" },
    }]);

    expect(projectArchitectureProposal(pending, 5).decisionBlock).toBe("stale");
    expect(projectArchitectureProposal(pending, 4, { readOnly: true }).decisionBlock).toBe("read-only");
    expect(projectArchitectureProposal({
      ...pending,
      status: "accepted",
      decision: "accept",
      decidedAt: "2026-07-15T12:05:00.000Z",
      appliedRevision: 5,
    }, 5).decisionBlock).toBe("settled");
  });
});
