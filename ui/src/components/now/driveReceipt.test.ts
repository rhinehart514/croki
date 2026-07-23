import { describe, expect, it } from "vitest";
import { readDriveReceipt, readReplyReceipt, type DriveReceipt } from "./driveReceipt";
import type { ConversationReplyResult, DriveTeammateResult } from "@/api";

function drive(partial: Partial<DriveTeammateResult>): DriveTeammateResult {
  return {
    outcome: {},
    work: {},
    runtime: { id: "anthropic", label: "Claude", auth: null },
    handoff: null,
    ...partial,
  } as DriveTeammateResult;
}

function handoff(changes: { openedBetIds?: string[]; stagedBetIds?: string[]; wallBetIds?: string[] }, betId: string | null = null) {
  return {
    id: "m1", ventureId: "v1", role: "system", kind: "handoff", content: "", teammateRef: null, betId,
    changes: { openedBetIds: [], stagedBetIds: [], wallBetIds: [], ...changes },
    createdAt: "2026-01-01T00:00:00Z",
  } as DriveTeammateResult["handoff"];
}

describe("readDriveReceipt", () => {
  it("points at judgment when a decision reached the wall", () => {
    const receipt = readDriveReceipt(drive({ handoff: handoff({ wallBetIds: ["b1"] }) }));
    expect(receipt.waiting).toBe(true);
    expect(receipt.headline).toMatch(/decision that's yours/i);
    expect(receipt.targetBetId).toBe("b1");
  });

  it("treats a paused outcome as waiting even without a wall bet", () => {
    const receipt = readDriveReceipt(drive({ outcome: { kind: "paused" }, handoff: handoff({ openedBetIds: ["b9"] }) }));
    expect(receipt.waiting).toBe(true);
    expect(receipt.targetBetId).toBe("b9");
  });

  it("opens the direction that owns the waiting decision", () => {
    const receipt = readDriveReceipt(drive({ handoff: handoff({ openedBetIds: ["b-open"], wallBetIds: ["b-wall"] }) }));
    expect(receipt.waiting).toBe(true);
    expect(receipt.targetBetId).toBe("b-wall");
  });

  it("names a single staged change and offers it to open", () => {
    const receipt = readDriveReceipt(drive({ handoff: handoff({ stagedBetIds: ["b2"] }) }));
    expect(receipt.headline).toBe("A change is ready to review.");
    expect(receipt.targetBetId).toBe("b2");
  });

  it("counts multiple opened approaches", () => {
    const receipt = readDriveReceipt(drive({ handoff: handoff({ openedBetIds: ["b3", "b4"] }) }));
    expect(receipt.headline).toBe("2 approaches are underway.");
    expect(receipt.targetBetId).toBe("b3");
  });

  it("surfaces grounding and participant when work opened", () => {
    const receipt = readDriveReceipt(drive({
      handoff: handoff({ openedBetIds: ["b5"] }),
      completion: { state: "complete", grounding: { satisfied: true, sourceRefs: ["a", "b"] }, theory: { satisfied: true, theoryId: null }, usefulWork: { satisfied: true, workRefs: [] }, missing: [] },
    }));
    expect(receipt.detail).toBe("Grounded in 2 sources · Claude.");
  });

  it("leads with the teammate's own words for a pure answer that opened no work", () => {
    const receipt = readDriveReceipt(drive({
      outcome: { kind: "completed", summary: "The strongest next move is to close the first-run gap. Then chase distribution." },
      handoff: null,
    }));
    expect(receipt.headline).toBe("Croki worked through it.");
    expect(receipt.detail).toBe("The strongest next move is to close the first-run gap.");
    expect(receipt.targetBetId).toBeNull();
  });

  it("keeps stopped work honest and non-alarming", () => {
    const receipt = readDriveReceipt(drive({ outcome: { kind: "cancelled" }, handoff: null }));
    expect(receipt.headline).toMatch(/stopped/i);
    expect(receipt.waiting).toBe(false);
  });

  it("falls back gracefully when the response is bare", () => {
    const receipt: DriveReceipt = readDriveReceipt(drive({ outcome: {}, handoff: null, runtime: { id: "x", label: "", auth: null } }));
    expect(receipt.headline).toMatch(/take shape/i);
    expect(receipt.targetBetId).toBeNull();
    expect(receipt.detail).toBeNull();
  });
});

describe("readReplyReceipt", () => {
  it("keeps an approved outward act visibly held for founder release", () => {
    const receipt = readReplyReceipt({
      act: "approve", betId: "b1", waitingItemId: "wall-1", grant: null,
      note: "Release this at the gate to send it.",
    } satisfies ConversationReplyResult);

    expect(receipt.waiting).toBe(true);
    expect(receipt.headline).toMatch(/release this act at the gate/i);
    expect(receipt.headline).not.toMatch(/carrying it out/i);
  });

  it("never turns a standing approval into release authority", () => {
    const receipt = readReplyReceipt({
      act: "approve-standing", betId: "b1", waitingItemId: "wall-1",
      grant: { actType: "send", grantedAt: "2026-07-18T12:00:00.000Z" },
      note: "Release this at the gate to send it.",
    } satisfies ConversationReplyResult);

    expect(receipt.waiting).toBe(true);
    expect(receipt.headline).toMatch(/still needs your release/i);
  });

  it("tells the founder a steer reached the live turn when the brain applied it same-turn", () => {
    const receipt = readReplyReceipt({ act: "steer", betId: "b1", applied: "same-turn" } as ConversationReplyResult);
    expect(receipt.headline).toBe("Your message reached the running agent.");
    expect(receipt.waiting).toBe(false);
  });

  it("stays honest when a steer only queued for the next step", () => {
    const receipt = readReplyReceipt({ act: "steer", betId: "b1", applied: "next-step" } as ConversationReplyResult);
    expect(receipt.headline).toBe("Your steer is in — it adjusts at the next step.");
  });
});
