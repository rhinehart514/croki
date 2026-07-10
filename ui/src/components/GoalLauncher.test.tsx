import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { GoalLauncher } from "./GoalLauncher";
import { DEFAULT_MODEL } from "./agent-picker-models";

// The first-run launcher must let a founder deliberately pick their runtime (Codex or Claude) and
// carry that choice into their VERY FIRST session — the P0 that made Codex support incomplete.

const CODEX_MODEL_ID = "gpt-5.5-codex";
const CODEX_MODEL_LABEL = "GPT-5.5";
const DEFAULT_MODEL_LABEL = "Opus 4.8"; // DEFAULT_MODEL === claude-opus-4-8

beforeEach(() => {
  cleanup();
  localStorage.clear();
});

// Open the embedded picker and choose the Codex model.
function pickCodex() {
  // The trigger shows the current model label; default is Opus 4.8.
  fireEvent.click(screen.getByText(DEFAULT_MODEL_LABEL));
  fireEvent.click(screen.getByText(CODEX_MODEL_LABEL));
}

describe("GoalLauncher — first-run runtime picker", () => {
  it("sends the SELECTED Codex model alongside the submitted goal", () => {
    const onSubmitGoal = vi.fn();
    render(<GoalLauncher productName="Acme" busy={false} onSubmitGoal={onSubmitGoal} onIdeate={() => {}} pipelineCount={0} />);

    pickCodex();
    fireEvent.change(screen.getByPlaceholderText(/first paying customer/i), {
      target: { value: "Land the first pilot this week" },
    });
    fireEvent.click(screen.getByTitle(/Start \(Enter\)/i));

    expect(onSubmitGoal).toHaveBeenCalledTimes(1);
    expect(onSubmitGoal).toHaveBeenCalledWith("Land the first pilot this week", CODEX_MODEL_ID);
  });

  it("defaults to DEFAULT_MODEL when the founder does not change the picker", () => {
    const onSubmitGoal = vi.fn();
    render(<GoalLauncher productName="Acme" busy={false} onSubmitGoal={onSubmitGoal} onIdeate={() => {}} pipelineCount={0} />);

    fireEvent.change(screen.getByPlaceholderText(/first paying customer/i), { target: { value: "Get money this week" } });
    fireEvent.click(screen.getByTitle(/Start \(Enter\)/i));

    expect(onSubmitGoal).toHaveBeenCalledWith("Get money this week", DEFAULT_MODEL);
  });

  it("persists the Codex choice to gtm.model and reloads it on a fresh mount", () => {
    const first = render(<GoalLauncher productName="Acme" busy={false} onSubmitGoal={() => {}} onIdeate={() => {}} pipelineCount={0} />);
    pickCodex();

    // The choice is written to the shared local key ComposerDock also reads.
    expect(localStorage.getItem("gtm.model")).toBe(CODEX_MODEL_ID);
    first.unmount();

    // A brand-new mount reads that persisted choice — the trigger shows Codex, and a submit sends it.
    const onSubmitGoal = vi.fn();
    render(<GoalLauncher productName="Acme" busy={false} onSubmitGoal={onSubmitGoal} onIdeate={() => {}} pipelineCount={0} />);
    expect(screen.getByText(CODEX_MODEL_LABEL)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/first paying customer/i), { target: { value: "Reload check" } });
    fireEvent.click(screen.getByTitle(/Start \(Enter\)/i));
    expect(onSubmitGoal).toHaveBeenCalledWith("Reload check", CODEX_MODEL_ID);
  });

  it("carries the selected Codex model into the Ideate action too", () => {
    const onIdeate = vi.fn();
    render(<GoalLauncher productName="Acme" busy={false} onSubmitGoal={() => {}} onIdeate={onIdeate} pipelineCount={0} />);

    pickCodex();
    fireEvent.click(screen.getByRole("button", { name: /Ideate directions for me/i }));

    expect(onIdeate).toHaveBeenCalledTimes(1);
    expect(onIdeate).toHaveBeenCalledWith(CODEX_MODEL_ID);
  });

  it("carries the model into Ideate on the returning surface (existing pipelines)", () => {
    const onIdeate = vi.fn();
    render(<GoalLauncher productName="Acme" busy={false} onSubmitGoal={() => {}} onIdeate={onIdeate} pipelineCount={3} />);

    pickCodex();
    fireEvent.click(screen.getByRole("button", { name: /Ideate what's next for me/i }));
    expect(onIdeate).toHaveBeenCalledWith(CODEX_MODEL_ID);
  });

  it("has no provider-specific 'Claude' wording in its body copy", () => {
    const { container } = render(
      <GoalLauncher productName="Acme" busy={false} onSubmitGoal={() => {}} onIdeate={() => {}} pipelineCount={0} />,
    );
    // Rendered text is provider-neutral — the runtime is expressed through the picker, not hardcoded copy.
    expect(container.textContent ?? "").not.toMatch(/claude/i);
    // And the neutral phrasing is present.
    expect(screen.getByText(/your AI runtime/i)).toBeInTheDocument();
  });
});
