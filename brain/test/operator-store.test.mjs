import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  appendOperatorEvent,
  createOperatorSession,
  getOperatorSession,
  listOperatorSessions,
  publicOperatorSession,
  recoverInterruptedOperatorSessions,
  saveOperatorSession,
} from "../src/operator-store.mjs";

describe("durable operator sessions", () => {
  let parent;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-operator-"));
    options = { root: parent };
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("creates, updates, lists, and reloads a session", () => {
    let session = createOperatorSession({ goal: "Build and run a Buffalo founder outreach loop." }, options);
    session = appendOperatorEvent(session, { type: "observation", title: "Inspected graph" });
    session = saveOperatorSession({ ...session, status: "waiting_for_input" }, options);

    recoverInterruptedOperatorSessions(options);
    const loaded = getOperatorSession(session.id, options);
    assert.equal(loaded.status, "waiting_for_input");
    assert.equal(loaded.events.length, 2);
    assert.equal(listOperatorSessions(options)[0].id, session.id);
    assert.equal(publicOperatorSession(loaded).modelMessages, undefined);
  });

  it("marks a persisted running session as interrupted and resumable", () => {
    const session = createOperatorSession({ goal: "Inspect the current loop." }, options);
    saveOperatorSession({ ...session, status: "running" }, options);
    recoverInterruptedOperatorSessions(options);
    const loaded = getOperatorSession(session.id, options);
    assert.equal(loaded.status, "interrupted");
    assert.match(loaded.error, /resume/i);
  });
});
