import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WallQueueItemView } from "@/api";
import { DiveGateInspector } from "./DiveGateInspector";

function item(effect: Record<string, unknown>): WallQueueItemView {
  return {
    id: "wall-1",
    ventureId: "venture-1",
    betId: "bet-1",
    purpose: "release",
    blocksBet: true,
    effect,
    parkedAt: "2026-07-15T14:03:00Z",
    decision: null,
  };
}

function renderInspector(effect: Record<string, unknown>) {
  return render(<DiveGateInspector item={item(effect)} onClose={vi.fn()} onReview={vi.fn()} onHold={vi.fn()} />);
}

describe("DiveGateInspector consequence gaps", () => {
  it("requires the provider-verified fromAddress for message effects", () => {
    const first = renderInspector({
      kind: "message",
      from: "claimed@example.net",
      sender: "Claimed sender",
      to: "buyer@example.com",
      body: "Hello",
      costUsd: 0.01,
      reversible: false,
    });
    expect(screen.getByText("Verified sender address was not supplied by this outward act.")).toBeInTheDocument();
    first.unmount();

    renderInspector({
      kind: "send",
      fromAddress: "founder@example.com",
      to: "buyer@example.com",
      body: "Hello",
      costUsd: 0.01,
      reversible: false,
    });
    expect(screen.queryByText("Verified sender address was not supplied by this outward act.")).not.toBeInTheDocument();
  });

  it("requires destination, not sender identity, for product-change and deploy effects", () => {
    const product = renderInspector({
      kind: "product-change",
      destination: "dogfood/example at abc123",
      diff: "+after",
      reversible: true,
    });
    expect(screen.queryByText("Verified sender address was not supplied by this outward act.")).not.toBeInTheDocument();
    expect(screen.queryByText("Destination was not supplied by this outward act.")).not.toBeInTheDocument();
    expect(screen.getByText("Run cost was not supplied by this outward act.")).toBeInTheDocument();
    product.unmount();

    renderInspector({ kind: "deploy", body: "Deploy reviewed build", costUsd: 1.25, reversible: false });
    expect(screen.getByText("Destination was not supplied by this outward act.")).toBeInTheDocument();
    expect(screen.queryByText("Verified sender address was not supplied by this outward act.")).not.toBeInTheDocument();
  });

  it("keeps cost and reversibility as independent honest gaps", () => {
    renderInspector({
      kind: "message",
      fromAddress: "founder@example.com",
      to: "buyer@example.com",
      body: "Hello",
    });
    expect(screen.getByText("Run cost was not supplied by this outward act.")).toBeInTheDocument();
    expect(screen.getByText("Reversibility was not supplied by this outward act.")).toBeInTheDocument();
    expect(screen.queryByText("Verified sender address was not supplied by this outward act.")).not.toBeInTheDocument();
  });
});
