import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  appendOperatorEvent,
  assertOperatorSessionProject,
  createOperatorSession,
  getActiveSessionForProject,
  getOperatorSession,
  getOrCreateSessionForProject,
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

describe("one durable operator conversation per project", () => {
  let parent;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-operator-project-"));
    options = { root: parent };
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("get-or-create returns the same session for a project across calls", () => {
    const first = getOrCreateSessionForProject("rodentradar", { goal: "Stand up the outbound channel." }, options);
    assert.equal(first.created, true);
    assert.equal(first.session.projectId, "rodentradar");

    const second = getOrCreateSessionForProject("rodentradar", { goal: "A different prompt entirely." }, options);
    assert.equal(second.created, false);
    assert.equal(second.session.id, first.session.id, "the project's existing live thread is reused, not duplicated");

    // The active-session lookup agrees with get-or-create.
    assert.equal(getActiveSessionForProject("rodentradar", options).id, first.session.id);
  });

  it("a second project gets its own session", () => {
    const a = getOrCreateSessionForProject("rodentradar", { goal: "Outbound." }, options);
    const b = getOrCreateSessionForProject("other-product", { goal: "Referral." }, options);
    assert.notEqual(a.session.id, b.session.id);
    assert.equal(b.session.projectId, "other-product");
    // Each project resolves only its own thread.
    assert.equal(getActiveSessionForProject("rodentradar", options).id, a.session.id);
    assert.equal(getActiveSessionForProject("other-product", options).id, b.session.id);
  });

  it("honors the explicit projectId regardless of any global default", () => {
    // No active-project global is consulted here — the projectId passed IS the binding.
    const { session } = getOrCreateSessionForProject("explicit-project", { goal: "Explicit binding." }, options);
    assert.equal(session.projectId, "explicit-project");
    assert.equal(getActiveSessionForProject("explicit-project", options).id, session.id);
  });

  it("does not reuse a terminal session as the active thread", () => {
    const first = getOrCreateSessionForProject("rodentradar", { goal: "First run." }, options);
    // Complete it — terminal sessions become reopenable history, never the live thread.
    saveOperatorSession({ ...getOperatorSession(first.session.id, options), status: "completed" }, options);

    assert.equal(getActiveSessionForProject("rodentradar", options), null, "a completed session is not the active thread");

    const next = getOrCreateSessionForProject("rodentradar", { goal: "Pick up the next goal." }, options);
    assert.equal(next.created, true);
    assert.notEqual(next.session.id, first.session.id);

    // The terminal session still lists as history.
    const ids = listOperatorSessions({ ...options, projectId: "rodentradar" }).map((summary) => summary.id);
    assert.ok(ids.includes(first.session.id), "the completed session remains listable history");
    assert.ok(ids.includes(next.session.id));
  });

  it("asserts a session belongs to the requested project before driving it", () => {
    const { session } = getOrCreateSessionForProject("rodentradar", { goal: "Owned by rodentradar." }, options);
    assert.equal(assertOperatorSessionProject(session.id, "rodentradar", options).id, session.id);
    assert.throws(
      () => assertOperatorSessionProject(session.id, "some-other-project", options),
      /belongs to project rodentradar, not some-other-project/,
    );
  });
});
