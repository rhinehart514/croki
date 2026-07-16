import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { FirmBet, FirmCrewMember } from "@/types";

const driveTeammate = vi.fn();
const getRuntimeStatuses = vi.fn();

vi.mock("@/api", () => ({
  driveTeammate: (...args: unknown[]) => driveTeammate(...args),
  getRuntimeStatuses: (...args: unknown[]) => getRuntimeStatuses(...args),
}));

import { GoalComposer, type CanvasSelection } from "./GoalComposer";
import { targetBet, targetTeammates, targetTheory, targetWork } from "./directionTarget";

const crew: FirmCrewMember[] = [
  { ref: "writer", summonedAt: "now", soul: { name: "Yara" } },
  { ref: "closer", summonedAt: "now", soul: { name: "Reed" } },
];

function bet(id: string, position: FirmBet["position"], teammateRef = "writer"): FirmBet {
  return {
    id, ventureId: "v1", intent: `${id} intent`, forkedFrom: null, teammateRef,
    refs: [], evidence: [], staged: [], joinKey: `join-${id}`, createdAt: "now", updatedAt: "now",
    endedAt: position === "ended" ? "now" : null, endedBy: null, learning: null,
    position, stagedCount: position === "at-wall" ? 1 : 0, latestOutcome: null,
  };
}

function renderComposer(selection: CanvasSelection, bets = [bet("live-1", "live"), bet("wall-1", "at-wall"), bet("ended-1", "ended")]) {
  return render(
    <GoalComposer ventureId="v1" crew={crew} bets={bets} selection={selection} onDriven={vi.fn()} />,
  );
}

describe("GoalComposer", () => {
  beforeEach(() => {
    driveTeammate.mockReset().mockResolvedValue({
      outcome: { kind: "completed" }, work: {}, runtime: { id: "codex", label: "Codex", auth: "login" },
      handoff: null,
    });
    getRuntimeStatuses.mockReset().mockResolvedValue({
      runtimes: [{ id: "codex", label: "Codex", connected: true, auth: "login", authLabel: "ChatGPT", reason: null }],
    });
  });

  it("defaults to the whole firm and exposes real runtime routing", async () => {
    renderComposer(null);
    expect(screen.getByRole("region", { name: /direction composer: what should change/i })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Runtime" })).toHaveValue("auto");

    const field = screen.getByLabelText("Tell Drover what you want to change…");
    fireEvent.change(field, { target: { value: "Reach the first buyer" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Direct the venture" })).toBeEnabled());
    fireEvent.keyDown(field, { key: "Enter" });

    await waitFor(() => expect(driveTeammate).toHaveBeenCalledWith("v1", {
      goal: "Reach the first buyer",
    }));
  });

  it("names the selected scope and its consequence, then clears the chip with selection", async () => {
    const view = renderComposer(targetBet("live-1"));
    expect(screen.getByLabelText("Direction target")).toHaveTextContent(/venture.*live-1 intent/i);
    expect(view.container.querySelector(".firm-app-composer-command"))
      .toHaveTextContent(/direct.*live-1 intent.*direction stays with/i);

    view.rerender(<GoalComposer ventureId="v1" crew={crew} bets={[bet("live-1", "live")]} selection={null} onDriven={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText("Direction target")).toHaveTextContent(/^Venture$/));
    expect(screen.getByLabelText("Direction target")).not.toHaveTextContent("live-1 intent");
    expect(view.container.querySelector(".firm-app-composer-command"))
      .toHaveTextContent(/direct.*the venture.*current understanding/i);
  });

  it("focuses one open direction before exposing setup choices", async () => {
    render(
      <GoalComposer
        ventureId="v1"
        repositoryName="drover"
        crew={crew}
        bets={[]}
        selection={null}
        onDriven={vi.fn()}
      />,
    );

    const field = screen.getByLabelText("What should this venture accomplish first?");
    expect(screen.getByText("drover")).toBeTruthy();
    expect(screen.getByText("Nothing leaves without your hand.")).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "Runtime" })).toBeNull();
    await waitFor(() => expect(field).toHaveFocus());

    fireEvent.change(field, { target: { value: "Reach our first design partner" } });
    await waitFor(() => expect(screen.getByRole("button", { name: /explore this venture/i })).toBeEnabled());
    fireEvent.keyDown(field, { key: "Enter" });
    await waitFor(() => expect(driveTeammate).toHaveBeenCalledWith("v1", {
      goal: "Reach our first design partner",
    }));
  });

  it("steers the exact selected live bet and freezes that scope while words are present", async () => {
    const view = renderComposer(targetBet("live-1"));
    const field = screen.getByLabelText("What should change here?");
    fireEvent.change(field, { target: { value: "Try a warmer opening" } });
    expect(screen.getByLabelText(/scope locked while you write/i)).toBeTruthy();

    view.rerender(
      <GoalComposer ventureId="v1" crew={crew} bets={[bet("live-1", "live"), bet("wall-1", "at-wall")]} selection={targetTeammates(["closer"])} onDriven={vi.fn()} />,
    );
    expect(screen.getByRole("region", { name: /direct live-1 intent/i })).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: "Direct live-1 intent" })).toBeEnabled());
    fireEvent.keyDown(field, { key: "Enter" });

    await waitFor(() => expect(driveTeammate).toHaveBeenCalledWith("v1", {
      teammateRef: "writer",
      goal: "Try a warmer opening",
      betId: "live-1",
    }));
  });

  it("releases the locked scope when the draft is cleared", () => {
    const view = renderComposer(targetBet("live-1"));
    const field = screen.getByLabelText("What should change here?");
    fireEvent.change(field, { target: { value: "Keep this scope" } });
    view.rerender(
      <GoalComposer ventureId="v1" crew={crew} bets={[bet("live-1", "live")]} selection={targetTeammates(["closer"])} onDriven={vi.fn()} />,
    );
    fireEvent.change(field, { target: { value: "" } });
    expect(screen.getByRole("region", { name: /direction composer: direct reed/i })).toBeTruthy();
  });

  it("keeps inward direction available while outward work waits at the wall", () => {
    renderComposer(targetBet("wall-1"));
    expect(screen.getByRole("region", { name: /direct this held work/i })).toBeTruthy();
    expect(screen.getByLabelText(/refine or redirect the inward work/i)).toBeTruthy();
  });

  it("blocks new direction only after the founder ends that line of work", async () => {
    renderComposer(targetBet("ended-1"));
    expect(screen.getByRole("region", { name: /this direction has ended/i })).toBeTruthy();
    expect(screen.getByText(/choose current work/i)).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("form")).toBeNull();
    await waitFor(() => expect(screen.queryByText(/checking the local agent/i)).toBeNull());
    expect(screen.queryByText(/enter to direct/i)).toBeNull();
  });

  it("sends exact work and multiple selected teammates as explicit direction", async () => {
    const live = bet("live-1", "live");
    live.staged = [{ id: "offer-draft", title: "Paid pilot offer", content: "Offer" }];
    renderComposer({ ...targetWork("live-1", "offer-draft"), teammateRefs: ["writer", "closer"] }, [live]);

    const field = screen.getByLabelText("What should change about this exact work?");
    fireEvent.change(field, { target: { value: "Tighten the guarantee together" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Refine Paid pilot offer" })).toBeEnabled());
    fireEvent.keyDown(field, { key: "Enter" });

    await waitFor(() => expect(driveTeammate).toHaveBeenCalledWith("v1", {
      teammateRef: "writer",
      teammateRefs: ["writer", "closer"],
      goal: "Tighten the guarantee together",
      betId: "live-1",
      workRef: "offer-draft",
    }));
  });

  it("keeps Shift+Enter as a newline and lets Escape clear a draft before restoring venture scope", () => {
    const onClearSelection = vi.fn();
    render(<GoalComposer ventureId="v1" crew={crew} bets={[bet("live-1", "live")]} selection={targetBet("live-1")} onClearSelection={onClearSelection} onDriven={vi.fn()} />);
    const field = screen.getByLabelText("What should change here?");
    fireEvent.change(field, { target: { value: "Line one" } });
    fireEvent.keyDown(field, { key: "Enter", shiftKey: true });
    expect(driveTeammate).not.toHaveBeenCalled();

    fireEvent.keyDown(field, { key: "Escape" });
    expect(field).toHaveValue("");
    expect(onClearSelection).not.toHaveBeenCalled();
    fireEvent.keyDown(field, { key: "Escape" });
    expect(onClearSelection).toHaveBeenCalledOnce();
  });

  it("loads a suggested direction into the composer without submitting it", async () => {
    const onSuggestionConsumed = vi.fn();
    render(
      <GoalComposer
        ventureId="v1"
        crew={crew}
        bets={[]}
        selection={null}
        suggestion="Find a repeatable path"
        onSuggestionConsumed={onSuggestionConsumed}
        onDriven={vi.fn()}
      />,
    );

    expect(screen.getByRole("textbox")).toHaveValue("Find a repeatable path");
    expect(driveTeammate).not.toHaveBeenCalled();
    expect(onSuggestionConsumed).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Find a repeatable path this week" } });
    expect(onSuggestionConsumed).toHaveBeenCalledOnce();
  });

  it("starts first use in the real composer with the bound repository and safety boundary", async () => {
    render(
      <GoalComposer
        ventureId="v1"
        repositoryName="acme-product"
        crew={crew}
        bets={[]}
        selection={null}
        onDriven={vi.fn()}
      />,
    );

    expect(screen.getByText("acme-product")).toBeTruthy();
    expect(screen.getByText("Nothing leaves without your hand.")).toBeTruthy();
    const field = screen.getByLabelText("What should this venture accomplish first?");
    fireEvent.change(field, { target: { value: "Reach the first buyer" } });
    await waitFor(() => expect(screen.getByRole("button", { name: /explore this venture/i })).toBeEnabled());
  });

  it("lifts working state and returns the drive receipt", async () => {
    const onDriveStateChange = vi.fn();
    const onDriven = vi.fn();
    render(
      <GoalComposer
        ventureId="v1"
        crew={crew}
        bets={[]}
        selection={null}
        onDriveStateChange={onDriveStateChange}
        onDriven={onDriven}
      />,
    );
    const field = screen.getByRole("textbox");
    fireEvent.change(field, { target: { value: "Find the first buyer" } });
    await waitFor(() => expect(screen.getByRole("button", { name: /explore this venture/i })).toBeEnabled());
    fireEvent.keyDown(field, { key: "Enter" });

    await waitFor(() => expect(onDriven).toHaveBeenCalled());
    expect(onDriveStateChange.mock.calls[0][0]).toMatchObject({ direction: "Find the first buyer", teammateRef: null });
    expect(onDriveStateChange).toHaveBeenLastCalledWith(null);
  });

  it("keeps the composer available to draft a correction while one move is active", async () => {
    let resolveDrive: ((value: unknown) => void) | null = null;
    driveTeammate.mockReturnValueOnce(new Promise((resolve) => { resolveDrive = resolve; }));
    renderComposer(null);
    const field = screen.getByLabelText("Tell Drover what you want to change…");
    fireEvent.change(field, { target: { value: "Find the first buyer" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Direct the venture" })).toBeEnabled());
    fireEvent.keyDown(field, { key: "Enter" });

    const correction = await screen.findByLabelText("Draft a correction while this work continues");
    expect(correction).toBeEnabled();
    fireEvent.change(correction, { target: { value: "Narrow this to finance teams" } });
    expect(correction).toHaveValue("Narrow this to finance teams");
    expect(screen.getByText(/draft a correction now/i)).toBeTruthy();

    await act(async () => {
      resolveDrive?.({
        outcome: { kind: "completed" }, work: {}, runtime: { id: "codex", label: "Codex", auth: "login" }, handoff: null,
      });
    });
    await waitFor(() => expect(screen.queryByText(/draft a correction now/i)).toBeNull());
    expect(screen.getByRole("textbox")).toHaveValue("Narrow this to finance teams");
  });

  it("keeps drafting available but disables dispatch while the shell is read-only", async () => {
    render(
      <GoalComposer
        ventureId="v1"
        crew={crew}
        bets={[bet("live-1", "live")]}
        selection={null}
        readOnly
        readOnlyReason="Connection lost. Reconnecting…"
        onDriven={vi.fn()}
      />,
    );
    const field = screen.getByLabelText("Tell Drover what you want to change…");
    fireEvent.change(field, { target: { value: "Keep this correction safe" } });

    expect(field).toHaveValue("Keep this correction safe");
    expect(screen.getByRole("button", { name: "Direct the venture" })).toBeDisabled();
    expect(screen.getByText("Connection lost. Reconnecting…")).toBeTruthy();
    expect(driveTeammate).not.toHaveBeenCalled();
  });

  it("keeps the draft and surfaces a provider failure without losing composer scope", async () => {
    driveTeammate.mockRejectedValueOnce(new Error("Codex lost its local connection."));
    renderComposer(null);
    const field = screen.getByLabelText("Tell Drover what you want to change…");
    fireEvent.change(field, { target: { value: "Keep this direction safe" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Direct the venture" })).toBeEnabled());
    fireEvent.keyDown(field, { key: "Enter" });

    expect(await screen.findByRole("alert")).toHaveTextContent("Codex lost its local connection.");
    expect(field).toHaveValue("Keep this direction safe");
    expect(screen.getByLabelText(/scope locked while you write/i)).toBeTruthy();
  });

  it("turns a proposal motion adjustment into a real whole-venture direction draft", async () => {
    renderComposer(null);
    window.dispatchEvent(new CustomEvent("drover:proposal-adjustment", {
      detail: { draft: "Revise the proposed motion “Founder-led outbound”: " },
    }));
    const field = screen.getByRole("textbox");
    await waitFor(() => expect(field).toHaveValue("Revise the proposed motion “Founder-led outbound”: "));
    expect(screen.getByLabelText(/scope locked while you write/i)).toBeTruthy();
  });

  it("sends a selected provisional subject as a stable plain-language correction target", async () => {
    renderComposer(targetTheory("theory-2", "buyer", 4, "Agencies may be the buyer"));
    const field = screen.getByLabelText("What should Drover understand differently?");
    fireEvent.change(field, { target: { value: "Agencies are not the buyer." } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Correct Agencies may be the buyer" })).toBeEnabled());
    fireEvent.keyDown(field, { key: "Enter" });
    await waitFor(() => expect(driveTeammate).toHaveBeenCalledWith("v1", {
      goal: "Agencies are not the buyer.",
      theoryTarget: { theoryId: "theory-2", subjectId: "buyer" },
    }));
  });
});
