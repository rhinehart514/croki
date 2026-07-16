import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AtlasNode } from "./atlasTypes";
import { AtlasBetWorkflow } from "./AtlasBetWorkflow";

describe("AtlasBetWorkflow", () => {
  it("shows only supplied receipts, exact live presence, and a real campaign envelope", () => {
    const data = {
      bet: { workflowMeasurementWindow: "14 days" },
      workflow: [
        { id: "opened", label: "Opened", kind: "opened", state: "done" },
        { id: "running", label: "Read truth", kind: "event", state: "running", runningTeammateRef: "mira", since: "2026-07-15T14:01:30Z", durationMs: 24, costUsd: 0.17 },
        { id: "silent", label: "Founder note", kind: "staged", state: "done" },
      ],
      onFold: vi.fn(),
      onDive: vi.fn(),
    } as unknown as AtlasNode["data"];
    render(<AtlasBetWorkflow id="bet:one" data={data} />);
    expect(screen.getByText("Observation window · 14 days")).toBeInTheDocument();
    expect(screen.getByText(/mira here now/i)).toBeInTheDocument();
    expect(screen.getByText(/\$0\.17/)).toBeInTheDocument();
    expect(screen.getByText("Founder note").parentElement).toHaveTextContent("done");
    expect(screen.getAllByText(/here now/i)).toHaveLength(1);
  });

  it("keeps an exact running stage visible when a long workflow is summarized", () => {
    const workflow = Array.from({ length: 8 }, (_, index) => ({
      id: `stage-${index}`,
      label: `Recorded step ${index}`,
      kind: "event",
      state: index === 5 ? "running" as const : "done" as const,
      ...(index === 5 ? { runningTeammateRef: "mira" } : {}),
    }));
    const data = { workflow, onFold: vi.fn(), onDive: vi.fn() } as unknown as AtlasNode["data"];
    render(<AtlasBetWorkflow id="bet:one" data={data} />);
    expect(screen.getByText("Recorded step 5")).toBeInTheDocument();
    expect(screen.getByText(/mira here now/i)).toBeInTheDocument();
    expect(screen.getByText("4 more records")).toBeInTheDocument();
  });

  it("keeps gated staged work visible when a long workflow is summarized", () => {
    const workflow = Array.from({ length: 8 }, (_, index) => ({
      id: `stage-${index}`,
      label: index === 4 ? "Precise invitation" : `Recorded step ${index}`,
      kind: index === 4 ? "staged" as const : "event" as const,
      state: index === 4 ? "gate" as const : "done" as const,
    }));
    const data = { workflow, onFold: vi.fn(), onDive: vi.fn() } as unknown as AtlasNode["data"];
    render(<AtlasBetWorkflow id="bet:one" data={data} />);
    expect(screen.getByText("Precise invitation")).toBeInTheDocument();
    expect(screen.getByText("Precise invitation").parentElement).toHaveTextContent("Needs your hand");
  });
});
