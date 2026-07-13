// Reply alert + decide-together (rail 5 push) — the hard guarantee: a real reply NEVER auto-replies.
// The projection reads the reply, its context, and a suggested move; it writes nothing and can send
// nothing. It only surfaces the decide-together moment for the founder.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { isReply, projectReplyAlerts, getReplyAlert } from "../src/reply-alert.mjs";
import { appendInput, listInputs } from "../src/inputs-store.mjs";
import { getPendingInbox } from "../src/pending-inbox.mjs";

describe("reply-alert — the push half of rail 5, and it NEVER auto-replies", () => {
  let root;
  let options;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-reply-alert-"));
    options = { root };
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("recognizes a real reply and ignores non-reply signals", () => {
    assert.equal(isReply({ kind: "reply", source: "gmail" }), true);
    assert.equal(isReply({ kind: "email-response", source: "gmail" }), true);
    assert.equal(isReply({ kind: "inbound", source: "gmail", payload: { inReplyTo: "msg-1" } }), true);
    assert.equal(isReply({ kind: "meeting", source: "calendly" }), true);
    // A commit / star / signup is an event, NOT a two-way reply — no push alert.
    assert.equal(isReply({ kind: "commit", source: "github" }), false);
    assert.equal(isReply({ kind: "star", source: "github" }), false);
    assert.equal(isReply({ kind: "signup", source: "landing-page" }), false);
  });

  it("projects a decide-together alert for a real reply — reply + context + suggested move", () => {
    appendInput("default", {
      kind: "reply",
      source: "gmail",
      payload: { from: "dana@acme.com", body: "Interested — can we talk Thursday?", joinKey: "jk-1" },
    }, options);

    const alerts = projectReplyAlerts({ projectId: "default", projectName: "RodentRadar" }, options);
    assert.equal(alerts.length, 1);
    const alert = alerts[0];
    assert.equal(alert.reply.from, "dana@acme.com");
    assert.match(alert.reply.body, /Thursday/);
    assert.equal(alert.context.joinKey, "jk-1");
    // The machine SUGGESTS a next move — a string the founder decides WITH, never an action taken.
    assert.equal(typeof alert.suggestedMove, "string");
    assert.match(alert.suggestedMove, /decide together/i);
  });

  it("NEVER auto-replies, routes, or runs — the reply stays unrouted after every read", () => {
    appendInput("default", {
      kind: "reply",
      source: "gmail",
      payload: { from: "sam@co.com", body: "No thanks." },
    }, options);

    // Read the projection, the single-alert read, AND the pending inbox — every read is pure.
    projectReplyAlerts({ projectId: "default" }, options);
    const input = listInputs("default", options)[0];
    getReplyAlert({ projectId: "default", inputId: input.id }, options);
    getPendingInbox({ projectId: "default" }, options);

    // The reply is STILL unrouted — nothing replied, routed, or ran. The pull affordance is intact; the
    // push added an alert, never an action.
    const after = listInputs("default", options);
    assert.equal(after.length, 1, "no second input was created — nothing was auto-replied");
    assert.equal(after[0].status, "unrouted", "the reply was never auto-routed or auto-replied");
    assert.equal(after[0].routedTo, null, "no routing target was set by any read");
  });

  it("surfaces the reply as a `reply-alert` PUSH in the pending inbox, not a quiet signal", () => {
    appendInput("default", { kind: "reply", source: "gmail", payload: { from: "x@y.com", body: "Yes!" } }, options);
    appendInput("default", { kind: "star", source: "github", payload: {} }, options);

    const inbox = getPendingInbox({ projectId: "default" }, options);
    const kinds = inbox.decisions.map((d) => d.kind);
    assert.ok(kinds.includes("reply-alert"), "a real reply pushes as a decide-together alert");
    assert.ok(kinds.includes("trigger-proposal"), "a non-reply outside event becomes one experiment proposal");
    assert.equal(kinds.includes("signal"), false, "the same outside event is not duplicated as a raw signal");
    // The reply-alert summary promises no auto-send.
    const replyRow = inbox.decisions.find((d) => d.kind === "reply-alert");
    assert.match(replyRow.summary, /Nothing sends until you say so/i);
  });
});
