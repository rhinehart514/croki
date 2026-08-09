import { describe, expect, it } from "vite-plus/test";

import { CheckpointRef, TurnId, type OrchestrationThreadActivity } from "@croki/contracts";
import {
  appendCanvasSelectionToPrompt,
  appendCrokiPerceptionFocusToPrompt,
  deriveCanvasPerceptionFrame,
  deriveCanvasPresentationActivities,
  parseCrokiSenseActivity,
  parseCanvasPresentationActivity,
} from "./canvasThreadIntegration";

const artifact = {
  id: "artifact-1",
  revision: 2,
  threadId: "thread-1",
  turnId: "turn-1",
  harnessId: "product-v1",
  presentation: "compare",
  question: "Which route should Croki take?",
  nodes: [
    {
      id: "route-a",
      role: "route",
      title: "Thread-scoped visual",
      body: "Keep the visual attached to the decision that produced it.",
      whyItMatters: "It avoids a second project-management surface.",
    },
  ],
  edges: [],
  createdAt: "2026-08-02T12:00:00.000Z",
} as const;

function activity(overrides: Record<string, unknown> = {}): OrchestrationThreadActivity {
  return {
    id: "activity-1" as OrchestrationThreadActivity["id"],
    kind: "croki.canvas.presented" as OrchestrationThreadActivity["kind"],
    tone: "info",
    summary: "Canvas visual ready · 1 item",
    payload: { artifact },
    turnId: "turn-1" as OrchestrationThreadActivity["turnId"],
    createdAt: "2026-08-02T12:00:00.000Z",
    ...overrides,
  } as OrchestrationThreadActivity;
}

describe("Canvas thread integration", () => {
  it("parses a bounded artifact activity without exposing provider payloads", () => {
    const parsed = parseCanvasPresentationActivity(activity());
    expect(parsed?.artifact?.id).toBe("artifact-1");
    expect(parsed?.artifact?.nodes[0]?.title).toBe("Thread-scoped visual");
  });

  it("orders presentation activities by immutable revision", () => {
    const activities = deriveCanvasPresentationActivities([
      activity({
        id: "activity-2" as OrchestrationThreadActivity["id"],
        payload: { artifact: { ...artifact, id: "artifact-2", revision: 3 } },
      }),
      activity(),
    ]);
    expect(activities.map((entry) => entry.artifact?.revision)).toEqual([2, 3]);
  });

  it("keeps Canvas selection visible only when composing the sent prompt", () => {
    expect(appendCanvasSelectionToPrompt("Converge on this route.", [artifact.nodes[0]!])).toBe(
      "Converge on this route.\n\nView selection\n- Thread-scoped visual\n  Keep the visual attached to the decision that produced it.\n  Why it matters: It avoids a second project-management surface.",
    );
  });

  it("projects ordinary Thread activity into a live source frame", () => {
    const activities = [
      activity({
        id: "tool-1" as OrchestrationThreadActivity["id"],
        kind: "tool.completed",
        summary: "Preview browser check",
        payload: {
          itemType: "browser_preview",
          title: "Preview browser check",
          detail: "Captured the onboarding screen",
          frame: { url: "http://localhost:4173/onboarding", width: 960, height: 640 },
          data: { screenshot: "large" },
        },
      }),
      activity({
        id: "approval-1" as OrchestrationThreadActivity["id"],
        kind: "approval.requested",
        tone: "approval",
        summary: "File-change approval requested",
        payload: { requestId: "request-1", requestKind: "file-change" },
      }),
      activity({
        id: "error-1" as OrchestrationThreadActivity["id"],
        kind: "runtime.error",
        tone: "error",
        summary: "Preview failed",
        payload: { message: "The preview process exited." },
      }),
    ];
    const frame = deriveCanvasPerceptionFrame({
      threadId: "thread-1",
      activities,
      checkpoints: [
        {
          turnId: TurnId.make("turn-1"),
          checkpointTurnCount: 1,
          checkpointRef: CheckpointRef.make("checkpoint-1"),
          status: "ready",
          files: [{ path: "apps/web/src/App.tsx", kind: "modified", additions: 4, deletions: 1 }],
          assistantMessageId: null,
          completedAt: "2026-08-02T12:01:00.000Z",
        },
      ],
      activeTurnId: "turn-1",
    });

    expect(frame.threadId).toBe("thread-1");
    expect(frame.objects.some((object) => object.type === "preview")).toBe(true);
    expect(frame.objects.some((object) => object.type === "approval")).toBe(true);
    expect(frame.objects.some((object) => object.type === "error")).toBe(true);
    expect(frame.objects.some((object) => object.type === "checkpoint")).toBe(true);
    expect(frame.frame?.kind).toBe("url");
    expect(frame.relationships.some((relationship) => relationship.kind === "contains")).toBe(true);
  });

  it("keeps checked-screen attachment frames inspectable", () => {
    const frame = deriveCanvasPerceptionFrame({
      threadId: "thread-1",
      activities: [
        activity({
          id: "checked-screen-1" as OrchestrationThreadActivity["id"],
          kind: "preview.snapshot",
          summary: "Checked Settings",
          payload: {
            frame: {
              kind: "attachment",
              ref: "thread-1-00000000-0000-4000-8000-000000000001",
              mimeType: "image/png",
              width: 1_280,
              height: 800,
            },
          },
        }),
      ],
      checkpoints: [],
      activeTurnId: "turn-1",
    });

    expect(frame.frame).toMatchObject({
      kind: "attachment",
      ref: "thread-1-00000000-0000-4000-8000-000000000001",
    });
  });

  it("parses a sense observation while preserving compact receipts", () => {
    const senseActivity = activity({
      id: "sense-1" as OrchestrationThreadActivity["id"],
      kind: "croki.sense.observed",
      payload: {
        version: 1,
        operation: "observe",
        observedRevision: 7,
        objectIds: ["activity:tool-1"],
        observation: {
          threadId: "thread-1",
          revision: 7,
          sourceRevision: 7,
          objects: [
            {
              id: "attention:stream",
              type: "attention",
              title: "Live attention",
              revision: 7,
              source: {
                kind: "sense",
                id: "attention:stream",
                turnId: null,
                observedAt: artifact.createdAt,
              },
              affordances: [
                {
                  id: "inspect",
                  kind: "inspect",
                  label: "Inspect",
                  authority: "read",
                  reversible: true,
                  requiresApproval: false,
                },
              ],
            },
          ],
          relationships: [],
        },
      },
    });
    const parsed = parseCrokiSenseActivity(senseActivity);
    expect(parsed?.operation).toBe("observe");
    expect(parsed?.observedRevision).toBe(7);
    expect(parsed?.observation?.objects[0]?.id).toBe("attention:stream");

    const receipt = parseCrokiSenseActivity(
      activity({
        id: "sense-receipt" as OrchestrationThreadActivity["id"],
        kind: "croki.sense.observed",
        payload: { operation: "inspect", observedRevision: 8, objectIds: ["activity:tool-1"] },
      }),
    );
    expect(receipt?.observation).toBeNull();
    expect(receipt?.objectIds).toEqual(["activity:tool-1"]);
  });

  it("can disable legacy selection text when native perception ids are available", () => {
    expect(
      appendCanvasSelectionToPrompt("Inspect this", [artifact.nodes[0]!], {
        includeLegacySerialization: false,
      }),
    ).toBe("Inspect this");
  });

  it("passes stable perception ids instead of serializing sensed bodies", () => {
    const frame = deriveCanvasPerceptionFrame({
      threadId: "thread-1",
      activities: [
        activity({
          id: "sense-tool" as OrchestrationThreadActivity["id"],
          kind: "tool.completed",
          summary: "Run tests",
          payload: { detail: "provider-private output", data: { secret: "omit" } },
        }),
      ],
    });
    const object = frame.objects.find((candidate) => candidate.id === "activity:sense-tool");
    expect(object).toBeDefined();
    const focused = appendCrokiPerceptionFocusToPrompt("Inspect this", [object!.id], frame);
    expect(focused).toContain("Croki perception focus");
    expect(focused).toContain(object!.id);
    expect(focused).toContain(object!.title);
    expect(focused).not.toContain("provider-private output");
    expect(focused).not.toContain("secret");
  });
});
