import {
  CheckpointRef,
  ProjectId,
  ThreadId,
  TurnId,
  type CrokiProjectPerceptionSnapshot,
} from "@croki/contracts";
import { describe, expect, it } from "vite-plus/test";

import { buildCrokiProjectActivityPrompt } from "./CrokiProjectActivity.ts";

const currentThreadId = ThreadId.make("thread-current");
const otherThreadId = ThreadId.make("thread-other");

function snapshot(): CrokiProjectPerceptionSnapshot {
  return {
    projectId: ProjectId.make("project-1"),
    revision: 14,
    sourceRevision: 14,
    changed: true,
    latestActivityAt: "2026-08-05T15:00:00.000Z",
    sourceThreadIds: [currentThreadId, otherThreadId],
    activeTurnIds: [TurnId.make("turn-other")],
    truncated: false,
    stale: false,
    status: "ready",
    delta: {
      sinceRevision: 0,
      addedObjects: [],
      updatedObjects: [],
      removedObjectIds: [],
      addedRelationships: [],
      removedRelationshipIds: [],
    },
    relationships: [],
    objects: [
      threadObject(currentThreadId, "Current work", "turn-current", 14),
      checkpointObject(currentThreadId, "turn-current", ["apps/web/src/shared.tsx"], 14),
      threadObject(otherThreadId, "Improve project awareness", "turn-other", 13),
      checkpointObject(
        otherThreadId,
        "turn-other",
        ["apps/web/src/shared.tsx", "apps/server/src/context.ts"],
        13,
      ),
    ],
  };
}

describe("Croki project activity prompt", () => {
  it("shares bounded other-Thread facts and exact file overlap without transcript bodies", () => {
    const prompt = buildCrokiProjectActivityPrompt(snapshot(), currentThreadId);

    expect(prompt).toContain('<croki_project_activity version="1">');
    expect(prompt).toContain('"title":"Improve project awareness"');
    expect(prompt).toContain('"active":true');
    expect(prompt).toContain(
      '"overlappingFiles":[{"path":"apps/web/src/shared.tsx","otherThreadIds":["thread-other"]}]',
    );
    expect(prompt).not.toContain('"title":"Current work"');
    expect(prompt).not.toContain("message body");
  });

  it("stays absent when no other Thread exists", () => {
    const singleThreadSnapshot = snapshot();
    expect(
      buildCrokiProjectActivityPrompt(
        { ...singleThreadSnapshot, objects: singleThreadSnapshot.objects.slice(0, 2) },
        currentThreadId,
      ),
    ).toBeNull();
  });
});

function threadObject(threadId: ThreadId, title: string, turnId: string, revision: number) {
  return {
    id: `${threadId}:thread:${threadId}`,
    type: "thread",
    title,
    state: "running",
    revision,
    source: {
      kind: "thread",
      id: String(threadId),
      sourceThreadId: threadId,
      turnId,
      observedAt: `2026-08-05T14:00:0${revision % 10}.000Z`,
    },
    affordances: [],
    data: { branch: `work/${threadId}` },
  } as const;
}

function checkpointObject(
  threadId: ThreadId,
  turnId: string,
  paths: readonly string[],
  revision: number,
) {
  return {
    id: `${threadId}:checkpoint:${turnId}`,
    type: "checkpoint",
    title: "Checkpoint",
    state: "completed",
    revision,
    source: {
      kind: "checkpoint",
      id: String(CheckpointRef.make(`refs/t3/checkpoints/${threadId}/${turnId}/1`)),
      sourceThreadId: threadId,
      turnId,
      observedAt: `2026-08-05T14:00:0${revision % 10}.000Z`,
    },
    affordances: [],
    data: {
      files: paths.map((path) => ({ path, kind: "modified", additions: 1, deletions: 0 })),
    },
  } as const;
}
