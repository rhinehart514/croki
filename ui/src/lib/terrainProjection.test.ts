import { describe, expect, it } from "vitest";
import type { TerrainHypothesis, TerrainView, WovenCanvas } from "@/types";
import { projectTerrainCanvas, stableRefString, terrainFocusItem } from "./terrainProjection";

const hypothesis = (id: string, provenance: "inferred" | "speculative" = "inferred"): TerrainHypothesis => ({
  id,
  stance: "opening",
  title: `Opening ${id}`,
  claim: `Claim ${id}`,
  whyItMatters: "It could shorten the path to a real win.",
  provenance,
  evidenceRefs: [{ type: "product-truth", id: "truth-1" }],
  productRefs: [{ type: "product-model", id: "onboarding" }],
  marketRefs: [],
  counterEvidenceRefs: [{ type: "market-evidence", id: "counter-1" }],
  unknown: "Whether founders recognize the value before setup.",
  falsifier: "Three grounded trials fail before setup.",
  suggestedMove: { title: "Test the reveal", intendedEffect: "Reach first value sooner", measurementIntent: null },
  crewRefs: [{ type: "teammate", id: "scout" }],
});

const terrain = (hypotheses = [hypothesis("h1")]): TerrainView => ({
  schemaVersion: 1,
  projectId: "p1",
  generatedAt: "2026-07-10T12:00:00.000Z",
  state: { kind: "ready", stale: false, issues: [] },
  product: {
    projectRef: { type: "project", id: "p1" },
    repository: { path: "/repo", winEvent: "project_created" },
    truths: [{
      id: "truth-1", claim: "The product records project creation.", provenance: "observed",
      evidenceRefs: [{ type: "citation", id: "src/create.ts:42" }],
    }],
    modelRef: { type: "product-model", id: "model-1" },
  },
  hypotheses,
  questions: [], moves: [], outcomes: [], implications: [], crew: [], relationships: [], geometry: null,
});

describe("terrain projection", () => {
  it("adds observed truth and clearly typed hypothesis anchors without replacing existing questions", () => {
    const existing: WovenCanvas = {
      anchors: [{
        id: "anchor:question:q1", ref: { type: "question", id: "q1" }, kind: "question", label: "Who needs this?",
        body: { id: "q1", text: "Who needs this?" }, authority: { owner: "clarity", id: "q1", projectId: "p1", updatedAt: null },
      }],
      relationships: [], state: { kind: "ready", stale: false, issues: [] }, geometry: null,
    };
    const projected = projectTerrainCanvas(terrain(), null, existing)!;
    expect(projected.anchors.map((a) => a.kind)).toEqual(["question", "product-truth", "terrain-opening"]);
    expect(projected.anchors.find((a) => a.kind === "product-truth")?.body).toMatchObject({ provenance: "observed" });
    expect(projected.anchors.find((a) => a.kind === "terrain-opening")?.body).toMatchObject({ provenance: "inferred" });
  });

  it("bounds the first altitude to five hypotheses and preserves speculative provenance", () => {
    const view = terrain(Array.from({ length: 7 }, (_, i) => hypothesis(`h${i}`, i === 0 ? "speculative" : "inferred")));
    const projected = projectTerrainCanvas(view, null, null)!;
    const anchors = projected.anchors.filter((a) => a.kind.startsWith("terrain-"));
    expect(anchors).toHaveLength(5);
    expect(anchors[0].body).toMatchObject({ provenance: "speculative" });
  });

  it("resolves focus detail and stable context refs without creating a durable client object", () => {
    const view = terrain();
    expect(terrainFocusItem({ type: "product-truth", id: "truth-1" }, view, null)?.kind).toBe("truth");
    expect(terrainFocusItem({ type: "terrain-hypothesis", id: "h1" }, view, null)?.kind).toBe("hypothesis");
    expect(stableRefString({ type: "terrain-hypothesis", id: "h1" })).toBe("terrain-hypothesis:h1");
  });

  it("keeps deterministic truth available when there are no hypotheses", () => {
    const projected = projectTerrainCanvas(terrain([]), null, null)!;
    expect(projected.anchors.map((a) => a.kind)).toEqual(["product-truth"]);
    expect(projected.state.kind).toBe("ready");
  });

  it("promotes three evidenced product journeys into the opening altitude", () => {
    const view = terrain([]);
    view.product.model = {
      id: "model-1", version: 1, projectId: "p1", generatedBy: "claude",
      groundingRef: { evidenceState: null, citationCount: 3, scannedAt: view.generatedAt },
      things: [], relationships: [], userGoals: [], states: [], ia: [], interactions: [], transitions: [], pinnedSignals: [],
      workflows: Array.from({ length: 4 }, (_, index) => ({
        id: `flow-${index}`, name: `Journey ${index}`, actor: index === 0 ? "Owner" : "Operator",
        summary: `The product supports journey ${index}.`,
        steps: [{ id: `step-${index}`, label: "Start", summary: "The first step." }],
        evidence: [{ label: "route", file: "src/routes.ts", line: index + 1, text: "route" }],
        provenance: "derived" as const,
      })),
      createdAt: view.generatedAt, updatedAt: view.generatedAt,
    };
    const projected = projectTerrainCanvas(view, null, null)!;
    const openings = projected.anchors.filter((anchor) => anchor.kind === "terrain-opening");
    expect(openings).toHaveLength(3);
    expect(openings.map((anchor) => anchor.label)).toEqual(["Owner: Journey 0", "Operator: Journey 1", "Operator: Journey 2"]);
    expect(openings[0].body).toMatchObject({ provenance: "derived", claim: "The product supports journey 0." });
  });

  it("keeps the live operating-canvas viewport ahead of a stale terrain snapshot", () => {
    const existing: WovenCanvas = {
      anchors: [], relationships: [], state: { kind: "ready", stale: false, issues: [] },
      geometry: { namespace: "project-canvas", revision: 4, positions: {}, viewport: { x: 80, y: -40, zoom: 0.7 } },
    };
    const staleTerrain = {
      ...terrain(),
      geometry: { namespace: "project-canvas", revision: 2, positions: {}, viewport: { x: 900, y: 600, zoom: 0.4 } },
    } satisfies TerrainView;
    expect(projectTerrainCanvas(staleTerrain, null, existing)?.geometry).toEqual(existing.geometry);
  });
});
