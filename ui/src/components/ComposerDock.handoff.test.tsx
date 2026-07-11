import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ComposerDock } from "./ComposerDock";
import type { OperatorSession } from "@/types";

beforeAll(() => {
  if (!("scrollTo" in Element.prototype)) {
    Object.defineProperty(Element.prototype, "scrollTo", { value: () => {}, writable: true });
  }
});

beforeEach(() => localStorage.clear());

function session(): OperatorSession {
  return {
    id: "s1", goal: "Fix activation", graphId: "g1", projectId: "p1",
    status: "waiting_for_input", createdAt: "2026-07-11T00:00:00.000Z", updatedAt: "2026-07-11T00:00:00.000Z",
    schemaVersion: 1, model: "gpt-5.5-codex", worker: { runtime: "codex", model: "gpt-5.5-codex" },
    handoffRevision: 2, stepCount: 1, maxSteps: 20, graphRevision: 0, events: [],
  } as OperatorSession;
}

describe("ComposerDock runtime continuation controls", () => {
  it("offers Auto as a real runtime choice and keeps ask-both separate", () => {
    const onHandoff = vi.fn();
    const onAskBoth = vi.fn();
    render(<ComposerDock
      session={session()} running={false} startOpen bench={[]}
      onSend={() => {}} onCancel={() => {}} onReviewGate={() => {}}
      onHandoff={onHandoff} onAskBoth={onAskBoth}
    />);

    fireEvent.click(screen.getByRole("button", { name: "Switch to Auto-pick" }));
    fireEvent.click(screen.getByRole("button", { name: "Run on both" }));
    expect(onHandoff).toHaveBeenCalledWith("auto");
    expect(onAskBoth).toHaveBeenCalledOnce();
  });

  it("does not offer runtime mutation while the current worker is running", () => {
    render(<ComposerDock
      session={{ ...session(), status: "running" }} running={false} startOpen bench={[]}
      onSend={() => {}} onCancel={() => {}} onReviewGate={() => {}}
      onHandoff={() => {}} onAskBoth={() => {}}
    />);
    expect(screen.queryByRole("button", { name: /Switch to/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run on both" })).not.toBeInTheDocument();
  });

  it("prevents a duplicate ask-both request while both branches are starting", () => {
    const onAskBoth = vi.fn();
    render(<ComposerDock
      session={session()} running={false} startOpen bench={[]}
      onSend={() => {}} onCancel={() => {}} onReviewGate={() => {}}
      onHandoff={() => {}} onAskBoth={onAskBoth} runtimeComparisonStarting
    />);
    const button = screen.getByRole("button", { name: "Running both…" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onAskBoth).not.toHaveBeenCalled();
  });
});
