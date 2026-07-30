import { EnvironmentId } from "@t3tools/contracts";
import { createEmptyCrokiContext, serializeCrokiContext } from "@t3tools/shared/crokiContext";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { replaceCrokiProduct } from "./crokiCanvasModel";
import {
  acceptCrokiCanvasMissing,
  acceptCrokiCanvasFile,
  acceptCrokiCanvasReadError,
  confirmCrokiCanvasRepair,
  getCrokiCanvasDraft,
  makeCrokiCanvasWorkspaceKey,
  reloadConflictingCrokiCanvasFile,
  replaceCrokiCanvasDraft,
  resetCrokiCanvasDraftStoreForTests,
} from "./crokiCanvasDraftStore";
import { addProvisionalCrokiEvidence } from "./crokiCanvasEvidenceDraft";

const KEY = makeCrokiCanvasWorkspaceKey("local", "/work/croki");

describe("crokiCanvasDraftStore", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createStorage());
    resetCrokiCanvasDraftStoreForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps a dirty draft when the Canvas unmounts and is read again", () => {
    const baseline = createEmptyCrokiContext("Croki");
    acceptCrokiCanvasFile(KEY, serializeCrokiContext(baseline), "Croki");
    replaceCrokiCanvasDraft(
      KEY,
      replaceCrokiProduct(baseline, "Croki Studio", "2026-07-30T00:00:00.000Z"),
    );

    expect(getCrokiCanvasDraft(KEY).dirty).toBe(true);
    expect(getCrokiCanvasDraft(KEY).context.product).toBe("Croki Studio");

    resetCrokiCanvasDraftStoreForTests();
    expect(getCrokiCanvasDraft(KEY).context.product).toBe("Croki Studio");
    expect(getCrokiCanvasDraft(KEY).dirty).toBe(true);
  });

  it("does not replace dirty state when the workspace file changes", () => {
    const baseline = createEmptyCrokiContext("Croki");
    acceptCrokiCanvasFile(KEY, serializeCrokiContext(baseline), "Croki");
    replaceCrokiCanvasDraft(
      KEY,
      replaceCrokiProduct(baseline, "Local draft", "2026-07-30T00:00:00.000Z"),
    );
    const external = replaceCrokiProduct(baseline, "External edit", "2026-07-30T00:01:00.000Z");
    acceptCrokiCanvasFile(KEY, serializeCrokiContext(external), "Croki");

    expect(getCrokiCanvasDraft(KEY).context.product).toBe("Local draft");
    expect(getCrokiCanvasDraft(KEY).conflictContents).not.toBeNull();

    reloadConflictingCrokiCanvasFile(KEY, "Croki");
    expect(getCrokiCanvasDraft(KEY).context.product).toBe("External edit");
    expect(getCrokiCanvasDraft(KEY).dirty).toBe(false);
  });

  it("preserves a dirty draft across read errors", () => {
    const draft = replaceCrokiProduct(
      createEmptyCrokiContext("Croki"),
      "Unsaved",
      "2026-07-30T00:00:00.000Z",
    );
    replaceCrokiCanvasDraft(KEY, draft);
    acceptCrokiCanvasReadError(KEY, "Workspace disconnected", "Croki");

    expect(getCrokiCanvasDraft(KEY).context.product).toBe("Unsaved");
    expect(getCrokiCanvasDraft(KEY).sourceMessage).toBe("Workspace disconnected");
  });

  it("requires explicit repair before replacing malformed source state", () => {
    acceptCrokiCanvasFile(KEY, "{nope", "Croki");
    expect(getCrokiCanvasDraft(KEY).sourceState).toBe("malformed");
    expect(getCrokiCanvasDraft(KEY).dirty).toBe(false);

    confirmCrokiCanvasRepair(KEY, "Croki");
    expect(getCrokiCanvasDraft(KEY).repairInProgress).toBe(true);
    expect(getCrokiCanvasDraft(KEY).dirty).toBe(true);
  });

  it("recovers valid canon and requires confirmation before removing invalid entries", () => {
    acceptCrokiCanvasFile(
      KEY,
      JSON.stringify({
        version: 1,
        product: "Croki",
        updatedAt: "2026-07-30T00:00:00.000Z",
        nodes: [
          {
            id: "durable-canon",
            kind: "decision",
            status: "current",
            title: "Threads remain the spine",
            body: "",
            updatedAt: "2026-07-30T00:00:00.000Z",
          },
          {
            id: "broken-proposal",
            kind: "unknown",
            status: "provisional",
            title: "Invalid proposal",
            body: "",
            updatedAt: "2026-07-30T00:00:00.000Z",
          },
        ],
        edges: [],
      }),
      "Croki",
    );

    const recovered = getCrokiCanvasDraft(KEY);
    expect(recovered.sourceState).toBe("partial");
    expect(recovered.context.nodes.map((node) => node.id)).toEqual(["durable-canon"]);
    expect(recovered.dirty).toBe(false);
    expect(recovered.sourceMessage).toContain("1 invalid Canvas entry");

    confirmCrokiCanvasRepair(KEY, "Croki");
    const repair = getCrokiCanvasDraft(KEY);
    expect(repair.context.nodes.map((node) => node.id)).toEqual(["durable-canon"]);
    expect(repair.repairInProgress).toBe(true);
    expect(repair.dirty).toBe(true);
  });

  it("captures deduplicated evidence as provisional only", () => {
    acceptCrokiCanvasMissing(KEY, "Croki");
    const input = {
      environmentId: EnvironmentId.make("local"),
      workspaceRoot: "/work/croki",
      productName: "Croki",
      title: "Canvas implementation",
      reference: { kind: "file", path: "src/canvas.ts", line: 42 } as const,
    };

    expect(addProvisionalCrokiEvidence(input)).toBe("added");
    expect(
      addProvisionalCrokiEvidence({
        ...input,
        reference: { kind: "url", url: "https://example.com/evidence" },
      }),
    ).toBe("added");
    expect(addProvisionalCrokiEvidence(input)).toBe("duplicate");
    const state = getCrokiCanvasDraft(KEY);
    expect(state.context.nodes).toHaveLength(1);
    expect(state.context.nodes[0]).toMatchObject({
      kind: "evidence",
      status: "provisional",
      domain: "product",
      origin: "repository",
      title: "Canvas implementation",
      references: [input.reference, { kind: "url", url: "https://example.com/evidence" }],
    });
    expect(state.dirty).toBe(true);
  });

  it("never appends captured evidence to current canon", () => {
    const baseline = {
      ...createEmptyCrokiContext("Croki"),
      nodes: [
        {
          id: "approved-evidence",
          kind: "evidence" as const,
          status: "current" as const,
          title: "Canvas implementation",
          body: "",
          updatedAt: "2026-07-30T00:00:00.000Z",
        },
      ],
    };
    acceptCrokiCanvasFile(KEY, serializeCrokiContext(baseline), "Croki");

    expect(
      addProvisionalCrokiEvidence({
        environmentId: EnvironmentId.make("local"),
        workspaceRoot: "/work/croki",
        productName: "Croki",
        title: "Canvas implementation",
        reference: { kind: "url", url: "https://example.com/evidence" },
      }),
    ).toBe("added");

    const nodes = getCrokiCanvasDraft(KEY).context.nodes;
    expect(nodes[0]?.references).toBeUndefined();
    expect(nodes[1]).toMatchObject({
      kind: "evidence",
      status: "provisional",
    });
  });
});

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}
