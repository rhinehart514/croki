import { TurnId } from "@croki/contracts";
import type { CrokiContextNode, CrokiContextReference } from "@croki/shared/crokiContext";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  buildCrokiPlanStepItems,
  buildCrokiReferenceItems,
  buildCrokiSemanticItems,
  crokiCanvasItemSize,
  crokiCanvasReferenceItemId,
  ensureCrokiCanvasItemIdsUnique,
  type CrokiCanvasItem,
} from "./crokiCanvasItems";
import {
  buildCrokiCanvasObjects,
  loadCrokiCanvasPositions,
  persistCrokiCanvasPositions,
} from "./crokiCanvasWorkflowLayout";

const fileReference: CrokiContextReference = {
  kind: "file",
  path: "apps/web/src/components/croki/CrokiCanvasField.tsx",
  line: 84,
};
const urlReference: CrokiContextReference = {
  kind: "url",
  url: "https://example.com/research/canvas",
};
const intent: CrokiContextNode = {
  id: "intent",
  kind: "intent",
  status: "current",
  title: "Keep work inspectable",
  body: "",
  updatedAt: "2026-07-31T00:00:00.000Z",
  references: [fileReference, urlReference],
};

describe("Croki Canvas item identity", () => {
  it("keeps semantic nodes and reference artifacts lossless", () => {
    const semantic = buildCrokiSemanticItems([intent]);
    const references = buildCrokiReferenceItems([intent]);

    expect(semantic[0]).toEqual(
      expect.objectContaining({ kind: "semantic", id: "intent", node: intent, role: "intent" }),
    );
    expect(semantic[0]?.node).toBe(intent);
    expect(references).toHaveLength(2);
    expect(references[0]).toEqual(
      expect.objectContaining({
        kind: "reference",
        ownerNodeId: "intent",
        reference: fileReference,
        role: "file-reference",
      }),
    );
    expect(references[0]?.reference).toBe(fileReference);
    expect(references[1]?.reference).toBe(urlReference);
    expect(references[0]?.id).not.toBe(references[1]?.id);
  });

  it("preserves native plan status and stable turn identity without node coercion", () => {
    const plan = {
      createdAt: "2026-07-31T00:00:00.000Z",
      turnId: TurnId.make("turn-canvas"),
      steps: [
        { step: "Inspect the implementation", status: "inProgress" as const },
        { step: "Verify the experience", status: "pending" as const },
        { step: "Ship the workflow", status: "completed" as const },
      ],
    };
    const items = buildCrokiPlanStepItems(plan);
    const reordered = buildCrokiPlanStepItems({ ...plan, steps: [...plan.steps].reverse() });

    expect(items.map((item) => item.step.status)).toEqual(["inProgress", "pending", "completed"]);
    expect(items[0]).toEqual(
      expect.objectContaining({
        kind: "plan-step",
        planId: "turn:turn-canvas",
        turnId: "turn-canvas",
      }),
    );
    expect(items[0]).not.toHaveProperty("node");
    expect(reordered.find((item) => item.title === items[0]?.title)?.id).toBe(items[0]?.id);
  });

  it("preserves duplicate references and disambiguates artifact ID collisions", () => {
    const collidingId = crokiCanvasReferenceItemId("owner", fileReference);
    const owner = { ...intent, id: "owner", references: [fileReference, fileReference] };
    const semanticCollision = { ...intent, id: collidingId, references: [] };
    const references = buildCrokiReferenceItems([owner]);
    const items = ensureCrokiCanvasItemIdsUnique([
      ...buildCrokiSemanticItems([owner, semanticCollision]),
      ...references,
    ]);

    expect(references).toHaveLength(2);
    expect(references[0]?.reference).toBe(fileReference);
    expect(references[1]?.reference).toBe(fileReference);
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
    expect(
      items.find((item) => item.kind === "semantic" && item.node === semanticCollision)?.id,
    ).toBe(collidingId);
  });
});

describe("Croki Canvas workflow layout", () => {
  const values = new Map<string, string>();

  beforeEach(() => {
    values.clear();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
  });

  it("round-trips personal object positions independently of item source", () => {
    persistCrokiCanvasPositions("workspace:product:wide", { intent: { x: 420, y: 180 } });

    expect(loadCrokiCanvasPositions("workspace:product:wide")).toEqual({
      intent: { x: 420, y: 180 },
    });
    expect(loadCrokiCanvasPositions("workspace:product:narrow")).toEqual({});
  });

  it("lays out heterogeneous objects and only connects semantic items", () => {
    const planItems = buildCrokiPlanStepItems({
      createdAt: "2026-07-31T00:00:00.000Z",
      turnId: TurnId.make("turn-canvas"),
      steps: [{ step: "Inspect the implementation", status: "inProgress" }],
    });
    const items: readonly CrokiCanvasItem[] = [
      ...buildCrokiSemanticItems([intent]),
      ...buildCrokiReferenceItems([intent]),
      ...planItems,
    ];
    const objects = buildCrokiCanvasObjects({
      edges: [],
      fieldWidth: 900,
      focusId: null,
      items,
      onSelect: vi.fn(),
      selectedId: null,
      storedPositions: { intent: { x: 300, y: 200 } },
    });

    expect(objects[0]?.position).toEqual({ x: 300, y: 200 });
    expect(objects.map(({ type, connectable }) => ({ type, connectable }))).toEqual([
      { type: "intent-object", connectable: true },
      { type: "file-reference-object", connectable: false },
      { type: "url-reference-object", connectable: false },
      { type: "plan-step-object", connectable: false },
    ]);
    expect(new Set(objects.map((object) => `${object.position.x}:${object.position.y}`)).size).toBe(
      objects.length,
    );
    expect(crokiCanvasItemSize(items[1]!)).toEqual({ width: 300, height: 84 });
  });

  it("places connected objects in arrow direction at every responsive width", () => {
    const nodes: CrokiContextNode[] = [
      { ...intent, id: "evidence", kind: "evidence" },
      { ...intent, id: "decision", kind: "decision" },
      { ...intent, id: "intent", kind: "intent" },
    ];
    const items = buildCrokiSemanticItems(nodes);
    const edges = [
      { from: "evidence", to: "decision", relation: "supports" },
      { from: "decision", to: "intent", relation: "implements" },
    ];
    const build = (fieldWidth: number) =>
      buildCrokiCanvasObjects({
        edges,
        fieldWidth,
        focusId: "decision",
        items,
        onSelect: vi.fn(),
        selectedId: null,
        storedPositions: {},
      });
    const medium = build(800);
    const wide = build(1200);
    const position = (objects: typeof medium, id: string) =>
      objects.find((object) => object.id === id)!.position;

    expect(position(medium, "evidence").y).toBeLessThan(position(medium, "decision").y);
    expect(position(medium, "decision").y).toBeLessThan(position(medium, "intent").y);
    expect(medium.every((object) => object.data.orientation === "vertical")).toBe(true);
    expect(position(wide, "evidence").x).toBeLessThan(position(wide, "decision").x);
    expect(position(wide, "decision").x).toBeLessThan(position(wide, "intent").x);
    expect(wide.every((object) => object.data.orientation === "horizontal")).toBe(true);
  });

  it("collapses cycles before layering their downstream artifacts", () => {
    const { references: _references, ...withoutReferences } = intent;
    const cycleNodes: CrokiContextNode[] = [
      { ...withoutReferences, id: "a", kind: "decision" },
      { ...withoutReferences, id: "b", kind: "decision", references: [fileReference] },
      { ...withoutReferences, id: "tail", kind: "work" },
    ];
    const semanticItems = buildCrokiSemanticItems(cycleNodes);
    const referenceItems = buildCrokiReferenceItems(cycleNodes);
    const objects = buildCrokiCanvasObjects({
      edges: [
        { from: "a", to: "b", relation: "cycles" },
        { from: "b", to: "a", relation: "cycles" },
        { from: "b", to: "tail", relation: "unblocks" },
        { from: "b", to: referenceItems[0]!.id, relation: "source" },
      ],
      fieldWidth: 1200,
      focusId: "b",
      items: [...semanticItems, ...referenceItems],
      onSelect: vi.fn(),
      selectedId: null,
      storedPositions: {},
    });
    const x = (id: string) => objects.find((object) => object.id === id)!.position.x;

    expect(x("a")).toBe(x("b"));
    expect(x("tail")).toBeGreaterThan(x("b"));
    expect(x(referenceItems[0]!.id)).toBeGreaterThan(x("b"));
  });

  it("keeps disconnected object kinds in one neutral layer", () => {
    const items = buildCrokiSemanticItems([
      { ...intent, id: "isolated-intent", kind: "intent" },
      { ...intent, id: "isolated-decision", kind: "decision" },
      { ...intent, id: "isolated-work", kind: "work" },
    ]);
    const objects = buildCrokiCanvasObjects({
      edges: [],
      fieldWidth: 1200,
      focusId: null,
      items,
      onSelect: vi.fn(),
      selectedId: null,
      storedPositions: {},
    });

    expect(new Set(objects.map((object) => object.position.x))).toEqual(new Set([36]));
  });
});
