import { EventId, type OrchestrationThreadActivity } from "@croki/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { CoordinationWorkstreams } from "./CoordinationWorkstreams";

function activity(kind: string, payload: Record<string, unknown>): OrchestrationThreadActivity {
  return {
    id: EventId.make(`${kind}-${payload.taskId ?? "task"}`),
    createdAt: "2026-08-02T00:00:00.000Z",
    kind,
    summary: kind,
    tone: kind === "task.completed" && payload.status === "failed" ? "error" : "info",
    payload,
    turnId: null,
  };
}

describe("CoordinationWorkstreams", () => {
  it("does not add coordination chrome to an ordinary turn", () => {
    expect(renderToStaticMarkup(<CoordinationWorkstreams activities={[]} />)).toBe("");
  });

  it("renders a compact native workstream summary with expandable metadata", () => {
    const markup = renderToStaticMarkup(
      <CoordinationWorkstreams
        activities={[
          activity("task.started", {
            taskId: "worker-a",
            description: "Repair release packaging",
            actor: { id: "worker-a", label: "Packaging", model: "sol", reasoning: "high" },
            ownership: { files: ["release.ts"], areas: ["desktop"] },
          }),
          activity("task.completed", {
            taskId: "worker-a",
            status: "failed",
            summary: "Installer command failed",
          }),
        ]}
      />,
    );

    expect(markup).toContain('aria-label="Workstreams"');
    expect(markup).toContain("Repair release packaging");
    expect(markup).toContain("Failed");
    expect(markup).toContain("1 failed");
    expect(markup).not.toContain("animate-");
    expect(markup).not.toContain("rounded-full");
  });
});
