import { ProjectId, ThreadId } from "@croki/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { CrokiPerceptionObject, CrokiProjectPerceptionSnapshot } from "./crokiPerception.ts";
import {
  buildCrokiApplicationProgressPrompt,
  deriveCrokiApplicationProgress,
  type CrokiApplicationProgress,
} from "./crokiApplicationProgress.ts";

const application = {
  version: 1 as const,
  application: { name: "Croki" },
  released: { version: "0.4.5" },
  building: { version: "0.4.6" },
};

const sourceThreadId = ThreadId.make("thread-1");

function object(
  id: string,
  sourceKind: string,
  state: string,
  revision: number,
  title = id,
): CrokiPerceptionObject {
  return {
    id,
    type: sourceKind,
    title,
    summary: `${title} summary`,
    state,
    revision,
    source: {
      kind: sourceKind,
      id,
      sourceThreadId,
      turnId: "turn-1",
      observedAt: `2026-08-04T00:00:${String(revision).padStart(2, "0")}.000Z`,
    },
    affordances: [],
  };
}

function snapshot(objects: readonly CrokiPerceptionObject[]): CrokiProjectPerceptionSnapshot {
  return {
    projectId: ProjectId.make("project-1"),
    revision: 20,
    sourceRevision: 20,
    changed: true,
    objects,
    relationships: [],
    delta: {
      sinceRevision: 0,
      addedObjects: objects,
      updatedObjects: [],
      removedObjectIds: [],
      addedRelationships: [],
      removedRelationshipIds: [],
    },
    latestActivityAt: "2026-08-04T00:00:20.000Z",
    sourceThreadIds: [sourceThreadId],
    activeTurnIds: [],
    truncated: false,
    stale: false,
    status: "ready",
  };
}

describe("Croki application progress", () => {
  it("classifies source states conservatively and keeps Thread provenance", () => {
    const progress = deriveCrokiApplicationProgress(
      application,
      snapshot([
        object("runtime-success", "runtime", "success", 4),
        {
          ...object("evidence-observed", "customer-call", "observed", 3),
          data: { domain: "customer", evidenceType: "interview", sourceLabel: "Interview" },
        },
        object("review-failed", "review", "failed", 2),
        object("thread-wrapper", "thread", "idle", 9),
        object("turn-wrapper", "turn", "completed", 8),
        object("canvas-projection", "canvas", "observed", 7),
        object("agent-running", "agent", "running", 6),
      ]),
    );

    expect(progress.observations.map((observation) => [observation.id, observation.state])).toEqual(
      [
        ["runtime-success", "verified"],
        ["evidence-observed", "reported"],
        ["review-failed", "invalidated"],
      ],
    );
    expect(progress.observations[0]?.source.sourceThreadId).toBe(sourceThreadId);
    expect(progress.observations[0]?.source.observedAt).toContain("00:00:04");
  });

  it("limits observations deterministically and reports source truncation", () => {
    const progress = deriveCrokiApplicationProgress(
      application,
      snapshot(
        Array.from({ length: 10 }, (_, index) =>
          object(`runtime-${index}`, "runtime", "success", index + 1),
        ),
      ),
    );

    expect(progress.observations).toHaveLength(8);
    expect(progress.observations.map(({ id }) => id)).toEqual([
      "runtime-9",
      "runtime-8",
      "runtime-7",
      "runtime-6",
      "runtime-5",
      "runtime-4",
      "runtime-3",
      "runtime-2",
    ]);
    expect(progress.truncated).toBe(true);
    expect(buildCrokiApplicationProgressPrompt(progress)).toContain("truncated");
  });

  it("labels derived evidence as non-authoritative provider context", () => {
    const progress = deriveCrokiApplicationProgress(
      application,
      snapshot([object("checkpoint-1", "checkpoint", "completed", 1, "Checkpoint captured")]),
    );
    const prompt = buildCrokiApplicationProgressPrompt(progress);

    expect(prompt).toContain('<croki_application_progress version="1"');
    expect(prompt).toContain("bounded, read-only evidence");
    expect(prompt).toContain("not founder-approved application facts");
    expect(prompt).toContain("Checkpoint captured");
    expect(prompt).toContain(String(sourceThreadId));
    expect(prompt?.length).toBeLessThanOrEqual(6_000);
  });

  it("keeps adapter evidence content-safe and orders across Threads by observation time", () => {
    const olderRuntime = object("older-runtime", "runtime", "success", 99);
    const olderHighRevision = {
      ...olderRuntime,
      source: { ...olderRuntime.source, observedAt: "2026-08-03T00:00:00.000Z" },
    } satisfies CrokiPerceptionObject;
    const adapterEvidence: CrokiPerceptionObject = {
      ...object("evidence:call-1", "customer-call", "observed", 1, "Private transcript title"),
      type: "interview",
      summary: "Customer disclosed a private secret in this transcript.",
      source: {
        kind: "customer-call",
        id: "call-1",
        sourceThreadId: ThreadId.make("thread-2"),
        turnId: "turn-2",
        observedAt: "2026-08-04T00:00:00.000Z",
      },
      data: {
        domain: "customer",
        evidenceType: "interview",
        sourceLabel: "Research interview",
      },
    };

    const progress = deriveCrokiApplicationProgress(
      application,
      snapshot([olderHighRevision, adapterEvidence]),
    );
    const prompt = buildCrokiApplicationProgressPrompt(progress);

    expect(progress.observations[0]).toMatchObject({
      id: "evidence:call-1",
      state: "reported",
      summary: "Customer evidence observed",
    });
    expect(prompt).not.toContain("Private transcript");
    expect(prompt).not.toContain("private secret");
  });

  it("returns an honest empty progress snapshot without provider prompt", () => {
    const progress = deriveCrokiApplicationProgress(application, snapshot([]));

    expect(progress).toMatchObject<CrokiApplicationProgress>({
      applicationName: "Croki",
      releasedVersion: "0.4.5",
      buildingVersion: "0.4.6",
      projectId: ProjectId.make("project-1"),
      sourceRevision: 20,
      latestActivityAt: "2026-08-04T00:00:20.000Z",
      observations: [],
      truncated: false,
    });
    expect(buildCrokiApplicationProgressPrompt(progress)).toBeNull();
  });
});
