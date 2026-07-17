import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { DriveTeammateResult } from "@/api";
import { NowComposer } from "./NowComposer";

const driveTeammate = vi.fn<(...args: unknown[]) => Promise<DriveTeammateResult>>();
vi.mock("@/api", () => ({ driveTeammate: (...args: unknown[]) => driveTeammate(...args) }));

function result(partial: Partial<DriveTeammateResult>): DriveTeammateResult {
  return {
    outcome: {}, work: {}, runtime: { id: "anthropic", label: "Claude", auth: null }, handoff: null,
    ...partial,
  } as DriveTeammateResult;
}

function handoff(changes: { openedBetIds?: string[]; stagedBetIds?: string[]; wallBetIds?: string[] }) {
  return {
    id: "m1", ventureId: "v1", role: "system", kind: "handoff", content: "", teammateRef: null, betId: null,
    changes: { openedBetIds: [], stagedBetIds: [], wallBetIds: [], ...changes }, createdAt: "2026-01-01T00:00:00Z",
  } as DriveTeammateResult["handoff"];
}

async function drive(text: string) {
  const field = screen.getByLabelText(/Say what you want/);
  fireEvent.change(field, { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: /Start work/ }));
}

describe("NowComposer post-submit receipt", () => {
  beforeEach(() => { driveTeammate.mockReset(); });

  it("replaces the black box with a composed receipt and a way in", async () => {
    driveTeammate.mockResolvedValue(result({ handoff: handoff({ stagedBetIds: ["b1"] }) }));
    const onOpenResult = vi.fn();
    render(
      <NowComposer
        ventureId="v1" ventureName="Acme" selection={null} scopeLabel={null} hasWork={false}
        onDriven={() => {}} onOpenResult={onOpenResult}
      />,
    );
    await drive("Ship the onboarding fix");

    // The old dead status line is gone; a real receipt of what landed takes its place.
    expect(await screen.findByText("A change is ready to review.")).toBeTruthy();
    expect(screen.queryByText(/Work started/)).toBeNull();

    // And there is a concrete way into the resulting direction, carrying the bet the drive landed on.
    const open = screen.getByRole("button", { name: /Open this direction/ });
    fireEvent.click(open);
    expect(onOpenResult).toHaveBeenCalledWith("b1");
  });

  it("points at judgment when the drive paused for a decision", async () => {
    driveTeammate.mockResolvedValue(result({ outcome: { kind: "paused" }, handoff: handoff({ wallBetIds: ["b2"] }) }));
    render(
      <NowComposer
        ventureId="v1" ventureName="Acme" selection={null} scopeLabel={null} hasWork={false}
        onDriven={() => {}} onOpenResult={() => {}}
      />,
    );
    await drive("Reach the first 20 customers");

    expect(await screen.findByText(/decision that's yours/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Make the decision/ })).toBeTruthy();
  });

  it("omits the open action in the docked composer (already inside the direction)", async () => {
    driveTeammate.mockResolvedValue(result({ handoff: handoff({ openedBetIds: ["b3"] }) }));
    render(
      <NowComposer
        ventureId="v1" ventureName="Acme" selection={null} scopeLabel="Ship the onboarding fix" hasWork
        variant="dock" onDriven={() => {}}
      />,
    );
    await drive("Try a warmer tone");

    expect(await screen.findByText("A new approach is underway.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Open this direction/ })).toBeNull();
  });
});
