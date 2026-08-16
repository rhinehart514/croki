import { describe, expect, it } from "@effect/vitest";
import { ThreadId, type PresenceParticipant } from "@croki/contracts";

import { presenceSummaryContent, typingIndicatorLabel } from "./threadPresencePresentation";

function participant(
  participantId: string,
  label: string,
  activity: PresenceParticipant["activity"] = "viewing",
): PresenceParticipant {
  return {
    participantId,
    threadId: ThreadId.make("thread-1"),
    surface: "thread",
    label,
    deviceType: "desktop",
    activity,
    lastSeenAt: "2026-08-16T16:00:00.000Z",
    expiresAt: "2026-08-16T16:00:20.000Z",
  };
}

describe("mobile Thread presence presentation", () => {
  it("keeps solo threads visually quiet", () => {
    expect(presenceSummaryContent([])).toBeNull();
    expect(typingIndicatorLabel([])).toBeNull();
  });

  it("summarizes relevant participants without exposing drafts", () => {
    const alice = participant("session-a:1", "Alice", "typing");
    const bob = participant("session-b:1", "Bob");

    expect(presenceSummaryContent([alice, bob])).toEqual({
      accessibilityLabel: "People in this thread: Alice, Bob",
      label: "Alice and Bob here",
    });
    expect(typingIndicatorLabel([alice, bob])).toBe("Alice is typing…");
  });
});
