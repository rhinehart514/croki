import { describe, expect, it } from "vite-plus/test";

import type { OrchestrationThreadActivity } from "@croki/contracts";
import {
  appendCanvasSelectionToPrompt,
  deriveCanvasPresentationActivities,
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
      "Converge on this route.\n\nCanvas selection\n- Thread-scoped visual\n  Keep the visual attached to the decision that produced it.\n  Why it matters: It avoids a second project-management surface.",
    );
  });
});
