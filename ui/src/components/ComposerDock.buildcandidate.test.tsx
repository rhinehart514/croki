import { beforeAll, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ComposerDock } from "./ComposerDock";
import type { GTMNode, GTMEdge, OperatorSession } from "@/types";

// WI-C — building a founder-picked candidate opens its own pipeline thread. The tab-switch + roster
// refresh lives in App.tsx's resolveCandidatesAndSync (not unit-testable without the whole App), so this
// covers the CLIENT SEAM that feeds it: picking a candidate must route through `onBuildCandidate` (the
// authorized compose-to-gate entry point App wires to resolveOperatorCandidates), carrying the picked
// candidate — and building must NEVER release the gate (the WALL: a build composes and stops at the gate,
// it never sends).

beforeAll(() => {
  if (!("scrollTo" in Element.prototype)) {
    Object.defineProperty(Element.prototype, "scrollTo", { value: () => {}, writable: true });
  }
});

function node(id: string): GTMNode {
  return { id, kind: "agent", label: id, position: { x: 0, y: 0 } } as unknown as GTMNode;
}

function candidate(id: string, label: string) {
  return {
    id,
    label,
    rationale: `Why ${label}`,
    nodes: [node(`${id}-a`), node(`${id}-gate`)],
    edges: [{ id: `${id}-e`, source: `${id}-a`, target: `${id}-gate` }] as unknown as GTMEdge[],
  };
}

function candidateSession(): OperatorSession {
  return {
    id: "s-picking",
    goal: "get more owners",
    graphId: "scratch-picking",
    status: "waiting_for_ideas",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    schemaVersion: 1,
    model: "claude",
    stepCount: 2,
    maxSteps: 20,
    graphRevision: 1,
    events: [],
    pendingCandidates: {
      candidates: [candidate("cand-1", "Warm intro path"), candidate("cand-2", "Cold list path")],
    },
  } as unknown as OperatorSession;
}

describe("ComposerDock — build a picked candidate (WI-C client seam)", () => {
  it("keeps forming open when candidate choices are already waiting on the first render", () => {
    const { container } = render(
      <ComposerDock
        session={candidateSession()}
        running={false}
        altitude="forming"
        onSend={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(container.querySelector(".composer-dock")).not.toHaveClass("collapsed");
    expect(screen.getAllByRole("button", { name: /prepare path/i })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /open the conversation/i })).not.toBeInTheDocument();
  });

  it("collapses passive forming when there is no founder choice to make", () => {
    const passive = { ...candidateSession(), pendingCandidates: undefined } as unknown as OperatorSession;
    const { container } = render(
      <ComposerDock
        session={passive}
        running={false}
        altitude="forming"
        onSend={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(container.querySelector(".composer-dock")).toHaveClass("collapsed", "altitude-forming");
    expect(screen.getByRole("button", { name: /open the conversation/i })).toHaveClass("dock-rail-launcher");
    expect(screen.queryByRole("button", { name: /prepare path/i })).not.toBeInTheDocument();
  });

  it("routes the pick through onBuildCandidate with the chosen candidate (the authorized compose-to-gate entry)", () => {
    const onBuildCandidate = vi.fn();
    render(
      <ComposerDock
        session={candidateSession()}
        running={false}
        onSend={() => {}}
        onCancel={() => {}}
        onBuildCandidate={onBuildCandidate}
      />,
    );

    // Two shapes render; picking the first fires the authorized build path with that exact candidate.
    const buildButtons = screen.getAllByRole("button", { name: /prepare path/i });
    expect(buildButtons.length).toBe(2);
    fireEvent.click(buildButtons[0]);

    expect(onBuildCandidate).toHaveBeenCalledTimes(1);
    expect(onBuildCandidate.mock.calls[0][0]).toMatchObject({ id: "cand-1", label: "Warm intro path" });
  });

  it("does NOT release the gate on build — building composes to the gate, it never sends (the WALL)", () => {
    const onBuildCandidate = vi.fn();
    const onSubmitGateReview = vi.fn();
    render(
      <ComposerDock
        session={candidateSession()}
        running={false}
        onSend={() => {}}
        onCancel={() => {}}
        onBuildCandidate={onBuildCandidate}
        onSubmitGateReview={onSubmitGateReview}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: /prepare path/i })[0]);

    // The pick starts the build; nothing on this path may approve/release a gate.
    expect(onBuildCandidate).toHaveBeenCalledTimes(1);
    expect(onSubmitGateReview).not.toHaveBeenCalled();
  });

  it("falls back to a compose-and-run message (not a raw send) when no onBuildCandidate is wired", () => {
    const onSend = vi.fn();
    render(
      <ComposerDock
        session={candidateSession()}
        running={false}
        onSend={onSend}
        onCancel={() => {}}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: /prepare path/i })[0]);

    // The fallback still asks to compose and run TO THE GATE — never a shortcut that skips it.
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(String(onSend.mock.calls[0][0])).toMatch(/run it to my gate/i);
  });
});
