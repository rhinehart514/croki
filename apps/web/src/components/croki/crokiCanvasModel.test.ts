import {
  CROKI_CONTEXT_LIMITS,
  createEmptyCrokiContext,
  type CrokiContext,
} from "@t3tools/shared/crokiContext";
import { describe, expect, it } from "vite-plus/test";

import {
  addCrokiEdge,
  addCrokiNode,
  addCrokiNodeReference,
  adoptCrokiNode,
  deleteCrokiNode,
  isCrokiContextDirty,
  retireCrokiNode,
  removeCrokiNodeReference,
  updateCrokiNode,
  validateCrokiContextForSave,
} from "./crokiCanvasModel";

const NOW = "2026-07-30T12:00:00.000Z";

function contextWithNodes(): CrokiContext {
  const empty = createEmptyCrokiContext("Croki");
  const first = addCrokiNode(empty, { id: "intent-1", kind: "intent", now: NOW }).context;
  return addCrokiNode(first, {
    id: "evidence-1",
    kind: "evidence",
    now: NOW,
  }).context;
}

describe("crokiCanvasModel", () => {
  it("adds, edits, adopts, and retires nodes", () => {
    const added = addCrokiNode(createEmptyCrokiContext("Croki"), {
      id: "intent-1",
      kind: "intent",
      now: NOW,
    });
    expect(added.error).toBeNull();
    const edited = updateCrokiNode(
      added.context,
      "intent-1",
      { title: "Build the clearest coding environment" },
      NOW,
    );
    const adopted = adoptCrokiNode(edited.context, "intent-1", NOW);
    const retired = retireCrokiNode(adopted.context, "intent-1", NOW);

    expect(edited.context.nodes[0]?.title).toBe("Build the clearest coding environment");
    expect(adopted.context.nodes[0]?.status).toBe("current");
    expect(retired.context.nodes[0]?.status).toBe("retired");
  });

  it("deletes attached relationships with a node", () => {
    const context = contextWithNodes();
    const linked = addCrokiEdge(context, {
      from: "evidence-1",
      to: "intent-1",
      relation: "supports",
      now: NOW,
    }).context;
    const deleted = deleteCrokiNode(linked, "intent-1", NOW);

    expect(deleted.context.nodes.map((node) => node.id)).toEqual(["evidence-1"]);
    expect(deleted.context.edges).toEqual([]);
  });

  it("refuses duplicate, self, and missing-node relationships", () => {
    const context = contextWithNodes();
    const linked = addCrokiEdge(context, {
      from: "evidence-1",
      to: "intent-1",
      relation: "supports",
      now: NOW,
    }).context;

    expect(
      addCrokiEdge(linked, {
        from: "evidence-1",
        to: "intent-1",
        relation: "supports",
        now: NOW,
      }).error,
    ).toBe("duplicate-edge");
    expect(
      addCrokiEdge(linked, {
        from: "intent-1",
        to: "intent-1",
        relation: "supports",
        now: NOW,
      }).error,
    ).toBe("self-edge");
    expect(
      addCrokiEdge(linked, {
        from: "missing",
        to: "intent-1",
        relation: "supports",
        now: NOW,
      }).error,
    ).toBe("missing-node");
  });

  it("detects dirty state deterministically without timestamp noise", () => {
    const baseline = contextWithNodes();
    const timestampOnly = { ...baseline, updatedAt: "2027-01-01T00:00:00.000Z" };
    const changed = {
      ...timestampOnly,
      nodes: timestampOnly.nodes.map((node) =>
        node.id === "intent-1" ? { ...node, body: "Changed" } : node,
      ),
    };

    expect(isCrokiContextDirty(timestampOnly, baseline)).toBe(false);
    expect(isCrokiContextDirty(changed, baseline)).toBe(true);
  });

  it("surfaces invalid title, body, and relationship limits", () => {
    const context = contextWithNodes();
    const invalid: CrokiContext = {
      ...context,
      nodes: context.nodes.map((node, index) =>
        index === 0 ? { ...node, title: "", body: "x".repeat(12_001) } : node,
      ),
      edges: [{ from: "intent-1", to: "evidence-1", relation: "x".repeat(121) }],
    };

    expect(validateCrokiContextForSave(invalid)).toEqual([
      "invalid-title",
      "invalid-body",
      "invalid-relation",
    ]);
  });

  it("refuses additions at node and relationship count limits", () => {
    const baseline = contextWithNodes();
    const nodeLimit: CrokiContext = {
      ...baseline,
      nodes: Array.from({ length: CROKI_CONTEXT_LIMITS.nodes }, (_, index) => ({
        ...baseline.nodes[0]!,
        id: `node-${index}`,
        title: `Node ${index}`,
      })),
      edges: [],
    };
    expect(
      addCrokiNode(nodeLimit, {
        id: "one-too-many",
        kind: "work",
        now: NOW,
      }).error,
    ).toBe("node-limit");

    const edgeLimit: CrokiContext = {
      ...baseline,
      edges: Array.from({ length: CROKI_CONTEXT_LIMITS.edges }, (_, index) => ({
        from: "intent-1",
        to: "evidence-1",
        relation: `supports-${index}`,
      })),
    };
    expect(
      addCrokiEdge(edgeLimit, {
        from: "evidence-1",
        to: "intent-1",
        relation: "supports",
        now: NOW,
      }).error,
    ).toBe("edge-limit");
  });

  it("adds, deduplicates, and removes portable references", () => {
    const context = contextWithNodes();
    const reference = { kind: "file", path: "./src//canvas.ts", line: 42 } as const;
    const added = addCrokiNodeReference(context, "evidence-1", reference, NOW);

    expect(added.error).toBeNull();
    expect(added.context.nodes[1]?.references).toEqual([
      { kind: "file", path: "src/canvas.ts", line: 42 },
    ]);
    expect(addCrokiNodeReference(added.context, "evidence-1", reference, NOW).error).toBe(
      "duplicate-reference",
    );

    const removed = removeCrokiNodeReference(
      added.context,
      "evidence-1",
      { kind: "file", path: "src/canvas.ts", line: 42 },
      NOW,
    );
    expect(removed.context.nodes[1]?.references).toBeUndefined();
  });

  it("keeps old nodes without references valid", () => {
    const context = contextWithNodes();
    expect(validateCrokiContextForSave(context)).toEqual([]);
    expect(context.nodes.every((node) => node.references === undefined)).toBe(true);
  });
});
