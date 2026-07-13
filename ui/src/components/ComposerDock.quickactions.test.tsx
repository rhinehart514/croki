import { beforeAll, describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ComposerDock } from "./ComposerDock";

// The in-place correction verbs on the object bound to the composer (the Notion/Strut menu, homed on
// the canvas object's representation in the composer). Selecting a card on the canvas binds it here; a
// tap on a verb drops EDITABLE phrasing into the input — the cheap-correction path that doesn't require
// typing a paragraph, and never a bare fire.

beforeAll(() => {
  if (!("scrollTo" in Element.prototype)) {
    Object.defineProperty(Element.prototype, "scrollTo", { value: () => {}, writable: true });
  }
  if (!("scrollIntoView" in Element.prototype)) {
    Object.defineProperty(Element.prototype, "scrollIntoView", { value: () => {}, writable: true });
  }
});

describe("ComposerDock — in-place quick actions on the bound object", () => {
  it("seeds an editable steer into the input when a verb is tapped", () => {
    render(
      <ComposerDock
        session={null}
        running={false}
        bench={[]}
        altitude="empty"
        subject={{ id: "goal:1", label: "Fix activation", kind: "goal" }}
        onClearSubject={() => {}}
        onSend={() => {}}
        onCancel={() => {}}
        onReviewGate={() => {}}
      />,
    );

    // The bound object reads back in the chip.
    expect(screen.getByText("Fix activation")).toBeTruthy();

    // One tap drops editable phrasing into the input, scoped to the object — never a bare fire.
    const input = screen.getByLabelText("Message your crew") as HTMLTextAreaElement;
    expect(input.value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Explain" }));
    expect(input.value).toContain("Fix activation");
    expect(input.value.toLowerCase()).toContain("explain");
  });

  it("offers question-shaped verbs when the bound object is a question", () => {
    render(
      <ComposerDock
        session={null}
        running={false}
        bench={[]}
        altitude="empty"
        subject={{ id: "q:1", label: "Is annual pricing credible?", kind: "question" }}
        onClearSubject={() => {}}
        onSend={() => {}}
        onCancel={() => {}}
        onReviewGate={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Answer it" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Find evidence" })).toBeTruthy();
  });

  it("makes the textarea own the custom mention listbox and its active option", async () => {
    render(
      <ComposerDock
        session={null}
        running={false}
        bench={[{ ref: "researcher", name: "Researcher", job: "Finds evidence." } as never]}
        altitude="empty"
        onSend={() => {}}
        onCancel={() => {}}
        onReviewGate={() => {}}
      />,
    );

    const input = screen.getByLabelText("Message your crew");
    fireEvent.change(input, { target: { value: "@" } });
    const listbox = await screen.findByRole("listbox", { name: "Mention a teammate or capability" });
    const active = await screen.findByRole("option", { name: /researcher/i });

    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).toHaveAttribute("aria-controls", listbox.id);
    expect(input).toHaveAttribute("aria-activedescendant", active.id);
  });
});
