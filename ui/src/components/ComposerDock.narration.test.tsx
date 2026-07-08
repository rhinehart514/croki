import { beforeAll, describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ComposerDock } from "./ComposerDock";
import type { AgentBenchRow } from "@/api";
import type { OperatorEvent, OperatorSession } from "@/types";

// Two teammate heartbeats from DIFFERENT teammates while a run is live. The regression this guards: each
// beat's face + name + role resolve PER MESSAGE from its own ref (not the single session voice), so a
// stream of beats reads as one teammate handing off to the next.

function benchRow(ref: string, job: string, name: string): AgentBenchRow {
  return { ref, job, name, hasRuns: false, runCount: 0, counts: { approved: 0, rejected: 0, edits: 0 }, note: null };
}

const bench: AgentBenchRow[] = [
  benchRow("prospect-researcher", "buyer research", "Nadia"),
  benchRow("outreach-writer", "drafting", "Maya"),
];

function beat(id: string, ref: string, phase: string, title: string, itemCount?: number): OperatorEvent {
  return {
    id,
    createdAt: new Date().toISOString(),
    type: "teammate_said",
    title,
    data: { ref, nodeId: `n-${id}`, phase, ...(itemCount != null ? { itemCount } : {}) },
  };
}

const session = {
  id: "s1",
  goal: "get more owners",
  graphId: "g1",
  status: "running",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  schemaVersion: 1,
  model: "claude",
  stepCount: 2,
  maxSteps: 20,
  graphRevision: 1,
  events: [
    beat("b1", "prospect-researcher", "start", "On it — research the buyers."),
    beat("b2", "outreach-writer", "done", "Drafted 4 for your review.", 4),
  ],
} as unknown as OperatorSession;

// jsdom doesn't implement Element.scrollTo, which the dock calls to keep the thread pinned to newest.
beforeAll(() => {
  if (!("scrollTo" in Element.prototype)) {
    Object.defineProperty(Element.prototype, "scrollTo", { value: () => {}, writable: true });
  }
});

describe("ComposerDock — per-teammate narration", () => {
  it("renders each beat with its OWN teammate face, name, and role (per-message voice)", () => {
    render(
      <ComposerDock
        session={session}
        running={true}
        bench={bench}
        onSend={() => {}}
        onCancel={() => {}}
        onReviewGate={() => {}}
      />,
    );

    // Both teammates' founder-chosen names render — proof the two beats resolve to two distinct voices,
    // not one shared session voice.
    expect(screen.getByText("Nadia")).toBeTruthy();
    expect(screen.getByText("Maya")).toBeTruthy();

    // Both derived roles render alongside the names.
    expect(screen.getByText("Prospect Researcher")).toBeTruthy();
    expect(screen.getByText("Outreach Writer")).toBeTruthy();

    // The done beat's first-person line, with its count, is on screen (also echoed by the live "now"
    // orb, which mirrors the latest title — so at least one, not exactly one).
    expect(screen.getAllByText("Drafted 4 for your review.").length).toBeGreaterThanOrEqual(1);
  });
});
