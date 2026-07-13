import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ComposerDock } from "./ComposerDock";
import type { OperatorSession, OperatorSessionSummary } from "@/types";

beforeAll(() => {
  if (!("scrollTo" in Element.prototype)) {
    Object.defineProperty(Element.prototype, "scrollTo", { value: () => {}, writable: true });
  }
});

const session = {
  id: "s1",
  goal: "Clarify the first customer",
  graphId: "g1",
  projectId: "p1",
  status: "running",
  createdAt: "2026-07-13T10:00:00.000Z",
  updatedAt: "2026-07-13T10:00:00.000Z",
  summary: null,
  error: null,
  schemaVersion: 1,
  model: "claude",
  stepCount: 1,
  maxSteps: 20,
  graphRevision: 1,
  events: [],
} as unknown as OperatorSession;

const roster = [session as unknown as OperatorSessionSummary, {
  ...session,
  id: "s2",
  goal: "Try another audience",
  status: "waiting_for_gate",
} as unknown as OperatorSessionSummary];

describe("ComposerDock embedded conversation", () => {
  it("renders one active thread inside the workspace rail without another session navigator", () => {
    const onBackToWorkspace = vi.fn();
    const { container } = render(
      <ComposerDock
        session={session}
        running={false}
        onSend={() => {}}
        onCancel={() => {}}
        onReviewGate={() => {}}
        roster={roster}
        embedded
        onBackToWorkspace={onBackToWorkspace}
      />,
    );

    expect(container.querySelector(".composer-dock")).toHaveClass("embedded");
    expect(screen.getByRole("log", { name: "Conversation with your crew" })).toBeInTheDocument();
    expect(screen.queryByRole("tablist", { name: "Your pipelines" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Back to workspace" }));
    expect(onBackToWorkspace).toHaveBeenCalledOnce();
  });
});
