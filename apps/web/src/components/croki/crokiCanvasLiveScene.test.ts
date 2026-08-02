import type { CrokiContext } from "@croki/shared/crokiContext";
import { ThreadId } from "@croki/contracts";
import type { CrokiPerceptionFrame } from "@croki/shared/crokiPerception";
import { describe, expect, it } from "vite-plus/test";

import type { CrokiCanvasArtifactLike } from "./crokiCanvasArtifactTypes";
import { projectCrokiCanvasLiveScene } from "./crokiCanvasLiveScene";

const context: CrokiContext = {
  version: 1,
  product: "Croki",
  updatedAt: "2026-07-31T18:00:00.000Z",
  nodes: [
    {
      id: "decision",
      kind: "decision",
      status: "current",
      domain: "product",
      origin: "founder",
      title: "Canvas is perceptual",
      body: "",
      updatedAt: "2026-07-31T18:00:00.000Z",
      references: [
        { kind: "file", path: "apps/web/src/components/croki/CrokiCanvas.tsx", line: 1 },
      ],
    },
    {
      id: "proposal",
      kind: "work",
      status: "provisional",
      domain: "product",
      origin: "agent",
      title: "Project observations into Canvas",
      body: "",
      updatedAt: "2026-07-31T18:00:00.000Z",
    },
  ],
  edges: [{ from: "proposal", to: "decision", relation: "supports" }],
  release: {
    version: "0.4.2",
    baseline: "0.4.1",
    goal: "A true Canvas",
    status: "active",
    items: [
      {
        id: "canvas",
        title: "Live perception",
        kind: "feature",
        status: "working",
        outcome: "",
        acceptanceCriteria: [],
        sourceThreads: [{ id: "thread-1", title: "Build the Canvas" }],
      },
    ],
  },
};

const artifact = (revision: number): CrokiCanvasArtifactLike => ({
  id: `artifact-${revision}`,
  revision,
  threadId: ThreadId.make("thread-1"),
  turnId: null,
  harnessId: "product-v1",
  presentation: "system",
  question: "Observe the system",
  nodes: [{ id: "focal", role: "focal", title: "Runtime" }],
  edges: [],
  createdAt: `2026-07-31T18:0${revision}:00.000Z`,
});

describe("projectCrokiCanvasLiveScene", () => {
  it("projects context, source evidence, release work, agents, and attention together", () => {
    const scene = projectCrokiCanvasLiveScene({
      context,
      activePlan: null,
      activeThread: { id: "thread-1", title: "Build the Canvas" },
      externalQuestion: "Why is the system difficult to perceive?",
    });

    expect(scene.objects.map((object) => object.id)).toEqual(
      expect.arrayContaining([
        "attention:stream",
        "context:decision",
        "context:proposal",
        "reference:decision:0",
        "release:0.4.2",
        "release-item:canvas",
        "agent:thread:thread-1",
      ]),
    );
    expect(scene.attentionIds).toContain("context:proposal");
    expect(scene.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relation: "supports", kind: "epistemic" }),
        expect.objectContaining({ relation: "source", kind: "source" }),
      ]),
    );
    expect(scene.objects.find((object) => object.id === "attention:stream")?.body).toBe(
      "Why is the system difficult to perceive?",
    );
  });

  it("keeps visual revisions temporal and projects the selected revision into the scene", () => {
    const prior = artifact(1);
    const latest = artifact(2);
    const { release: _release, ...contextWithoutRelease } = context;
    const scene = projectCrokiCanvasLiveScene({
      context: contextWithoutRelease,
      artifact: prior,
      latestArtifact: latest,
      artifacts: [prior, latest],
      activePlan: null,
    });

    expect(scene.revisionObjects.map((object) => object.revision)).toEqual([2, 1]);
    expect(scene.objects.some((object) => object.id === "visual:revision:artifact-1")).toBe(true);
    expect(scene.objects.some((object) => object.id === "visual:artifact-1:focal")).toBe(true);
    expect(scene.edges).toEqual(
      expect.arrayContaining([expect.objectContaining({ relation: "contains" })]),
    );
  });

  it("treats a perception frame as the primary source and does not merge legacy memory into it", () => {
    const frame: CrokiPerceptionFrame = {
      threadId: "thread-live",
      revision: 7,
      sourceRevision: 7,
      changed: true,
      objects: [
        {
          id: "runtime:latency",
          type: "runtime",
          title: "Latency regression",
          summary: "The live preview is slower than its expected budget.",
          state: "blocked",
          revision: 7,
          source: {
            kind: "preview",
            id: "preview-1",
            turnId: null,
            observedAt: "2026-07-31T18:10:00.000Z",
          },
          affordances: [
            {
              id: "approve-fix",
              kind: "approve",
              label: "Approve fix",
              authority: "Founder",
              reversible: true,
              requiresApproval: true,
            },
          ],
        },
      ],
      relationships: [],
      delta: {
        sinceRevision: 6,
        addedObjects: [],
        updatedObjects: [],
        removedObjectIds: [],
        addedRelationships: [],
        removedRelationshipIds: [],
      },
      latestActivityAt: "2026-07-31T18:10:00.000Z",
      activeTurnId: null,
      truncated: false,
    };
    const scene = projectCrokiCanvasLiveScene({
      context,
      perceptionFrame: frame,
      artifact: artifact(1),
      activePlan: null,
    });

    expect(scene.perceptionRevision).toBe(7);
    expect(scene.objects.map((object) => object.id)).toEqual([
      "attention:stream",
      "runtime:latency",
    ]);
    expect(scene.attentionIds).toEqual(["runtime:latency"]);
    expect(scene.objects.find((object) => object.id === "runtime:latency")?.affordances).toEqual([
      { id: "approve", label: "Approve fix" },
    ]);
  });
});
