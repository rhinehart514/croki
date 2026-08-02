import type { ProjectReadFileResult } from "@croki/contracts";
import type { CrokiContext } from "@croki/shared/crokiContext";
import { describe, expect, it } from "vite-plus/test";

import {
  buildCrokiCanvasPresentation,
  selectCrokiCanvasLoadState,
  selectCrokiEvidenceLinks,
} from "./crokiCanvasPresentation";

const CONTEXT: CrokiContext = {
  version: 1,
  product: "Croki",
  updatedAt: "2026-07-30T12:00:00.000Z",
  nodes: [
    {
      id: "intent",
      kind: "intent",
      status: "current",
      title: "Keep product truth visible",
      body: "The coding loop should retain product intent.",
      updatedAt: "2026-07-30T12:00:00.000Z",
      references: [
        { kind: "file", path: "src/app.ts", line: 42 },
        { kind: "url", url: "https://example.com/evidence" },
        { kind: "url", url: "https://example.com/evidence" },
      ],
    },
    {
      id: "proposal",
      kind: "work",
      status: "provisional",
      title: "Add mobile Canvas",
      body: "Expose the same context on mobile.",
      updatedAt: "2026-07-30T12:00:00.000Z",
    },
    {
      id: "old",
      kind: "decision",
      status: "retired",
      title: "Separate runtime",
      body: "No longer current.",
      updatedAt: "2026-07-30T12:00:00.000Z",
    },
  ],
  edges: [{ from: "proposal", to: "intent", relation: "advances" }],
};

function fileResult(contents: string): ProjectReadFileResult {
  return {
    relativePath: ".croki/context.json",
    contents,
    byteLength: new TextEncoder().encode(contents).byteLength,
    truncated: false,
  };
}

describe("mobile Croki Canvas presentation", () => {
  it("separates canon, suggestions, retired nodes, and titled relationships", () => {
    const presentation = buildCrokiCanvasPresentation(CONTEXT);

    expect(presentation.current.map((node) => node.id)).toEqual(["intent"]);
    expect(presentation.provisional.map((node) => node.id)).toEqual(["proposal"]);
    expect(presentation.retired.map((node) => node.id)).toEqual(["old"]);
    expect(presentation.relationships[0]).toMatchObject({
      fromTitle: "Add mobile Canvas",
      toTitle: "Keep product truth visible",
      edge: { relation: "advances" },
    });
  });

  it("classifies ready, missing, malformed, oversized, and read failures", () => {
    expect(
      selectCrokiCanvasLoadState({
        data: fileResult(JSON.stringify(CONTEXT)),
        error: null,
        failure: null,
        isPending: false,
      }).status,
    ).toBe("ready");
    expect(
      selectCrokiCanvasLoadState({
        data: null,
        error: "Failed to read file",
        failure: {
          _tag: "ProjectReadFileError",
          failure: "operation_failed",
          operation: "realpath-target",
        },
        isPending: false,
      }).status,
    ).toBe("missing");
    expect(
      selectCrokiCanvasLoadState({
        data: fileResult("{broken"),
        error: null,
        failure: null,
        isPending: false,
      }).status,
    ).toBe("malformed");
    const partial = selectCrokiCanvasLoadState({
      data: fileResult(
        JSON.stringify({
          ...CONTEXT,
          nodes: [
            CONTEXT.nodes[0],
            {
              ...CONTEXT.nodes[1],
              references: [{ kind: "file", path: "../outside.txt" }],
            },
          ],
          edges: [],
        }),
      ),
      error: null,
      failure: null,
      isPending: false,
    });
    expect(partial.status).toBe("partial");
    if (partial.status === "partial") {
      expect(partial.issueCount).toBe(1);
      expect(partial.context.nodes.map((node) => node.id)).toEqual(["intent"]);
    }
    expect(
      selectCrokiCanvasLoadState({
        data: { ...fileResult("{}"), byteLength: 256_001 },
        error: null,
        failure: null,
        isPending: false,
      }).status,
    ).toBe("oversized");
    expect(
      selectCrokiCanvasLoadState({
        data: null,
        error: "Environment unavailable",
        failure: null,
        isPending: false,
      }),
    ).toEqual({ status: "read-error", detail: "Environment unavailable" });
  });

  it("maps and deduplicates parsed file and HTTP(S) references for navigation", () => {
    expect(selectCrokiEvidenceLinks(CONTEXT.nodes[0]!)).toEqual([
      { kind: "file", path: "src/app.ts", line: 42 },
      { kind: "url", url: "https://example.com/evidence" },
    ]);
  });
});
