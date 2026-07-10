import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { QuestionFocus } from "@/components/canvas/QuestionFocus";
import type { ClarityObject } from "@/types";

const question: ClarityObject = { id: "q1", kind: "question", text: "Which segment does this attract?", createdAt: "" };

// ── Fix 6 — the question focus is a NON-modal in-place sidecar, not a modal dialog ──
describe("QuestionFocus landmark role (fix 6)", () => {
  it("uses role=complementary (a landmark), never role=dialog", () => {
    render(
      <QuestionFocus
        question={question}
        onClose={() => {}} onAskCrew={() => {}} onFindEvidence={() => {}} onMakeCall={() => {}} onTurnIntoPipeline={() => {}}
      />,
    );
    // The sidecar is a complementary landmark — it does not trap focus or block the canvas behind a scrim.
    const region = screen.getByRole("complementary", { name: "Focused question" });
    expect(region).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
