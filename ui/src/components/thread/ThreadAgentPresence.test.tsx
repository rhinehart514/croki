import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkIndexItem } from "@/api";
import type { FirmCrewMember } from "@/types";
import { ThreadAgentPresence } from "./ThreadAgentPresence";

const crew: FirmCrewMember[] = [
  { ref: "yara", summonedAt: "2026-07-19T12:00:00.000Z", soul: { name: "Yara" } },
  { ref: "mira", summonedAt: "2026-07-19T12:00:00.000Z", soul: { name: "Mira" } },
];

function item(extra: Partial<WorkIndexItem>): WorkIndexItem {
  return {
    threadRef: "thread:one", ventureRef: "venture:one", parentThreadRef: null, originMessageRef: null,
    subjectRefs: [], focusRef: "thread:one", founderIntent: "Ship the next feature", lifecycle: "open",
    activity: "idle", attention: "none", terminal: null, unread: false, reviewedThrough: null,
    latestMeaningfulEvent: { kind: "created", ref: "thread:one", at: null, summary: null }, runRefs: [],
    pinnedAt: null, participantRefs: [], activeParticipantRefs: [], createdAt: null, updatedAt: null,
    ...extra,
  };
}

describe("thread agent presence", () => {
  it("shows persistent character faces with truthful per-agent states", () => {
    render(<ThreadAgentPresence crew={crew} items={[
      item({ participantRefs: ["yara"], activeParticipantRefs: ["yara"], activity: "running" }),
      item({ threadRef: "thread:two", participantRefs: ["mira"], attention: "decision" }),
    ]} activeCount={1} waitingCount={1} onSelect={vi.fn()} />);

    expect(screen.getByText("1 active · 1 waiting on you")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yara · Working. Open thread" })).toHaveAttribute("data-state", "active");
    expect(screen.getByRole("button", { name: "Mira · Needs you. Open thread" })).toHaveAttribute("data-state", "waiting");
    expect(document.querySelectorAll(".thread-agent-face svg")).toHaveLength(2);
  });

  it("opens the agent's highest-priority linked thread", () => {
    const onSelect = vi.fn();
    const active = item({ participantRefs: ["yara"], activeParticipantRefs: ["yara"], activity: "running" });
    render(<ThreadAgentPresence crew={[crew[0]]} items={[active]} activeCount={1} waitingCount={0} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "Yara · Working. Open thread" }));
    expect(onSelect).toHaveBeenCalledWith(active);
  });
});
