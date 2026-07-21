import { describe, expect, it } from "vitest";
import type { ThreadTimeline } from "@/api";
import { workflowSketchFromTimeline } from "./workflowSketch";

describe("workflowSketchFromTimeline", () => {
  it("selects the latest Product / GTM flow and preserves canonical and tool work identities", () => {
    const timeline = { items: [
      { kind: "artifact", id: "plain", ref: "work:plain", artifact: { id: "plain", content: { kind: "flow", steps: [], edges: [] } } },
      { kind: "artifact", id: "workflow", ref: "work:workflow-one", title: "Customer return loop", betRef: "bet:loop", at: "2026-07-20T10:00:00.000Z", artifact: { id: "workflow-one", content: { kind: "flow", purpose: "product-gtm-workflow", steps: [{ id: "signal", label: "Release ready", type: "trigger" }, { id: "observe", label: "Observe replies", type: "observation" }], edges: [{ from: "signal", to: "observe", label: "after approval" }] } } },
    ] } as unknown as ThreadTimeline;
    const sketch = workflowSketchFromTimeline(timeline);
    expect(sketch?.workRef).toBe("work:workflow-one");
    expect(sketch?.workId).toBe("workflow-one");
    expect(sketch?.betId).toBe("loop");
    expect(sketch?.steps).toHaveLength(2);
  });
});

