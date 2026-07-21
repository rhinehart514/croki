import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkIndexOutline, WorkIndexOutlineObject } from "@/api";
import { VentureAgentWorkflow } from "./VentureAgentWorkflow";
import { VentureMaps } from "./VentureMaps";
import type { VentureGraph } from "./ventureMapModel";

const pipeline = {
  id: "pipeline", sectionId: "gtm", parentRef: null, name: "Buyer signal path", statement: "Turn a signal into evidence.",
  type: "pipeline", territory: "gtm", assertion: "founder-asserted", provenance: null, compatibilityOwned: false,
  architectureRole: null, threadRefs: [], targetable: true,
  details: { agentRefs: ["Yara"], tools: ["Browser"], capabilityAssignments: { agent: ["Browser"] } },
} satisfies WorkIndexOutlineObject;

const graph = {
  nodes: [{ object: pipeline, position: { x: 0, y: 0 }, connectionCount: 0 }], links: [],
  pipelines: [{ id: "pipeline", name: "Buyer signal path", summary: "", audience: "", trigger: "A buyer asks for help", value: "Produce an attributable reply", repeatability: "A reply or silence returns", nodeIds: ["pipeline"], position: { x: 0, y: 0 }, width: 1000, height: 300, signalCount: 0, campaignCount: 0, releaseCount: 0, outcomeCount: 0 }],
  pipelineCount: 1, gapCount: 0,
} satisfies VentureGraph;

function WorkflowHarness({ onAgentRemove, onCapabilityRemove }: { onAgentRemove: (agent: string, pipelineRef: string) => void; onCapabilityRemove: (capability: string, pipelineRef: string, step: "trigger" | "agent" | "gate" | "action" | "evidence") => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  return <VentureAgentWorkflow graph={graph} objects={[pipeline]} selectedId={selected} onSelect={setSelected} onAgentRemove={onAgentRemove} onCapabilityRemove={onCapabilityRemove} />;
}

describe("VentureAgentWorkflow", () => {
  it("makes assigned agents and capabilities directly reversible without duplicating capability detail", () => {
    const onAgentRemove = vi.fn();
    const onCapabilityRemove = vi.fn();
    render(<WorkflowHarness onAgentRemove={onAgentRemove} onCapabilityRemove={onCapabilityRemove} />);

    const agentStep = screen.getByRole("button", { name: /Agent workYara/ });
    expect(agentStep).toHaveTextContent("1 connected capability");
    expect(agentStep.textContent?.match(/Browser/g)).toHaveLength(1);
    fireEvent.click(agentStep);

    fireEvent.click(screen.getByRole("button", { name: "Remove agent Yara" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove capability Browser" }));
    expect(onAgentRemove).toHaveBeenCalledWith("Yara", "object:pipeline");
    expect(onCapabilityRemove).toHaveBeenCalledWith("Browser", "object:pipeline", "agent");
  });

  it("gives an empty canvas an explicit workflow creation action", () => {
    const onDeclareWorkflow = vi.fn();
    const outline = { architectureRevision: 0, objects: [], relationships: [], unplacedThreadRefs: [] } satisfies WorkIndexOutline;
    render(<VentureMaps outline={outline} directions={[]} view="gtm" onOpenDirection={vi.fn()} onOpenObject={vi.fn()} onDeclareWorkflow={onDeclareWorkflow} />);

    fireEvent.click(screen.getByRole("button", { name: "Create on canvas" }));
    expect(onDeclareWorkflow).toHaveBeenCalledWith([]);
  });

  it("renders an adopted conditional graph without flattening it into the five-step strip", () => {
    const conditionalPipeline = { ...pipeline, details: { ...pipeline.details, workflowGraph: {
      sourceWorkRef: "work:workflow-one", threadRef: "thread:workflow", steps: [
        { id: "ready", label: "Release ready", type: "trigger" },
        { id: "supported", label: "Claim supported?", type: "condition" },
        { id: "approve", label: "Approve exact send", type: "founder-gate" },
      ], edges: [{ from: "ready", to: "supported" }, { from: "supported", to: "approve", label: "yes" }],
    } } } satisfies WorkIndexOutlineObject;
    render(<VentureAgentWorkflow graph={graph} objects={[conditionalPipeline]} selectedId={null} onSelect={vi.fn()} onChat={vi.fn()} />);
    expect(screen.getByLabelText("Buyer signal path conditional workflow")).toBeInTheDocument();
    expect(screen.getByText("Claim supported?")).toBeInTheDocument();
    expect(screen.queryByText("Assign an agent")).not.toBeInTheDocument();
  });
});
