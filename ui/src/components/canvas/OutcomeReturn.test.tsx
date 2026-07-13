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

describe("OutcomeReturn — what came back is inspectable on PULL (Codex-review nuance)", () => {
  it("keeps the account collapsed at rest and reveals the response + exposure only when opened", () => {
    const o = outcome({
      label: "A reply came back", body: "Interested — can you send pricing for 40 sites?",
      status: "observed", observedAt: new Date().toISOString(), value: null,
    });
    const { container } = render(
      <OutcomeReturn
        outcomes={[o]} implications={[]} resolvableQuestionIds={new Set(["q1"])}
        onClose={() => {}} onAcceptImplication={() => {}} onDismissImplication={() => {}}
      />,
    );
    // The full response body is NOT pushed at rest — it lives inside a collapsed <details>.
    const details = container.querySelector("details.oret-account") as HTMLDetailsElement;
    expect(details).toBeTruthy();
    expect(details.open).toBe(false);
    // The disclosure summary is the pull affordance; the response + exposure live inside it (revealed on open
    // in the browser; present in the DOM for the test). Legibility on pull — the account is there to look at.
    const summary = details.querySelector("summary.oret-account-summary") as HTMLElement;
    expect(summary.textContent).toContain("What came back");
    expect(details.querySelector(".oret-account-response")?.textContent).toBe("Interested — can you send pricing for 40 sites?");
    expect(details.querySelector(".oret-account-exposure")?.textContent).toContain("today");
  });

  it("shows no account disclosure when there is nothing extra to inspect (no empty affordance)", () => {
    // Body equals the summary label and no observed-at → nothing additional to reveal.
    const o = outcome({ label: "Recorded outcome", body: "Recorded outcome", observedAt: null, value: null });
    const { container } = render(
      <OutcomeReturn
        outcomes={[o]} implications={[]} resolvableQuestionIds={new Set(["q1"])}
        onClose={() => {}} onAcceptImplication={() => {}} onDismissImplication={() => {}}
      />,
    );
    expect(container.querySelector("details.oret-account")).toBeNull();
  });
});
