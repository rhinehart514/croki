import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import {
  CROKI_CANVAS_ARTIFACT_LIMITS,
  CrokiCanvasArtifact,
  parseCrokiCanvasArtifact,
} from "./crokiCanvasArtifact.ts";

const decodeArtifact = Schema.decodeUnknownSync(CrokiCanvasArtifact, {
  onExcessProperty: "error",
});

const baseArtifact = {
  id: "artifact-1",
  revision: 1,
  threadId: "thread-1",
  turnId: "turn-1",
  harnessId: "product-v1",
  presentation: "compare",
  question: "Which product route should Croki take?",
  nodes: [
    {
      id: "question",
      role: "question",
      title: "Which product route should Croki take?",
      body: "A bounded question for the founder.",
    },
    {
      id: "route-a",
      role: "route",
      title: "Keep Canvas as a visual thinking surface",
      whyItMatters: "Preserves spatial judgment without making Canvas a dashboard.",
      references: [{ kind: "file", path: "docs/project/harness-canvas-spec.md", line: 1 }],
    },
  ],
  edges: [{ from: "question", to: "route-a", relation: "evaluates" }],
  createdAt: "2026-08-02T12:00:00.000Z",
};

describe("CrokiCanvasArtifact", () => {
  it("decodes a bounded immutable revision and trims identifiers", () => {
    const artifact = decodeArtifact({
      ...baseArtifact,
      id: " artifact-1 ",
      nodes: baseArtifact.nodes.map((node, index) => ({
        ...node,
        id: ` ${node.id} `,
        ...(index === 0 ? { role: "focal" as const } : {}),
      })),
    });

    expect(artifact.id).toBe("artifact-1");
    expect(artifact.nodes[0]?.id).toBe("question");
    expect(artifact.presentation).toBe("compare");
    expect(artifact.nodes[0]?.role).toBe("focal");
  });

  it("rejects duplicate nodes, dangling edges, and self edges", () => {
    expect(() =>
      decodeArtifact({
        ...baseArtifact,
        nodes: [baseArtifact.nodes[0], { ...baseArtifact.nodes[0], title: "Duplicate" }],
        edges: [],
      }),
    ).toThrow();

    expect(() =>
      decodeArtifact({
        ...baseArtifact,
        edges: [{ from: "missing", to: "route-a", relation: "evaluates" }],
      }),
    ).toThrow();

    expect(() =>
      decodeArtifact({
        ...baseArtifact,
        edges: [{ from: "route-a", to: "route-a", relation: "loops" }],
      }),
    ).toThrow();
  });

  it("rejects native harnesses, unsupported presentation kinds, and unknown keys", () => {
    expect(() => decodeArtifact({ ...baseArtifact, harnessId: "native" })).toThrow();
    expect(() => decodeArtifact({ ...baseArtifact, presentation: "dashboard" })).toThrow();
    expect(() => decodeArtifact({ ...baseArtifact, privatePrompt: "do not leak" })).toThrow();
  });

  it("rejects oversized scenes and non-portable references", () => {
    const nodes = Array.from({ length: CROKI_CANVAS_ARTIFACT_LIMITS.nodes + 1 }, (_, index) => ({
      id: `node-${index}`,
      role: "route" as const,
      title: `Route ${index}`,
    }));
    expect(() => decodeArtifact({ ...baseArtifact, nodes, edges: [] })).toThrow();
    expect(() =>
      decodeArtifact({
        ...baseArtifact,
        nodes: [
          {
            ...baseArtifact.nodes[0],
            references: [{ kind: "file", path: "/etc/passwd" }],
          },
        ],
        edges: [],
      }),
    ).toThrow();
  });

  it("returns null for malformed untrusted input", () => {
    expect(parseCrokiCanvasArtifact({ ...baseArtifact, revision: 0 })).toBeNull();
    expect(parseCrokiCanvasArtifact({ ...baseArtifact, nodes: [] })).toBeNull();
    expect(parseCrokiCanvasArtifact({ ...baseArtifact, createdAt: "tomorrow" })).toBeNull();
  });
});
