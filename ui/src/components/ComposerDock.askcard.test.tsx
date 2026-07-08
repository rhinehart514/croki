import { beforeAll, describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ComposerDock } from "./ComposerDock";
import type { OperatorEvent, OperatorSession } from "@/types";

// WI-5 — the "Your call" question card: options are tappable, a tap drafts the label into the reply
// (append-only, unchanged) AND persists as chosen in place (aria-pressed=true, a filled radio). A NEW
// question clears the old pick. This guards the receipt-in-place behavior without touching askPick.

const ASK_TITLE =
  "Who are we going after?\n1. **Owners** — homeowners with a yard\n2. **Renters** — apartment dwellers";

function askEvent(id: string, title: string): OperatorEvent {
  return { id, createdAt: new Date().toISOString(), type: "founder_input_requested", title };
}

function sessionWith(events: OperatorEvent[]): OperatorSession {
  return {
    id: "s1",
    goal: "get more owners",
    graphId: "g1",
    status: "waiting_for_input",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    schemaVersion: 1,
    model: "claude",
    stepCount: 2,
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

// Find an option button by its label text, scoped to the ask card (not the input, which may echo a
// picked label after a tap).
function optButton(label: string): HTMLButtonElement {
  const card = document.querySelector(".oc-card")!;
  const el = Array.from(card.querySelectorAll(".oc-opt-t")).find((n) => n.textContent === label);
  return el!.closest("button")! as HTMLButtonElement;
}

function renderDock(session: OperatorSession) {
  return render(
    <ComposerDock
      session={session}
      running={false}
      bench={[]}
      onSend={() => {}}
      onCancel={() => {}}
      onReviewGate={() => {}}
    />,
  );
}

describe("ComposerDock — the 'Your call' ask card (WI-5)", () => {
  it("renders the stem + tappable options; a tap appends the label and marks that option chosen", () => {
    renderDock(sessionWith([askEvent("ask-1", ASK_TITLE)]));

    // The "Your call" tag and the question stem render as prose.
    expect(screen.getByText("Your call")).toBeTruthy();
    expect(screen.getByText("Who are we going after?")).toBeTruthy();

    // Both options render as buttons.
    const owners = optButton("Owners");
    const renters = optButton("Renters");
    expect(owners).toBeTruthy();
    expect(renters).toBeTruthy();

    // Nothing chosen yet.
    expect(owners.getAttribute("aria-pressed")).toBe("false");
    expect(renters.getAttribute("aria-pressed")).toBe("false");

    // Tapping option 1 appends its label into the reply input (askPick behavior unchanged).
    fireEvent.click(owners);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea.value).toContain("Owners");

    // The chosen option persists in place; the other stays unchosen.
    expect(owners.getAttribute("aria-pressed")).toBe("true");
    expect(owners.className).toContain("picked");
    expect(renters.getAttribute("aria-pressed")).toBe("false");
    expect(renters.className).not.toContain("picked");
  });

  it("clears the pick when a NEW question arrives (keyed by event id)", () => {
    const { rerender } = renderDock(sessionWith([askEvent("ask-1", ASK_TITLE)]));

    fireEvent.click(optButton("Owners"));
    expect(optButton("Owners").getAttribute("aria-pressed")).toBe("true");

    // A brand-new ask (different event id) remounts the card — the old pick is gone.
    rerender(
      <ComposerDock
        session={sessionWith([askEvent("ask-2", ASK_TITLE)])}
        running={false}
        bench={[]}
        onSend={() => {}}
        onCancel={() => {}}
        onReviewGate={() => {}}
      />,
    );

    expect(optButton("Owners").getAttribute("aria-pressed")).toBe("false");
    expect(optButton("Renters").getAttribute("aria-pressed")).toBe("false");
  });
});
