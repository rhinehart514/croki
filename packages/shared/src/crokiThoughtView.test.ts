import type { CrokiProjectPerceptionSnapshot } from "@croki/contracts";
import { describe, expect, it } from "vite-plus/test";

import { compileCrokiThoughtView } from "./crokiThoughtView.ts";

const observedAt = "2026-08-08T12:00:00.000Z";

function snapshot(): CrokiProjectPerceptionSnapshot {
  return {
    projectId: "project-1" as CrokiProjectPerceptionSnapshot["projectId"],
    revision: 4,
    sourceRevision: 4,
    changed: true,
    objects: [
      {
        id: "direction",
        type: "decision",
        title: "Stay a native ADE",
        summary: "Keep the provider native while making project structure visible.",
        state: "provisional",
        revision: 4,
        source: { kind: "thread", id: "thread-1", turnId: null, observedAt },
        affordances: [],
      },
      {
        id: "canvas",
        type: "checked-screen",
        title: "Current Canvas",
        summary: "A read-only brief derived from live perception.",
        revision: 3,
        source: { kind: "preview", uri: "preview://canvas", turnId: null, observedAt },
        affordances: [],
      },
      {
        id: "product-mode",
        type: "conflict",
        title: "Product mode changes provider behavior",
        summary: "The separate mode feels like a harness.",
        state: "conflicted",
        revision: 2,
        source: { kind: "user", turnId: null, observedAt },
        affordances: [],
      },
    ],
    relationships: [
      {
        id: "relationship-1",
        from: "product-mode",
        to: "direction",
        kind: "motivates",
        label: "motivates removal of",
        revision: 4,
      },
    ],
    delta: {
      sinceRevision: 0,
      addedObjects: [],
      updatedObjects: [],
      removedObjectIds: [],
      addedRelationships: [],
      removedRelationshipIds: [],
    },
    latestActivityAt: observedAt,
    sourceThreadIds: [],
    activeTurnIds: [],
    truncated: false,
    stale: false,
    status: "ready",
  };
}

describe("compileCrokiThoughtView", () => {
  it("turns a comparison question into a grounded semantic View", () => {
    const view = compileCrokiThoughtView({
      frame: snapshot(),
      question: "Compare keeping Product mode versus an automatic visual thinking surface",
    });

    expect(view?.representation).toBe("comparison");
    expect(view?.statements).toHaveLength(3);
    expect(view?.sources).toHaveLength(3);
    expect(view?.statements.find((statement) => statement.objectId === "direction")).toMatchObject({
      epistemicState: "hypothetical",
      sourceIds: ["source:direction"],
    });
    expect(
      view?.statements.find((statement) => statement.objectId === "product-mode")?.epistemicState,
    ).toBe("contradicted");
  });

  it("reframes the same source revision without changing its statements", () => {
    const primary = compileCrokiThoughtView({
      frame: snapshot(),
      question: "Why does Product mode feel separate?",
    });
    const alternate = compileCrokiThoughtView({
      frame: snapshot(),
      question: "Why does Product mode feel separate?",
      alternate: true,
    });

    expect(primary?.representation).toBe("causal");
    expect(alternate?.representation).toBe("temporal");
    expect(alternate?.sourceRevision).toBe(primary?.sourceRevision);
    expect(alternate?.statements).toEqual(primary?.statements);
  });

  it("abstains when bounded perception has no useful structure", () => {
    const base = snapshot();
    const sparse = { ...base, objects: base.objects.slice(0, 1), relationships: [] };
    expect(compileCrokiThoughtView({ frame: sparse, question: "What now?" })).toBeNull();
  });

  it("does not present Croki's visible handoff metadata as the founder question", () => {
    const view = compileCrokiThoughtView({
      frame: snapshot(),
      question:
        "What product shape is strongest?\n\nCroki perception focus\n- direction · Stay native",
    });
    expect(view?.basis.question).toBe("What product shape is strongest?");
  });
});
