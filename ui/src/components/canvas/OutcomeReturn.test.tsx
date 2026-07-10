import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OutcomeReturn } from "@/components/canvas/OutcomeReturn";
import type { JoinedOutcome } from "@/types";

function outcome(over: Partial<JoinedOutcome> = {}): JoinedOutcome {
  return {
    id: "r1", kind: "observed-response", label: "Got 3 replies", value: 3,
    channelId: "ch1", questionId: "q1", productRefs: ["billing"], crewRefs: [], runId: "run1", ...over,
  };
}

describe("OutcomeReturn return chips (fix 4 + fix 5)", () => {
  it("offers the question chip only when the question is resolvable (no no-op affordance)", () => {
    const onFocusQuestion = vi.fn();
    const { rerender } = render(
      <OutcomeReturn
        outcomes={[outcome()]} implications={[]} resolvableQuestionIds={new Set(["q1"])}
        onClose={() => {}} onFocusQuestion={onFocusQuestion} onAcceptImplication={() => {}} onDismissImplication={() => {}}
      />,
    );
    expect(screen.getByText("question")).toBeTruthy();

    // Same outcome, but its question no longer resolves → the chip must not render.
    rerender(
      <OutcomeReturn
        outcomes={[outcome()]} implications={[]} resolvableQuestionIds={new Set()}
        onClose={() => {}} onFocusQuestion={onFocusQuestion} onAcceptImplication={() => {}} onDismissImplication={() => {}}
      />,
    );
    expect(screen.queryByText("question")).toBeNull();
  });

  it("focuses the exact product ref (never drops it) when the product chip is clicked", () => {
    const onOpenProduct = vi.fn();
    render(
      <OutcomeReturn
        outcomes={[outcome({ productRefs: ["billing"] })]} implications={[]} resolvableQuestionIds={new Set(["q1"])}
        onClose={() => {}} onOpenProduct={onOpenProduct} onAcceptImplication={() => {}} onDismissImplication={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("product"));
    expect(onOpenProduct).toHaveBeenCalledWith("billing");
  });
});
