import { describe, expect, it } from "vite-plus/test";

import type { CrokiPerceptionFrame, CrokiPerceptionObject } from "@croki/shared/crokiPerception";

import { projectCrokiPerceptionFrame } from "./crokiCanvasPerceptionProjection";

const observedAt = "2026-08-02T12:00:00.000Z";

function object(
  id: string,
  type: string,
  title: string,
  options: {
    readonly revision?: number;
    readonly state?: string;
    readonly role?: string;
    readonly artifactRevision?: number;
    readonly approval?: boolean;
  } = {},
): CrokiPerceptionObject {
  return {
    id,
    type,
    title,
    summary: `${title} summary`,
    revision: options.revision ?? 10,
    ...(options.state ? { state: options.state } : {}),
    source: {
      kind: type === "thread" ? "thread" : options.role ? "canvas" : "runtime",
      id,
      turnId: "turn-1",
      observedAt,
    },
    affordances: options.approval
      ? [
          {
            id: "approve",
            kind: "approve",
            label: "Approve",
            authority: "Founder",
            reversible: true,
            requiresApproval: true,
          },
        ]
      : [
          {
            id: "inspect",
            kind: "inspect",
            label: "Inspect source",
            authority: "read",
            reversible: true,
            requiresApproval: false,
          },
        ],
    ...(options.role
      ? { data: { role: options.role, artifactRevision: options.artifactRevision ?? 2 } }
      : {}),
  };
}

function frame(objects: readonly CrokiPerceptionObject[]): CrokiPerceptionFrame {
  return {
    threadId: "thread-1",
    revision: 10,
    sourceRevision: 10,
    changed: true,
    objects,
    relationships: [
      {
        id: "hidden-edge",
        from: "activity:command-1",
        to: "activity:context-1",
        kind: "then",
        revision: 10,
      },
      {
        id: "visible-edge",
        from: "artifact:focal",
        to: "artifact:warning",
        kind: "semantic",
        label: "creates risk",
        revision: 10,
      },
    ],
    delta: {
      sinceRevision: 9,
      addedObjects: [],
      updatedObjects: [],
      removedObjectIds: [],
      addedRelationships: [],
      removedRelationshipIds: [],
    },
    latestActivityAt: observedAt,
    activeTurnId: "turn-1",
    truncated: false,
  };
}

describe("projectCrokiPerceptionFrame", () => {
  it("shows an honest empty state before a Thread has source activity", () => {
    const scene = projectCrokiPerceptionFrame(
      frame([
        {
          ...object("thread:1", "thread", "Thread"),
          summary: "0 source events",
        },
      ]),
    );

    expect(scene.objects).toEqual([]);
  });

  it("projects a compact work model and collapses mechanical observations", () => {
    const scene = projectCrokiPerceptionFrame(
      frame([
        object("thread:1", "thread", "Improve Canvas"),
        object("activity:command-1", "runtime", "Ran command started"),
        object("activity:context-1", "context", "Context window updated"),
        object("checkpoint:1", "checkpoint", "Checkpoint captured"),
        object("artifact:old", "focal", "Old conclusion", {
          artifactRevision: 1,
          role: "focal",
        }),
        object("artifact:focal", "focal", "Canvas is too literal", {
          role: "focal",
        }),
        object("artifact:route", "route", "Compress observations", { role: "route" }),
        object("artifact:warning", "warning", "Needs Jacob's judgment", {
          role: "warning",
        }),
        object("artifact:evidence", "evidence", "Six activities inspected", {
          role: "evidence",
        }),
      ]),
    );

    expect(scene.objects.map(({ id }) => id)).toEqual([
      "thread:1",
      "artifact:focal",
      "artifact:route",
      "artifact:warning",
      "evidence:collapsed",
    ]);
    expect(scene.objects[0]).toMatchObject({ source: "outcome", authority: "Current task" });
    expect(scene.attentionIds).toEqual(["artifact:warning"]);
    expect(scene.edges).toEqual([
      expect.objectContaining({ from: "artifact:focal", to: "artifact:warning" }),
    ]);

    const collapsed = scene.objects.at(-1)?.perceptionObject;
    expect(collapsed?.data).toMatchObject({
      backingObjectIds: expect.arrayContaining([
        "activity:command-1",
        "activity:context-1",
        "checkpoint:1",
        "artifact:evidence",
        "artifact:old",
      ]),
    });
  });

  it("never invents conclusions from raw activity and limits semantic conclusions to three", () => {
    const conclusions = ["one", "two", "three", "four"].map((id) =>
      object(`artifact:${id}`, "route", id, { role: "route" }),
    );
    const scene = projectCrokiPerceptionFrame(
      frame([
        object("thread:1", "thread", "Current task"),
        ...conclusions,
        object("activity:command-1", "runtime", "Ran command started"),
      ]),
    );

    expect(scene.objects.filter((item) => item.kind === "route")).toHaveLength(3);
    expect(scene.objects.some((item) => item.title === "Ran command started")).toBe(false);
    expect(
      scene.edges.every(
        (edge) =>
          scene.objects.some((object) => object.id === edge.from) &&
          scene.objects.some((object) => object.id === edge.to),
      ),
    ).toBe(true);
  });
});
