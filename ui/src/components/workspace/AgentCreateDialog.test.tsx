import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentCreateDialog } from "./AgentCreateDialog";
import type { FirmConfiguration } from "@/types";

const putFirmConfiguration = vi.fn();
vi.mock("@/api", () => ({ putFirmConfiguration: (...args: unknown[]) => putFirmConfiguration(...args) }));

const configuration: FirmConfiguration = {
  id: "firm", schemaVersion: 1, revision: 3,
  presentation: { participant: "specialist", participantLabel: "agent", collectiveLabel: "agents" },
  defaults: { runtime: null, model: null, maxSteps: 24 },
  organization: { shape: "flat", instructions: null, relationships: [] },
  coordination: { mode: "adaptive", coordinatorRef: null, protocols: [], stopWhen: [] },
  authority: { outwardEffects: "wall", configurationChanges: "founder" },
  agents: [],
};

describe("AgentCreateDialog", () => {
  beforeEach(() => putFirmConfiguration.mockReset());

  it("creates a visible, founder-directed specialist with bounded authority", async () => {
    const onCreated = vi.fn();
    putFirmConfiguration.mockImplementation(async (_ventureId, _revision, next: FirmConfiguration) => ({ configuration: next }));
    render(<AgentCreateDialog ventureId="buffalo-projects" configuration={configuration} readOnlyReason={null} onClose={vi.fn()} onCreated={onCreated} />);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Product Strategist" } });
    fireEvent.change(screen.getByLabelText("Purpose"), { target: { value: "Develop Buffalo's product mechanism from evidence." } });
    fireEvent.change(screen.getByLabelText("Runtime"), { target: { value: "claude-code" } });
    fireEvent.click(screen.getByRole("button", { name: "Create agent" }));

    expect(putFirmConfiguration).toHaveBeenCalledWith("buffalo-projects", 3, expect.objectContaining({
      agents: [expect.objectContaining({
        ref: "product-strategist",
        activation: "direct",
        perspective: "Develop Buffalo's product mechanism from evidence.",
        runtime: { provider: "claude-code", model: null },
        authority: { outwardEffects: "wall" },
      })],
    }), "Created Product Strategist");
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(
      expect.objectContaining({ ref: "product-strategist" }),
      expect.objectContaining({ agents: [expect.objectContaining({ ref: "product-strategist" })] }),
    ));
  });

  it("refuses a duplicate agent identifier", async () => {
    render(<AgentCreateDialog ventureId="buffalo-projects" configuration={{ ...configuration, agents: [{
      ref: "product-strategist", name: "Product strategist", label: null, perspective: null,
      activation: "direct", capabilities: { firmTools: true, additional: [] }, context: { scope: "venture", instructions: null },
      memory: { scope: "venture-soul", instructions: null }, runtime: { provider: "codex", model: null },
      budget: { maxSteps: null, dailySpendUsd: null }, authority: { outwardEffects: "wall" }, evaluation: { signals: [], instructions: null },
    }] }} readOnlyReason={null} onClose={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Product Strategist" } });
    fireEvent.change(screen.getByLabelText("Purpose"), { target: { value: "A different purpose" } });
    expect(screen.getByRole("alert")).toHaveTextContent("already exists");
    expect(screen.getByRole("button", { name: "Create agent" })).toBeDisabled();
  });
});
