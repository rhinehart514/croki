import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FirmSemanticModel } from "@/types";
import { ProductGtmNavigator } from "./ProductGtmNavigator";

const model: FirmSemanticModel = {
  schemaVersion: 3,
  ventureId: "venture-one",
  revision: 1,
  objects: [
    { id: "product", type: "product", name: "Drover", statement: "The Product", properties: { territory: "product" }, assertion: "founder-asserted" },
    { id: "outbound", type: "motion", name: "Founder-led outbound", statement: "Reach founders directly.", properties: {}, assertion: "founder-asserted" },
    { id: "proof-loop", type: "mechanism", name: "Proof loop", statement: "Reuse returned proof.", properties: { territory: "shared", workflowGraph: {
      steps: [{ id: "trigger", label: "Proof returns", type: "trigger" }, { id: "share", label: "Route proof", type: "agent-work" }],
      edges: [{ from: "trigger", to: "share" }],
    } }, assertion: "founder-asserted" },
  ],
  relationships: [], modelBranches: [], modelChanges: [], modelMergeReceipts: [], workScopes: [], outwardActions: [],
};

describe("ProductGtmNavigator", () => {
  it("keeps all three territories distinct while opening exact GTM paths in the same canvas", () => {
    const onFocus = vi.fn();
    render(<ProductGtmNavigator model={model} selectedRef={null} onFocus={onFocus} />);

    expect(screen.getByLabelText("Canvas territories")).toHaveTextContent("ProductSharedGTM");
    fireEvent.click(screen.getByLabelText("Browse GTM workflows and motions"));
    fireEvent.click(screen.getByRole("button", { name: "Founder-led outbound, Motion · workflow not mapped" }));

    expect(onFocus).toHaveBeenCalledWith("object:outbound");
  });

  it("puts an adopted workflow before motions without promoting System as founder vocabulary", () => {
    const onFocus = vi.fn();
    render(<ProductGtmNavigator model={model} selectedRef="object:proof-loop" onFocus={onFocus} />);

    fireEvent.click(screen.getByRole("button", { name: "Open Proof loop workflow" }));
    expect(onFocus).toHaveBeenCalledWith("object:proof-loop");
    fireEvent.click(screen.getByLabelText("Browse GTM workflows and motions"));
    expect(screen.getByRole("button", { name: "Proof loop, Workflow · 2 steps" })).toBeInTheDocument();
    expect(screen.queryByText("System")).not.toBeInTheDocument();
  });

  it("stays honest when no GTM path has been made current", () => {
    render(<ProductGtmNavigator model={{ ...model, objects: model.objects.slice(0, 1) }} selectedRef={null} onFocus={vi.fn()} />);

    fireEvent.click(screen.getByLabelText("Browse GTM workflows and motions"));
    expect(screen.getByText("No GTM workflow or motion is current yet.")).toBeInTheDocument();
  });

  it("includes a concrete GTM path when its mechanics are mapped", () => {
    const pipeline = {
      ...model,
      objects: [...model.objects, {
        id: "gtm-path", type: "pipeline", name: "Proof to referral", statement: "Turn proof into a warm introduction.",
        properties: { territory: "shared", workflowGraph: { steps: [{ id: "proof", label: "Proof returns", type: "trigger" }], edges: [] } },
        assertion: "founder-asserted" as const,
      }],
    };
    render(<ProductGtmNavigator model={pipeline} selectedRef={null} onFocus={vi.fn()} />);

    fireEvent.click(screen.getByLabelText("Browse GTM workflows and motions"));
    expect(screen.getByRole("button", { name: "Proof to referral, Workflow · 1 step" })).toBeInTheDocument();
  });
});
