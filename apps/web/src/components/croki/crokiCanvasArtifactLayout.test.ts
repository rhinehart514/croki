import { describe, expect, it } from "vite-plus/test";

import {
  buildCrokiCanvasArtifactLayout,
  crokiCanvasArtifactLayoutBucket,
} from "./crokiCanvasArtifactLayout";

const nodes = [
  { id: "question", role: "question" as const },
  { id: "route-a", role: "route" as const },
  { id: "route-b", role: "route" as const },
  { id: "evidence", role: "evidence" as const },
];

describe("Harness Canvas artifact layout", () => {
  it("uses stable responsive buckets", () => {
    expect(crokiCanvasArtifactLayoutBucket(1200)).toBe("wide");
    expect(crokiCanvasArtifactLayoutBucket(800)).toBe("medium");
    expect(crokiCanvasArtifactLayoutBucket(480)).toBe("narrow");
  });

  it("keeps compare questions above aligned routes", () => {
    const positions = buildCrokiCanvasArtifactLayout({
      nodes,
      edges: [],
      fieldWidth: 1200,
      presentation: "compare",
    });
    expect(positions.question?.y).toBeLessThan(positions["route-a"]?.y ?? Infinity);
    expect(positions["route-a"]?.y).toBe(positions["route-b"]?.y);
    expect(positions["route-a"]?.x).toBeLessThan(positions["route-b"]?.x ?? Infinity);
  });

  it("preserves reading order when a journey becomes narrow", () => {
    const positions = buildCrokiCanvasArtifactLayout({
      nodes,
      edges: [],
      fieldWidth: 480,
      presentation: "journey",
    });
    expect(positions.question?.x).toBe(positions["route-a"]?.x);
    expect(positions["route-a"]?.y).toBeLessThan(positions["route-b"]?.y ?? Infinity);
  });

  it("uses directional ranks for system relationships", () => {
    const positions = buildCrokiCanvasArtifactLayout({
      nodes,
      edges: [
        { from: "question", to: "route-a" },
        { from: "route-a", to: "evidence" },
      ],
      fieldWidth: 1200,
      presentation: "system",
    });
    expect(positions["route-a"]?.y).toBeGreaterThan(positions.question?.y ?? Infinity);
    expect(positions.evidence?.y).toBeGreaterThan(positions["route-a"]?.y ?? Infinity);
  });
});
