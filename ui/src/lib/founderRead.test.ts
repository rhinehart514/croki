import { describe, expect, it } from "vitest";
import type { WovenCanvasAnchor } from "@/types";
import { prioritizedProductTruths } from "./founderRead";

function truth(id: string, label: string): WovenCanvasAnchor {
  return { id, kind: "product-truth", ref: { type: "product-truth", id }, label, body: {}, authority: { owner: "scan", id, projectId: "p", updatedAt: null } };
}

describe("prioritizedProductTruths", () => {
  it("deduplicates scanner tokens and puts contextual grounded claims first", () => {
    const result = prioritizedProductTruths([
      truth("1", "Segment"), truth("2", "segment"), truth("3", "utm_source"),
      truth("4", "Signup captures campaign attribution before workspace creation"),
      truth("5", "External clients can read a shared brief without buying a seat"),
    ]);
    expect(result.map((item) => item.label)).toEqual([
      "Signup captures campaign attribution before workspace creation",
      "External clients can read a shared brief without buying a seat",
      "utm_source",
    ]);
  });
});
