import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SystemIndex } from "@/api";
import type { WorkflowSketch } from "@/components/work-mode/workflowSketch";
import { adoptedWorkflowVersions, adoptWorkflowSketch } from "./workflowAdoption";

const mutateSystem = vi.fn();
vi.mock("@/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/api")>()), mutateSystem: (...args: unknown[]) => mutateSystem(...args) }));

const index = (objects: SystemIndex["objects"] = []): SystemIndex => ({ ventureId: "v1", revision: 4, architectureRevision: 0, scope: "system", objects, relationships: [], counts: { total: objects.length, product: 0, gtm: objects.length, attention: 0, matchCount: objects.length } });
const sketch = (at = "2026-07-20T10:00:00.000Z"): WorkflowSketch => ({
  item: { kind: "artifact", id: "artifact:workflow", ref: "work:workflow-one", at, visual: { kind: "flow", ref: "work:workflow-one", threadRef: "thread:workflow", title: "Customer return loop" } },
  workRef: "work:workflow-one", workId: "workflow-one", betId: "loop", title: "Customer return loop",
  steps: [{ id: "ready", label: "Release ready", type: "trigger" }, { id: "approve", label: "Approve exact send", type: "founder-gate" }, { id: "reply", label: "Reply returned", type: "outcome" }],
  edges: [{ from: "ready", to: "approve" }, { from: "approve", to: "reply" }],
});

describe("workflow adoption", () => {
  beforeEach(() => mutateSystem.mockReset());

  it("turns the exact provisional artifact into one founder-authored pipeline graph", async () => {
    mutateSystem.mockResolvedValue({ systemIndex: index() });
    await adoptWorkflowSketch("v1", index(), sketch());
    const mutation = mutateSystem.mock.calls[0][2][0];
    expect(mutation.op).toBe("create-object");
    expect(mutation.type).toBe("pipeline");
    expect(mutation.properties.workflowGraph).toMatchObject({ sourceWorkRef: "work:workflow-one", threadRef: "thread:workflow" });
    expect(mutation.properties.workflowGraph.steps).toHaveLength(3);
  });

  it("opens an already-current adoption without writing again", async () => {
    const current = index([{ id: "workflow", objectRef: "object:workflow", name: "Customer return loop", statement: "", type: "pipeline", territory: "gtm", assertion: "founder-asserted", provenance: null, properties: { workflowGraph: { sourceWorkRef: "work:workflow-one", sourceUpdatedAt: "2026-07-20T10:00:00.000Z" } }, compatibilityOwned: false, architectureRole: null, threadRefs: ["thread:workflow"], attention: [], createdAt: null, updatedAt: null }]);
    const result = await adoptWorkflowSketch("v1", current, sketch());
    expect(result).toMatchObject({ objectRef: "object:workflow", changed: false });
    expect(mutateSystem).not.toHaveBeenCalled();
    expect(adoptedWorkflowVersions(current).get("work:workflow-one")).toBe("2026-07-20T10:00:00.000Z");
  });

  it("updates the same canonical workflow when conversation revises the staged graph", async () => {
    const existing = index([{ id: "workflow", objectRef: "object:workflow", name: "Customer return loop", statement: "", type: "pipeline", territory: "gtm", assertion: "founder-asserted", provenance: null, properties: { workflowGraph: { sourceWorkRef: "work:workflow-one", sourceUpdatedAt: "2026-07-20T10:00:00.000Z" } }, compatibilityOwned: false, architectureRole: null, threadRefs: ["thread:workflow"], attention: [], createdAt: null, updatedAt: null }]);
    mutateSystem.mockResolvedValue({ systemIndex: existing });
    await adoptWorkflowSketch("v1", existing, sketch("2026-07-20T11:00:00.000Z"));
    expect(mutateSystem.mock.calls[0][2][0]).toMatchObject({ op: "update-object", objectRef: "object:workflow" });
  });
});

