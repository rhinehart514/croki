import { ThreadId, type PresenceUpdateInput } from "@croki/contracts";
import { describe, expect, it } from "vite-plus/test";

import { PresenceRegistry } from "./PresenceService.ts";

const THREAD_A = ThreadId.make("thread-a");
const THREAD_B = ThreadId.make("thread-b");
const viewing: PresenceUpdateInput = {
  threadId: THREAD_A,
  surface: "thread",
  activity: "viewing",
  update: "enter",
};
const identity = {
  participantId: "session-a:0",
  label: "Alice",
  deviceType: "desktop" as const,
  os: "macOS",
};

describe("PresenceRegistry", () => {
  it("expires idle presence and extends the lease on heartbeat", () => {
    let now = 1_000;
    const registry = new PresenceRegistry({ now: () => now, ttlMs: 1_000 });

    const entered = registry.update(identity, viewing);
    expect(entered[0]?.type).toBe("upsert");
    expect(registry.snapshot(THREAD_A)).toHaveLength(1);

    now = 1_900;
    const heartbeat = registry.update(identity, {
      ...viewing,
      update: "heartbeat",
      activity: "typing",
    });
    expect(heartbeat.at(-1)).toMatchObject({ type: "upsert", threadId: THREAD_A });

    now = 2_500;
    expect(registry.expire()).toEqual([]);
    expect(registry.snapshot(THREAD_A)).toHaveLength(1);

    now = 2_901;
    expect(registry.expire()).toEqual([
      {
        version: 1,
        type: "removed",
        threadId: THREAD_A,
        participantId: identity.participantId,
      },
    ]);
    expect(registry.snapshot(THREAD_A)).toEqual([]);
  });

  it("removes every thread owned by a disconnected participant", () => {
    const registry = new PresenceRegistry({ now: () => 1_000 });
    registry.update(identity, viewing);
    registry.update(identity, { ...viewing, threadId: THREAD_B });

    expect(registry.leave(identity.participantId)).toEqual([
      {
        version: 1,
        type: "removed",
        threadId: THREAD_A,
        participantId: identity.participantId,
      },
      {
        version: 1,
        type: "removed",
        threadId: THREAD_B,
        participantId: identity.participantId,
      },
    ]);
    expect(registry.snapshot(THREAD_A)).toEqual([]);
    expect(registry.snapshot(THREAD_B)).toEqual([]);
  });
});
