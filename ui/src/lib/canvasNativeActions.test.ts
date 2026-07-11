import { describe, expect, it } from "vitest";
import { canvasAnchorRef, canvasPasteRequest, canvasRelationship } from "@/lib/canvasNativeActions";

describe("canvas-native actions", () => {
  it("keeps only stable authority references", () => {
    expect(canvasAnchorRef({ ref: { type: "goal", id: "g-1" } })).toEqual({ type: "goal", id: "g-1" });
    expect(canvasAnchorRef({ ref: { type: null, id: "g-1" } })).toBeNull();
    expect(canvasAnchorRef({ ref: { type: "goal", id: "" } })).toBeNull();
  });

  it("builds an open relationship without copying canvas node ids", () => {
    expect(canvasRelationship(
      { ref: { type: "goal", id: "g-1" } },
      { ref: { type: "work-artifact", id: "a-4" } },
    )).toEqual({
      sourceRef: { type: "goal", id: "g-1" },
      targetRef: { type: "work-artifact", id: "a-4" },
      kind: "related-to",
    });
  });

  it("rejects self-links and presentation-only nodes", () => {
    expect(canvasRelationship(
      { ref: { type: "goal", id: "g-1" } },
      { ref: { type: "goal", id: "g-1" } },
    )).toBeNull();
    expect(canvasRelationship({ label: "Goal" }, { ref: { type: "goal", id: "g-1" } })).toBeNull();
  });

  it("turns pasted prose and URLs into durable open work at the canvas coordinate", () => {
    expect(canvasPasteRequest("A customer keeps missing the activation prompt.\nCheck session replay.", { x: 40, y: 80 })).toEqual({
      kind: "work", workKind: "note", title: "A customer keeps missing the activation prompt.",
      contentType: "text/plain", content: "A customer keeps missing the activation prompt.\nCheck session replay.", position: { x: 40, y: 80 },
    });
    expect(canvasPasteRequest("https://example.com/research/activation", { x: 12, y: 24 })).toMatchObject({
      kind: "work", workKind: "reference", title: "example.com/research/activation",
      contentType: "text/uri-list", position: { x: 12, y: 24 },
    });
  });
});
