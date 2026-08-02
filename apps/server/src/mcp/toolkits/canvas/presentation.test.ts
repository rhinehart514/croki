import { expect, it } from "@effect/vitest";

import { buildCrokiCanvasArtifact } from "./presentation.ts";

const NOW = "2026-08-02T18:00:00.000Z";

it("builds a bounded immutable artifact without project-context semantics", () => {
  const artifact = buildCrokiCanvasArtifact(
    {
      harnessId: "product-v1",
      presentation: "compare",
      question: "Which route should the founder choose?",
      nodes: [
        {
          id: "question",
          role: "question",
          title: "How should Canvas participate?",
          whyItMatters: "The surface must improve judgment without becoming a dashboard.",
        },
        {
          id: "visual-artifact",
          role: "route",
          title: "Optional visual artifact",
          body: "Product and GTM harnesses present spatial arguments only when useful.",
          references: [{ kind: "file", path: "docs/project/harness-canvas-spec.md", line: 12 }],
        },
      ],
      edges: [{ from: "visual-artifact", to: "question", relation: "answers" }],
    },
    {
      artifactId: "artifact-1",
      revision: 2,
      threadId: "thread-1",
      turnId: null,
      harnessId: "product-v1",
      createdAt: NOW,
    },
  );

  expect(artifact).toMatchObject({
    id: "artifact-1",
    revision: 2,
    threadId: "thread-1",
    harnessId: "product-v1",
    presentation: "compare",
    question: "Which route should the founder choose?",
  });
  expect(artifact.nodes).toHaveLength(2);
  expect(artifact.edges).toEqual([
    { from: "visual-artifact", to: "question", relation: "answers" },
  ]);
  expect(JSON.stringify(artifact)).not.toContain("provisional");
  expect(JSON.stringify(artifact)).not.toContain("context.json");
});

it("normalizes rollout-era Product scenes to a recoverable compare artifact", () => {
  const artifact = buildCrokiCanvasArtifact(
    {
      view: "product",
      question: "What should Canvas show?",
      nodes: [
        { id: "intent", kind: "intent", title: "Keep judgment near the work" },
        { id: "evidence", kind: "evidence", title: "Thread already owns execution" },
      ],
      edges: [{ from: "evidence", to: "intent", relation: "supports" }],
    },
    {
      artifactId: "artifact-legacy",
      revision: 1,
      threadId: "thread-legacy",
      turnId: null,
      harnessId: "product-v1",
      createdAt: NOW,
    },
  );

  expect(artifact.presentation).toBe("compare");
  expect(artifact.nodes.map((node) => node.role)).toEqual(["question", "evidence"]);
});

it("rejects duplicate ids, dangling edges, invalid legacy workflow, and duplicate edges", () => {
  expect(() =>
    buildCrokiCanvasArtifact(
      {
        harnessId: "gtm-v1",
        presentation: "journey",
        question: "Where does the funnel break?",
        nodes: [
          { id: "same", role: "route", title: "A" },
          { id: "same", role: "route", title: "B" },
        ],
        edges: [],
      },
      {
        artifactId: "artifact-dup",
        revision: 1,
        threadId: "thread-dup",
        turnId: null,
        harnessId: "gtm-v1",
        createdAt: NOW,
      },
    ),
  ).toThrow(/duplicated/);

  expect(() =>
    buildCrokiCanvasArtifact(
      {
        harnessId: "gtm-v1",
        presentation: "system",
        question: "Who owns the channel?",
        nodes: [{ id: "owner", role: "route", title: "Founder" }],
        edges: [{ from: "owner", to: "missing", relation: "owns" }],
      },
      {
        artifactId: "artifact-dangling",
        revision: 1,
        threadId: "thread-dangling",
        turnId: null,
        harnessId: "gtm-v1",
        createdAt: NOW,
      },
    ),
  ).toThrow(/missing node/);

  expect(() =>
    buildCrokiCanvasArtifact(
      {
        view: "workflow",
        question: "No longer a supported harness",
        nodes: [{ id: "workflow", kind: "work", title: "Worker" }],
        edges: [],
      },
      {
        artifactId: "artifact-workflow",
        revision: 1,
        threadId: "thread-workflow",
        turnId: null,
        harnessId: "product-v1",
        createdAt: NOW,
      },
    ),
  ).toThrow(/no longer supported/);
});
