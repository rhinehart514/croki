// measure-lane-integration.test.mjs — the AUTOMATIC win-detection lane, end to end through the REAL seam.
//
// A Phase-1 review found this lane built but INERT in real operation, for two reasons this test locks down:
//   1. The send transport hands back a Gmail provider message id, but nothing merged it back onto the run,
//      so the inbox reader's sent-item index (keyed on item.providerMessageId) was always empty live and
//      every poll no-op'd. The fix: approveCompiledRun now merges the execute node's send output —
//      providerMessageId + sentAt, keyed on the durable joinKey — back onto the persisted run items.
//   2. Even once a reply was read, ingestOutcome unconditionally minted a fresh Result every heartbeat, so
//      ONE real reply fabricated hundreds of duplicate "wins" a day. The fix: durable cross-tick dedupe —
//      the persisted Result ledger is the seen-state, so re-seeing the same signal is a no-op.
//
// This drives the LIVE path, not the pure deterministic halves the focused unit test already covers:
//   send (a founder-approved item flows through an injected Gmail transport and gets back a provider id)
//   → persist (the id is merged onto the run and round-trips from the store)
//   → poll (the inbox reader reads a reply thread and attributes EXACTLY ONE Result to that run item)
//   → re-poll (a second poll of the same reply creates NO duplicate — the win count derives from the one
//      real signal and can never inflate on the heartbeat).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { approveCompiledRun } from "../src/run-compile.mjs";
import { pollInboxOutcomes } from "../src/connectors/measure/inbox-reader.mjs";
import { gtmPathStore, runStore, resultStore } from "../src/gtm-store.mjs";

// Isolated store root per test — nothing touches the real ~/.gtm-ide.
function freshRoot() {
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), "measure-lane-")) };
}

// A staged run whose compiled topology is a GATED Gmail send: founder gate → gmail execute. Seeding it
// directly (rather than through the composer) keeps this test on the send→persist→poll seam under test,
// independent of how a path compiles its execute connector. One concrete recipient, carrying a durable
// joinKey — exactly the shape a compiled run stages.
function seedStagedGmailRun(options, { projectId = "acme", recipient = "ada@acme.com" } = {}) {
  const gtmPath = gtmPathStore.create(
    { projectId, summary: "Email Ada a launch nudge", bet: { buyer: "Ada", channel: "gmail", offer: "checklist" }, status: "selected" },
    options,
  );
  const staged = runStore.create(
    {
      projectId,
      pathId: gtmPath.id,
      status: "staged",
      steps: [
        { id: "gate", category: "gate", connector: "default", label: "Founder review" },
        { id: "out", category: "execute", connector: "gmail", label: "Send via Gmail", config: { from: "founder@drover.co" } },
      ],
      edges: [{ source: "gate", target: "out", edgeType: "data" }],
      items: [{ email: recipient, to: recipient, message: "Hi Ada — here's a launch checklist.", draft: "Hi Ada — here's a launch checklist.", joinKey: "jk-ada" }],
    },
    options,
  );
  return { projectId, staged, recipient };
}

// A fake Gmail SEND transport injected via sendRunners.gmail — returns a provider message id exactly as
// the real transport does, without touching Google. This is the id the merge must persist.
function fakeSendRunner(providerMessageId, counter) {
  return {
    gmail: async () => {
      if (counter) counter.calls += 1;
      return { ok: true, providerMessageId };
    },
  };
}

// A fake Gmail READ transport for the poller: getMessage returns a fixed threadId; getThread returns a
// scripted reply thread (one message from the recipient).
function fakeReadReply({ recipient = "ada@acme.com", threadId = "thr-1" } = {}) {
  return {
    getMessage: async () => ({ ok: true, payload: { threadId } }),
    getThread: async () => ({ ok: true, payload: { messages: [{ payload: { headers: [{ name: "From", value: recipient }] } }] } }),
  };
}

describe("measure lane — send → persist execute output → poll → attribute once, no cross-tick duplicate", () => {
  it("persists the sent provider id onto the run, attributes one Result, and a re-poll adds none", async () => {
    const options = freshRoot();
    const { projectId, staged, recipient } = seedStagedGmailRun(options);

    // The gmail connector requires GMAIL_OAUTH_TOKEN present (its envKey) and reads it as the token it hands
    // the transport. Set it for the duration of this test so the real send path resolves a token and runs.
    const priorToken = process.env.GMAIL_OAUTH_TOKEN;
    process.env.GMAIL_OAUTH_TOKEN = "test-access-token";
    try {
      // Before the send, the staged item carries NO provider id — nothing has been sent yet.
      assert.equal(staged.items[0].providerMessageId ?? null, null);

      // SEND — approve the run. The founder releases the one item (keyed by the same draftKey the gate
      // renders it under: the recipient email), it flows to the gmail execute node, and the injected
      // transport returns a provider message id. sendRunners is the live delivery seam.
      const providerMessageId = "gmsg-ada-real";
      const sends = { calls: 0 };
      const releases = { calls: 0 };
      const { run: approved, result } = await approveCompiledRun({
        projectId,
        run: staged,
        decisions: { [recipient]: { decision: "approve" } },
        // Engine-level stand-in for the browser capability the HTTP route validates before supplying
        // this callback. Compiled-run approval must not reach a sender without the host release seam.
        authorizeRelease: () => { releases.calls += 1; },
        sendRunners: fakeSendRunner(providerMessageId, sends),
        options,
      });
      assert.equal(releases.calls, 1, "the host authorized the founder's release before delivery");
      assert.equal(sends.calls, 1, "the send transport was actually invoked for the approved item");
      assert.equal(approved.status, "completed");
      // The execute node genuinely reported a sent item carrying the provider id.
      assert.equal(result.nodes.out.items[0].executionStatus, "sent");
      assert.equal(result.nodes.out.items[0].providerMessageId, providerMessageId);

      // PERSIST — the approved run, READ BACK from the store, now carries the provider id + sentAt on its
      // item. This is the merge that was missing; without it the inbox reader's sent-item index is empty.
      const reloaded = runStore.get(approved.id, { ...options, projectId });
      const sentItem = reloaded.items.find((i) => i.joinKey === "jk-ada");
      assert.ok(sentItem, "the sent item round-trips on the persisted run");
      assert.equal(sentItem.providerMessageId, providerMessageId, "the sent Gmail message id is persisted onto the run item");
      assert.ok(sentItem.sentAt, "the send timestamp is persisted alongside the provider id");
      assert.equal(sentItem.approved, true, "the persisted item is the founder-approved one");

      // POLL — a reply from the recipient attributes EXACTLY ONE Result to that run item.
      const firstPoll = await pollInboxOutcomes(projectId, {
        ...options,
        token: "fake-read-token",
        readTransport: fakeReadReply({ recipient }),
      });
      assert.equal(firstPoll.ok, true);
      assert.equal(firstPoll.ingested.length, 1, "one reply detected and ingested");
      assert.equal(firstPoll.ingested[0].joined, true, "the reply joined back to its exact run item");
      assert.equal(firstPoll.ingested[0].outcomeKind, "reply");
      assert.equal(firstPoll.deduped, 0, "the first poll is a genuinely new signal, not a dedupe");

      const afterFirst = resultStore.list({ ...options, projectId });
      assert.equal(afterFirst.length, 1, "exactly one Result in the ledger after the first poll");
      assert.equal(afterFirst[0].joinKey, "jk-ada");
      assert.equal(afterFirst[0].outcomeKind, "reply");
      assert.equal(afterFirst[0].source, "connected-account");

      // RE-POLL — the same reply again. Durable dedupe holds: NO new Result, the count stays at one.
      const secondPoll = await pollInboxOutcomes(projectId, {
        ...options,
        token: "fake-read-token",
        readTransport: fakeReadReply({ recipient }),
      });
      assert.equal(secondPoll.ok, true);
      assert.equal(secondPoll.ingested.length, 0, "the second poll ingests nothing new");
      assert.equal(secondPoll.deduped, 1, "the re-seen signal is counted as a durable dedupe, not a fresh win");

      const afterSecond = resultStore.list({ ...options, projectId });
      assert.equal(afterSecond.length, 1, "still exactly one Result — one real reply, never a duplicate per tick");
    } finally {
      if (priorToken === undefined) delete process.env.GMAIL_OAUTH_TOKEN;
      else process.env.GMAIL_OAUTH_TOKEN = priorToken;
    }
  });
});
