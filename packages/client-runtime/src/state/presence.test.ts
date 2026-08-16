import { ThreadId, type PresenceParticipant } from "@croki/contracts";
import { describe, expect, it } from "vite-plus/test";

import { applyPresenceStreamEvent } from "./presence.ts";

const threadId = ThreadId.make("thread-1");
const participant = (participantId: string, label: string): PresenceParticipant => ({
  participantId: participantId as PresenceParticipant["participantId"],
  threadId,
  surface: "thread",
  label,
  deviceType: "desktop",
  activity: "viewing",
  lastSeenAt: "2026-08-16T12:00:00.000Z",
  expiresAt: "2026-08-16T12:00:20.000Z",
});

describe("presence stream reducer", () => {
  it("replaces stale state when a reconnect begins with a fresh snapshot", () => {
    const stale = participant("session-stale:0", "Stale");
    const current = applyPresenceStreamEvent([], {
      version: 1,
      type: "upsert",
      threadId,
      participant: stale,
    });

    const fresh = participant("session-fresh:0", "Fresh");
    const afterReconnect = applyPresenceStreamEvent(current, {
      version: 1,
      type: "snapshot",
      threadId,
      participants: [fresh],
    });

    expect(afterReconnect).toEqual([fresh]);
    expect(afterReconnect).not.toContain(stale);
  });

  it("applies idempotent upserts and removals", () => {
    const alice = participant("session-a:0", "Alice");
    const bob = participant("session-b:0", "Bob");
    const current = applyPresenceStreamEvent([alice], {
      version: 1,
      type: "upsert",
      threadId,
      participant: bob,
    });
    const updatedAlice = { ...alice, activity: "typing" as const };
    const updated = applyPresenceStreamEvent(current, {
      version: 1,
      type: "upsert",
      threadId,
      participant: updatedAlice,
    });
    const removed = applyPresenceStreamEvent(updated, {
      version: 1,
      type: "removed",
      threadId,
      participantId: bob.participantId,
    });

    expect(updated).toEqual([updatedAlice, bob]);
    expect(removed).toEqual([updatedAlice]);
  });
});
