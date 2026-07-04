import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  reapIdleSessions,
  __registerTestSession,
  __hasSession,
  __clearTestSessions,
} from "../src/terminal-server.mjs";

// Runaway-work safety net #2: the pty idle-reaper. A shell is deliberately kept alive after its last
// client disconnects so a remount can reconnect to its history — but a client-less shell that no one
// ever reconnects to must eventually be reaped, or reconnect/reload churn fills MAX_SESSIONS with dead
// shells. These drive the reaper directly with a fake session (no real pty spawned).

function fakeSession(overrides = {}) {
  let killed = 0;
  return {
    term: { kill() { killed += 1; } },
    sockets: new Set(),
    lastEmptyAt: null,
    get killed() { return killed; },
    ...overrides,
  };
}

const IDLE_MS = 15 * 60 * 1000;

describe("terminal idle-reaper", () => {
  beforeEach(() => __clearTestSessions());

  it("reaps a session that has been client-less past its idle timeout", () => {
    const session = fakeSession({ lastEmptyAt: 1000 });
    __registerTestSession("idle", session);

    const reaped = reapIdleSessions(1000 + IDLE_MS + 1, IDLE_MS);

    assert.deepEqual(reaped, ["idle"], "the idle session should be reaped");
    assert.equal(session.killed, 1, "the pty should be killed exactly once");
    assert.equal(__hasSession("idle"), false, "the reaped session should be gone from the map");
  });

  it("does NOT reap a session that still has a connected client, however long it has lived", () => {
    const session = fakeSession({ lastEmptyAt: 1000, sockets: new Set([{}]) });
    __registerTestSession("attached", session);

    const reaped = reapIdleSessions(1000 + IDLE_MS + 999999, IDLE_MS);

    assert.deepEqual(reaped, [], "an attached session is never idle");
    assert.equal(session.killed, 0);
    assert.equal(__hasSession("attached"), true);
  });

  it("does NOT reap a client-less session that has not yet been idle long enough", () => {
    const session = fakeSession({ lastEmptyAt: 1000 });
    __registerTestSession("recent", session);

    const reaped = reapIdleSessions(1000 + IDLE_MS - 1, IDLE_MS);

    assert.deepEqual(reaped, [], "just under the timeout should survive");
    assert.equal(session.killed, 0);
    assert.equal(__hasSession("recent"), true);
  });

  it("does NOT reap a session that never went client-less (lastEmptyAt null)", () => {
    const session = fakeSession({ lastEmptyAt: null });
    __registerTestSession("never-empty", session);

    const reaped = reapIdleSessions(Date.now() + IDLE_MS * 10, IDLE_MS);

    assert.deepEqual(reaped, []);
    assert.equal(__hasSession("never-empty"), true);
  });

  it("reaps only the idle sessions in a mixed set", () => {
    __registerTestSession("idle-a", fakeSession({ lastEmptyAt: 0 }));
    __registerTestSession("idle-b", fakeSession({ lastEmptyAt: 0 }));
    __registerTestSession("live", fakeSession({ lastEmptyAt: 0, sockets: new Set([{}]) }));
    __registerTestSession("recent", fakeSession({ lastEmptyAt: IDLE_MS }));

    const reaped = reapIdleSessions(IDLE_MS + 1, IDLE_MS).sort();

    assert.deepEqual(reaped, ["idle-a", "idle-b"]);
    assert.equal(__hasSession("live"), true);
    assert.equal(__hasSession("recent"), true);
  });
});
