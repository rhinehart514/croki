import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FirmSemanticModel, MarketMovementIndex } from "@/types";
import { ProductGtmNavigator } from "./ProductGtmNavigator";

// A play only reads as established when it has actually run: live work attached to its object id. This is
// the real market movement the derived register reads from, never the play's own blob.
const ran = (subjectId: string): MarketMovementIndex => ({
  ventureId: "venture-one", revision: 1, actions: [], modelBranches: [],
  liveWork: [{ id: "run", threadRef: "thread:run", activity: "running", subjectRefs: [`object:${subjectId}`] }],
});

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
    render(<ProductGtmNavigator model={model} movement={null} selectedRef={null} onFocus={onFocus} />);

    expect(screen.getByLabelText("Canvas territories")).toHaveTextContent("ProductSharedGTM");
    fireEvent.click(screen.getByLabelText("Browse GTM plays and motions"));
    fireEvent.click(screen.getByRole("button", { name: "Founder-led outbound, Motion · workflow not mapped" }));

    expect(onFocus).toHaveBeenCalledWith("object:outbound");
  });

  it("puts an adopted workflow before motions without promoting System as founder vocabulary", () => {
    const onFocus = vi.fn();
    render(<ProductGtmNavigator model={model} movement={ran("proof-loop")} selectedRef="object:proof-loop" onFocus={onFocus} />);

    // The dock already carries the selected play's identity, so the navigator must not restate it as a shortcut.
    expect(screen.queryByRole("button", { name: "Open Proof loop play" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Browse GTM plays and motions"));
    expect(screen.getByRole("button", { name: "Proof loop, Established play · 2 steps" })).toBeInTheDocument();
    expect(screen.queryByText("System")).not.toBeInTheDocument();
  });

  it("stays honest when no GTM path has been made current", () => {
    render(<ProductGtmNavigator model={{ ...model, objects: model.objects.slice(0, 1) }} movement={null} selectedRef={null} onFocus={vi.fn()} />);

    fireEvent.click(screen.getByLabelText("Browse GTM plays and motions"));
    expect(screen.getByText(/No GTM play is current yet/)).toBeInTheDocument();
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
    render(<ProductGtmNavigator model={pipeline} movement={ran("gtm-path")} selectedRef={null} onFocus={vi.fn()} />);

    fireEvent.click(screen.getByLabelText("Browse GTM plays and motions"));
    expect(screen.getByRole("button", { name: "Proof to referral, Established play · 1 step" })).toBeInTheDocument();
  });

  it("keeps drafted ambitious plays distinct and starts authoring in conversation", () => {
    const onDraftPlay = vi.fn();
    const drafted = {
      ...model,
      objects: [...model.objects, {
        id: "launch", type: "mechanism", name: "Category launch", statement: "Create category demand.",
        properties: { territory: "gtm", workflowGraph: { objective: "Create demand across a focused market", steps: [{ id: "listen", label: "Read market signals", type: "source" }], edges: [] } },
        assertion: "tentative" as const,
      }],
    };
    render(<ProductGtmNavigator model={drafted} movement={null} selectedRef={null} onFocus={vi.fn()} onDraftPlay={onDraftPlay} />);
    fireEvent.click(screen.getByLabelText("Browse GTM plays and motions"));
    expect(screen.getByRole("button", { name: "Category launch, Drafted play · 1 step" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Draft a play with an agent" }));
    expect(onDraftPlay).toHaveBeenCalledOnce();
  });
});
