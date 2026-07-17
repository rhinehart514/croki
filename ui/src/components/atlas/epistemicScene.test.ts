import { describe, expect, it } from "vitest";
import { indexContext, epistemicStateForNode, edgeTreatmentForSceneEdge } from "./epistemicScene";
import { atlasInertData } from "./atlasSemanticProjection";
import type { AtlasNode } from "./atlasTypes";
import type { FirmArchitectureProjection } from "@/types";

// The scene fold threads REAL projection fields (evidenceAnnotations, pressure, outcome joins, traceability
// gaps, connection assertion) onto node/edge treatments — so the mounted token/edge are non-vacuous.

function node(id: string, data: Partial<AtlasNode["data"]> & { kind: AtlasNode["data"]["kind"] }): AtlasNode {
  return { id, position: { x: 0, y: 0 }, data: { ...atlasInertData(data.kind, "n"), ...data } };
}

function projection(overrides: Partial<FirmArchitectureProjection>): FirmArchitectureProjection {
  return {
    ventureId: "v", revision: 1,
    document: { schemaVersion: 1, ventureId: "v", revision: 1, intent: { statement: "" }, elements: [], connections: [], groups: [], evidenceAnnotations: [] },
    elements: [], connections: [], groups: [], evidenceAnnotations: [], pressure: [],
    joins: { bets: [], work: [], wall: [], outcomes: [] },
    ...overrides,
  } as FirmArchitectureProjection;
}

describe("epistemicScene — node epistemic state from projection truth", () => {
  it("a repository-grounded element node reads repository-backed", () => {
    const proj = projection({ elements: [{ id: "e1", role: "system", name: "S", provenance: { kind: "repository-grounded" } }] });
    const n = node("architecture:e1", { kind: "system", element: proj.elements[0] });
    expect(epistemicStateForNode(n, proj, indexContext(proj))).toBe("repository-backed");
  });

  it("a challenged element reads contested via projection pressure", () => {
    const proj = projection({
      elements: [{ id: "e2", role: "motion", name: "M", provenance: { kind: "founder-authored" } }],
      pressure: [{ subjectId: "e2", reason: "challenged-claim", detail: null }],
    });
    const n = node("architecture:e2", { kind: "motion", element: proj.elements[0] });
    expect(epistemicStateForNode(n, proj, indexContext(proj))).toBe("contested");
  });

  it("a gtm claim in the brain's unsupported-claim gaps reads unsupported even when founder-authored", () => {
    const proj = projection({
      elements: [{ id: "c1", role: "concept", name: "C", provenance: { kind: "founder-authored" } }],
      traceability: {
        traceLinks: [], relationshipLinks: [], insightLinks: [],
        gaps: [{ kind: "unsupported-claim", objectRef: "object:c1", type: "claim", territory: "gtm", reason: "" }],
        gapsByKind: { unsupportedClaims: [], unexpressedCapabilities: [], disconnectedEvidence: [] },
      },
    });
    const n = node("architecture:c1", { kind: "concept", element: proj.elements[0] });
    expect(epistemicStateForNode(n, proj, indexContext(proj))).toBe("unsupported");
  });

  it("an outcome node reads measured from its exact join, drovers-read from an unattributed one", () => {
    const measured = node("outcome:o1", { kind: "outcome", join: { outcomeId: "o1", basis: "exact", causal: false } });
    const unattributed = node("outcome:o2", { kind: "outcome", join: { outcomeId: "o2", basis: "unattributed", causal: false } });
    const proj = projection({});
    expect(epistemicStateForNode(measured, proj, indexContext(proj))).toBe("measured");
    expect(epistemicStateForNode(unattributed, proj, indexContext(proj))).toBe("drovers-read");
  });

  it("nodes with no epistemic claim (intent/wall/group/teammate/capability) return null → hollow slot", () => {
    const proj = projection({});
    for (const kind of ["intent", "wall", "group", "teammate", "capability"] as const) {
      expect(epistemicStateForNode(node(`x:${kind}`, { kind }), proj, indexContext(proj))).toBeNull();
    }
  });

  it("a working-theory node is explicitly Drover's read", () => {
    const proj = projection({});
    expect(epistemicStateForNode(node("theory:t1", { kind: "theory" }), proj, indexContext(proj))).toBe("drovers-read");
  });
});

describe("epistemicScene — edge treatment from projection truth", () => {
  it("a founder-asserted connection is founder-applied; a tentative one is inferred", () => {
    const proj = projection({
      connections: [
        { id: "k1", fromRef: "architecture:a", toRef: "architecture:b", label: "", assertion: "founder-asserted" },
        { id: "k2", fromRef: "architecture:a", toRef: "architecture:c", label: "", assertion: "tentative" },
      ],
    });
    expect(edgeTreatmentForSceneEdge({ id: "connection:k1" }, proj)).toBe("founder-applied");
    expect(edgeTreatmentForSceneEdge({ id: "connection:k2" }, proj)).toBe("inferred");
  });

  it("an unsupported-link gap forces the no-line unsupported treatment", () => {
    const proj = projection({
      connections: [{ id: "k3", fromRef: "architecture:a", toRef: "architecture:b", label: "", assertion: "tentative" }],
      traceability: {
        traceLinks: [], relationshipLinks: [], insightLinks: [],
        gaps: [{ kind: "unsupported-link", relationshipId: "k3", fromRef: "object:a", toRef: "object:b", pair: null, reason: "" }],
        gapsByKind: { unsupportedClaims: [], unexpressedCapabilities: [], disconnectedEvidence: [] },
      },
    });
    expect(edgeTreatmentForSceneEdge({ id: "connection:k3" }, proj)).toBe("unsupported");
  });

  it("a returned edge takes its outcome join's basis", () => {
    const proj = projection({
      joins: { bets: [], work: [], wall: [], outcomes: [{ outcomeId: "o9", basis: "contextual", causal: false } as never] },
    });
    expect(edgeTreatmentForSceneEdge({ id: "returned:w:o9" }, proj)).toBe("contextual");
  });

  it("staged and held edges are founder-applied; hub spokes carry no treatment", () => {
    const proj = projection({});
    expect(edgeTreatmentForSceneEdge({ id: "staged:bet:w1" }, proj)).toBe("founder-applied");
    expect(edgeTreatmentForSceneEdge({ id: "held:w1" }, proj)).toBe("founder-applied");
    expect(edgeTreatmentForSceneEdge({ id: "hub-spoke:bet1" }, proj)).toBeNull();
  });
});
