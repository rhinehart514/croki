import { beforeAll, describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ComposerDock } from "./ComposerDock";
import type { OperatorEvent, OperatorSession } from "@/types";

// WI-5 — the tool trace reads as real actions. Consecutive tool events coalesce into one "N steps"
// cluster; expanded, each step shows a per-category verb ("Read", "Drafted") read ONLY off the
// sanitized data.category (never a prompt/config). A failed step shows the X and the header fail dot.

function toolEvent(id: string, type: string, title: string, category?: string): OperatorEvent {
  return {
    id,
    createdAt: new Date().toISOString(),
    type,
    title,
    data: category ? { category, nodeId: `n-${id}` } : { nodeId: `n-${id}` },
  };
}

function sessionWith(events: OperatorEvent[]): OperatorSession {
  return {
    id: "s1",
    goal: "get more owners",
    graphId: "g1",
    status: "running",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    schemaVersion: 1,
    model: "claude",
    stepCount: events.length,
    maxSteps: 20,
    graphRevision: 1,
    events,
  } as unknown as OperatorSession;
}

// jsdom doesn't implement Element.scrollTo, which the dock calls to keep the thread pinned to newest.
beforeAll(() => {
  if (!("scrollTo" in Element.prototype)) {
    Object.defineProperty(Element.prototype, "scrollTo", { value: () => {}, writable: true });
  }
});

function renderDock(session: OperatorSession) {
  return render(
    <ComposerDock
      session={session}
      running={true}
      bench={[]}
      onSend={() => {}}
      onCancel={() => {}}
      onReviewGate={() => {}}
    />,
  );
}

describe("ComposerDock — the tool cluster (WI-5)", () => {
  it("coalesces consecutive tool steps and shows per-category verbs when expanded", () => {
    const { container } = renderDock(
      sessionWith([
        toolEvent("t1", "operator_node_start", "your product", "source"),
        toolEvent("t2", "operator_node_start", "4 leads", "generate"),
      ]),
    );

    // Two tool events coalesce into one "2 steps" cluster.
    expect(screen.getByText("2 steps")).toBeTruthy();

    // Expand the disclosure.
    fireEvent.click(screen.getByRole("button", { name: /2 steps/ }));

    // Each step wears its plain-word verb-face (source→Read, generate→Drafted), scoped to the list so
    // the collapsed peek line doesn't double-count.
    const list = container.querySelector(".oc-steps-list")!;
    const verbs = Array.from(list.querySelectorAll(".oc-step-kind")).map((n) => n.textContent);
    expect(verbs).toEqual(["Read", "Drafted"]);
    const titles = Array.from(list.querySelectorAll(".oc-step-title")).map((n) => n.textContent);
    expect(titles).toEqual(["Readyour product", "Drafted4 leads"]);
  });

  it("renders the fail node + fail header dot when a step failed", () => {
    const { container } = renderDock(
      sessionWith([
        toolEvent("t1", "operator_node_start", "your product", "source"),
        toolEvent("t2", "tool_failed", "enrich failed", "enrich"),
      ]),
    );

    // The collapsed cluster header dot flags the failure.
    expect(container.querySelector(".oc-steps-dot.fail")).toBeTruthy();

    // Expanded, the failed step carries the X node.
    fireEvent.click(screen.getByRole("button", { name: /2 steps/ }));
    expect(container.querySelector(".oc-step-node.fail")).toBeTruthy();
  });
});
