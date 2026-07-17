import { describe, expect, it } from "vitest";
import { crewName, isCheckpoint, receiptNodeId } from "./conversationModel";
import type { FirmConversationMessage } from "@/types";

// Phase 3 acceptance (architecture §4): the receipt filter maps a message's target scope to the world
// node id it anchors to. A `target.betId` → `bet:<id>`; a bare `betId` also works; a work ref → `work:`;
// a machinery target → `architecture:`; a firm-wide message → null (it lives in the summonable thread,
// not in-world). Checkpoints (handoffs) are classified separately so they render as sealed cards.
function message(overrides: Partial<FirmConversationMessage>): FirmConversationMessage {
  return {
    id: "m1",
    ventureId: "v1",
    role: "teammate",
    content: "Drafted the outreach note.",
    teammateRef: "yara",
    betId: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  } as FirmConversationMessage;
}

const target = (over: Partial<NonNullable<FirmConversationMessage["target"]>>) => ({
  betId: null, workRef: null, teammateRefs: [], ...over,
});

describe("receiptNodeId", () => {
  it("maps message.target.betId to the bet node id", () => {
    expect(receiptNodeId(message({ target: target({ betId: "abc" }) }))).toBe("bet:abc");
  });

  it("falls back to the bare betId when no target is set", () => {
    expect(receiptNodeId(message({ betId: "xyz", target: null }))).toBe("bet:xyz");
  });

  it("maps a work ref to the work node id when no bet is present", () => {
    expect(receiptNodeId(message({ betId: null, target: target({ workRef: "w-7" }) }))).toBe("work:w-7");
  });

  it("maps an architecture target to the architecture node id", () => {
    expect(receiptNodeId(message({ betId: null, target: target({ architectureId: "sys-1" }) }))).toBe("architecture:sys-1");
  });

  it("returns null for a firm-wide message with no target", () => {
    expect(receiptNodeId(message({ betId: null, target: null }))).toBeNull();
  });

  it("prefers the bet scope over a work ref when both are present", () => {
    expect(receiptNodeId(message({ target: target({ betId: "b", workRef: "w" }) }))).toBe("bet:b");
  });
});

describe("isCheckpoint", () => {
  it("treats a handoff as a checkpoint seal", () => {
    expect(isCheckpoint(message({ kind: "handoff" }))).toBe(true);
  });

  it("treats an ordinary message as a flat receipt, not a checkpoint", () => {
    expect(isCheckpoint(message({ kind: "message" }))).toBe(false);
    expect(isCheckpoint(message({ kind: undefined }))).toBe(false);
  });
});

describe("crewName", () => {
  it("capitalizes a bare crew ref", () => {
    expect(crewName("yara")).toBe("Yara");
  });

  it("takes the last segment of a namespaced ref", () => {
    expect(crewName("crew:soren")).toBe("Soren");
  });

  it("falls back to a firm-wide label when unattributed", () => {
    expect(crewName(null)).toBe("The firm");
  });
});
