import { EnvironmentId } from "@croki/contracts";
import { createEmptyCrokiContext, serializeCrokiContext } from "@croki/shared/crokiContext";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { replaceCrokiProduct } from "./crokiCanvasModel";
import {
  acceptCrokiCanvasMissing,
  acceptCrokiCanvasFile,
  acceptCrokiCanvasReadError,
  confirmCrokiCanvasRepair,
  discardCrokiCanvasDraft,
  getCrokiCanvasDraft,
  makeCrokiCanvasWorkspaceKey,
  markCrokiCanvasSaved,
  redoCrokiCanvasDraft,
  reloadConflictingCrokiCanvasFile,
  replaceCrokiCanvasDraft,
  resetCrokiCanvasDraftStoreForTests,
  undoCrokiCanvasDraft,
} from "./crokiCanvasDraftStore";
import { canRedoCrokiCanvasDraft, canUndoCrokiCanvasDraft } from "./crokiCanvasDraftHistory";
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
    expect(canUndoCrokiCanvasDraft(KEY)).toBe(false);
  });

  it("undoes and redoes draft changes without persisting session history", () => {
    const baseline = createEmptyCrokiContext("Croki");
    acceptCrokiCanvasFile(KEY, serializeCrokiContext(baseline), "Croki");
    const studio = replaceCrokiProduct(baseline, "Croki Studio", "2026-07-30T00:00:00.000Z");
    const ade = replaceCrokiProduct(studio, "Croki ADE", "2026-07-30T00:01:00.000Z");

    replaceCrokiCanvasDraft(KEY, studio);
    replaceCrokiCanvasDraft(KEY, ade);
    expect(canUndoCrokiCanvasDraft(KEY)).toBe(true);
    expect(canRedoCrokiCanvasDraft(KEY)).toBe(false);

    undoCrokiCanvasDraft(KEY);
    expect(getCrokiCanvasDraft(KEY).context.product).toBe("Croki Studio");
    expect(getCrokiCanvasDraft(KEY).dirty).toBe(true);
    expect(canRedoCrokiCanvasDraft(KEY)).toBe(true);

    undoCrokiCanvasDraft(KEY);
    expect(getCrokiCanvasDraft(KEY).context.product).toBe("Croki");
    expect(getCrokiCanvasDraft(KEY).dirty).toBe(false);

    redoCrokiCanvasDraft(KEY);
    redoCrokiCanvasDraft(KEY);
    expect(getCrokiCanvasDraft(KEY).context.product).toBe("Croki ADE");
    expect(canRedoCrokiCanvasDraft(KEY)).toBe(false);
  });

  it("clears redo history when the user branches from an undone draft", () => {
    const baseline = createEmptyCrokiContext("Croki");
    acceptCrokiCanvasFile(KEY, serializeCrokiContext(baseline), "Croki");
    replaceCrokiCanvasDraft(
      KEY,
      replaceCrokiProduct(baseline, "First", "2026-07-30T00:00:00.000Z"),
    );
    replaceCrokiCanvasDraft(
      KEY,
      replaceCrokiProduct(getCrokiCanvasDraft(KEY).context, "Second", "2026-07-30T00:01:00.000Z"),
    );

    undoCrokiCanvasDraft(KEY);
    replaceCrokiCanvasDraft(
      KEY,
      replaceCrokiProduct(getCrokiCanvasDraft(KEY).context, "Branch", "2026-07-30T00:02:00.000Z"),
    );

    expect(canRedoCrokiCanvasDraft(KEY)).toBe(false);
    expect(getCrokiCanvasDraft(KEY).context.product).toBe("Branch");
  });

  it("discards uncommitted changes and resets history to the workspace baseline", () => {
    const baseline = createEmptyCrokiContext("Croki");
    acceptCrokiCanvasFile(KEY, serializeCrokiContext(baseline), "Croki");
    replaceCrokiCanvasDraft(
      KEY,
      replaceCrokiProduct(baseline, "Unsaved", "2026-07-30T00:00:00.000Z"),
    );

    discardCrokiCanvasDraft(KEY);

    expect(getCrokiCanvasDraft(KEY).context).toEqual(baseline);
    expect(getCrokiCanvasDraft(KEY).dirty).toBe(false);
    expect(canUndoCrokiCanvasDraft(KEY)).toBe(false);
    expect(canRedoCrokiCanvasDraft(KEY)).toBe(false);
    expect(localStorage.length).toBe(0);
  });

  it("starts a fresh history after save or source replacement", () => {
    const baseline = createEmptyCrokiContext("Croki");
    acceptCrokiCanvasFile(KEY, serializeCrokiContext(baseline), "Croki");
    const saved = replaceCrokiProduct(baseline, "Saved", "2026-07-30T00:00:00.000Z");
    replaceCrokiCanvasDraft(KEY, saved);
    markCrokiCanvasSaved(KEY, saved);
    expect(canUndoCrokiCanvasDraft(KEY)).toBe(false);

    const external = replaceCrokiProduct(saved, "External", "2026-07-30T00:01:00.000Z");
    acceptCrokiCanvasFile(KEY, serializeCrokiContext(external), "Croki");
    expect(canUndoCrokiCanvasDraft(KEY)).toBe(false);
    expect(canRedoCrokiCanvasDraft(KEY)).toBe(false);
  });

  it("keeps newer edits undoable when a save finishes in the background", () => {
    const baseline = createEmptyCrokiContext("Croki");
    acceptCrokiCanvasFile(KEY, serializeCrokiContext(baseline), "Croki");
    const saving = replaceCrokiProduct(baseline, "Saving", "2026-07-30T00:00:00.000Z");
    const newer = replaceCrokiProduct(saving, "Newer edit", "2026-07-30T00:01:00.000Z");
    replaceCrokiCanvasDraft(KEY, saving);
    replaceCrokiCanvasDraft(KEY, newer);

    markCrokiCanvasSaved(KEY, saving);
    expect(getCrokiCanvasDraft(KEY).context.product).toBe("Newer edit");
    expect(canUndoCrokiCanvasDraft(KEY)).toBe(true);

    undoCrokiCanvasDraft(KEY);
    expect(getCrokiCanvasDraft(KEY).context.product).toBe("Saving");
    expect(getCrokiCanvasDraft(KEY).dirty).toBe(false);
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
