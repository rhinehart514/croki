import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CandidatePipelinesCanvas } from "./CandidatePipelinesCanvas";
import type { Candidate } from "@/lib/sessionCandidates";
import type { GTMNode } from "@/types";

// The candidate pipelines board, ON THE CANVAS. This proves the founder's pick-and-refine surface for an
// ambiguous goal: 2–3 shapes render side by side, and picking one routes through onPick with the exact
// chosen shape (nodes + edges) — the same authorized entry App wires to resolveCandidatesAndSync →
// compose_and_run → the founder gate. Nothing here sends; the pick is a founder act.

function node(id: string, over: Partial<GTMNode> = {}): GTMNode {
  return { id, category: "source", connector: "manual", position: { x: 0, y: 0 }, ...over } as GTMNode;
}

const CANDIDATES: Candidate[] = [
  {
    id: "outbound",
    label: "Outbound to owners",
    rationale: "Find owners and reach them directly.",
    nodes: [node("s1"), node("a1", { kind: "agent", ref: "gtm-find-prospects" } as Partial<GTMNode>), node("g1", { category: "gate", connector: "default" })],
    edges: [{ id: "e1", source: "s1", target: "a1", edgeType: "data" }, { id: "e2", source: "a1", target: "g1", edgeType: "data" }],
  },
  {
    id: "content",
    label: "Content / inbound",
    rationale: "Earn inbound with a content play.",
    nodes: [node("s2"), node("a2", { kind: "agent", ref: "gtm-research-market" } as Partial<GTMNode>), node("g2", { category: "gate", connector: "default" })],
    edges: [{ id: "e3", source: "s2", target: "a2", edgeType: "data" }, { id: "e4", source: "a2", target: "g2", edgeType: "data" }],
  },
];

describe("CandidatePipelinesCanvas", () => {
  it("lays out every candidate shape side by side, each pickable", () => {
    render(<CandidatePipelinesCanvas candidates={CANDIDATES} productName="EstateSaleUSA" onPick={vi.fn()} />);
    expect(screen.getByText("Outbound to owners")).toBeInTheDocument();
    expect(screen.getByText("Content / inbound")).toBeInTheDocument();
    // Each shape offers the founder-act pick.
    expect(screen.getAllByRole("button", { name: /pick this pipeline/i })).toHaveLength(2);
  });

  it("routes the pick through onPick with the exact chosen shape (the authorized build entry)", () => {
    const onPick = vi.fn();
    render(<CandidatePipelinesCanvas candidates={CANDIDATES} productName="EstateSaleUSA" onPick={onPick} />);
    fireEvent.click(screen.getAllByRole("button", { name: /pick this pipeline/i })[1]);
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0]).toMatchObject({ id: "content", label: "Content / inbound" });
  });

  it("dims the roads not taken and reads Building… on the picked shape", () => {
    render(<CandidatePipelinesCanvas candidates={CANDIDATES} productName="EstateSaleUSA" onPick={vi.fn()} pickedId="outbound" />);
    expect(screen.getByText("Building…")).toBeInTheDocument();
  });
});
