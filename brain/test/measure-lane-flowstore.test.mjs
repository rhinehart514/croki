// measure-lane-flowstore.test.mjs — the AUTOMATIC win-detection lane, proven through the ACTUAL LIVE
// send path, not through approveCompiledRun.
//
// The gap this locks down: the three paths that actually send live — the direct and streaming graph runs
// (routes/graph.mjs) and the operator gate-resume (operator-runtime.mjs) — all persist through
// recordFlowRun into the FLOW store, NOT runStore. A real send's delivery facts (the Gmail provider
// message id + sentAt) land on the EXECUTE node's output items inside that run's result, which
// recordFlowRun persists verbatim. The inbox reader's sent-item index used to read runStore ONLY, so it
// was permanently empty on every live send and every poll no-op'd — the lane was committed but inert.
//
// The prior measure-lane test drove approveCompiledRun (a runStore write, and a path that in production
// does not itself send). This one drives the real live seam:
//   compose a real gated Gmail-send graph → run it to the founder gate (phase 1, exactly as the /graph/run
//   route does) → resume the gate with an approval + a stub Gmail transport that returns a provider id
//   (phase 2, the wall-crossing send) → persist with recordFlowRun (production's exact persistence) →
//   poll (the inbox reader now reads the flow store, attributes EXACTLY ONE Result to the sent item) →
//   re-poll (durable cross-tick dedupe: NO second Result).
//
// It deliberately does NOT seed a runStore item — no production live-send path produces one, and seeding
// one was the previous focused test's flaw.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { runGraph } from "../src/graph.mjs";
import { recordFlowRun } from "../src/flow-store.mjs";
import { pollInboxOutcomes, projectFlowRunsToSentRuns } from "../src/connectors/measure/inbox-reader.mjs";
import { resultStore } from "../src/gtm-store.mjs";

// Isolated store root per test — nothing touches the real ~/.gtm-ide.
function freshRoot() {
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), "measure-lane-flow-")) };
}

// A REAL gated Gmail-send graph: a manual source seeds one concrete recipient carrying a durable joinKey
// (exactly the shape a staged item carries), a founder gate holds it, and the gmail execute node sends the
// approved item. This is a genuine composed topology run through the real engine — not a hand-built store
// record.
function gatedGmailGraph(recipient, { joinKey = "jk-ada" } = {}) {
  return {
    id: "outbound-ada",
    nodes: [
      {
        id: "src",
        category: "source",
        connector: "manual",
        label: "Manual list",
        config: {
          items: [
            {
              email: recipient,
              to: recipient,
              joinKey,
              subject: "A launch checklist",
              draft: "Hi Ada — here's a launch checklist.",
              message: "Hi Ada — here's a launch checklist.",
            },
          ],
        },
      },
      { id: "gate", category: "gate", connector: "default", label: "Founder review", config: {} },
      { id: "out", category: "execute", connector: "gmail", label: "Send via Gmail", config: { from: "founder@drover.co" } },
    ],
    edges: [
      { id: "e1", source: "src", target: "gate", edgeType: "data" },
      { id: "e2", source: "gate", target: "out", edgeType: "data" },
    ],
  };
}

// A fake Gmail SEND transport injected via sendRunners.gmail — returns a provider message id exactly as the
// real transport does, without touching Google. This is the id the flow-store projection must surface.
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

describe("projectFlowRunsToSentRuns — the flow store's execute output projects to sent items", () => {
  it("surfaces a truly-sent execute-node item (provider id + joinKey) and skips a staged/blocked one", () => {
    const flowRecords = [
      {
        graph: { id: "g1" },
        runs: [
          {
            id: "run-a",
            graphSnapshot: { id: "g1", nodes: [{ id: "out", category: "execute" }], edges: [] },
            result: {
              runId: "run-a",
              nodes: {
                out: {
                  category: "execute",
                  items: [
                    // truly sent → surfaced
                    { joinKey: "jk-ada", providerMessageId: "gmsg-ada", to: "ada@acme.com", sentAt: "2026-07-09T10:00:00Z" },
                    // blocked needs_connection (no provider id) → skipped, never guessed
                    { joinKey: "jk-bo", executionStatus: "needs_connection" },
                  ],
                },
              },
            },
          },
        ],
      },
    ];
    const sentRuns = projectFlowRunsToSentRuns(flowRecords);
    assert.equal(sentRuns.length, 1);
    assert.equal(sentRuns[0].id, "run-a");
    assert.equal(sentRuns[0].items.length, 1);
    assert.equal(sentRuns[0].items[0].joinKey, "jk-ada");
    assert.equal(sentRuns[0].items[0].providerMessageId, "gmsg-ada");
  });

  it("returns nothing for flow runs with no truly-sent items", () => {
    assert.equal(projectFlowRunsToSentRuns([]).length, 0);
    assert.equal(projectFlowRunsToSentRuns([{ runs: [{ result: { nodes: {} } }] }]).length, 0);
  });
});

describe("measure lane — LIVE send via recordFlowRun → poll → attribute once, no cross-tick duplicate", () => {
  it("attributes a reply to a flow-store-persisted live send, and a re-poll adds no duplicate", async () => {
    const options = freshRoot();
    const projectId = "acme";
    const recipient = "ada@acme.com";
    const providerMessageId = "gmsg-ada-live";
    const graph = gatedGmailGraph(recipient);

    // The gmail connector reads GMAIL_OAUTH_TOKEN (its envKey) as the token it hands the transport. Set it
    // for the duration so the real send path resolves a token and actually invokes the transport.
    const priorToken = process.env.GMAIL_OAUTH_TOKEN;
    process.env.GMAIL_OAUTH_TOKEN = "test-access-token";
    try {
      // PHASE 1 — run to the founder gate, exactly as POST /api/graph/run does before an approval. The
      // gmail execute node is blocked downstream of the pending gate; nothing sends yet.
      const pending = await runGraph(graph, { projectId, credentialOptions: options });
      assert.ok(pending.pendingGates.includes("gate"), "the run paused at the founder gate");
      assert.equal(pending.nodes.out?.blocked, true, "the send node is blocked behind the pending gate");
      assert.equal((pending.nodes.out?.items ?? []).length, 0, "nothing was sent before approval");
      // Persist the paused run the way the route does (recordFlowRun on every run).
      recordFlowRun(graph, pending, options);

      // PHASE 2 — the founder approves and the gate resumes with the live delivery seam wired. This is the
      // ONE wall-crossing path: the approved item flows to the gmail node and the stub transport returns a
      // provider message id. Mirrors routes/graph.mjs (resumeResult + approvals + sendRunners) and the
      // operator gate-resume.
      const sends = { calls: 0 };
      const releases = { calls: 0 };
      const resumed = await runGraph(graph, {
        projectId,
        credentialOptions: options,
        approvals: { gate: true },
        resumeResult: pending,
        // Engine-level stand-in for the browser capability the HTTP route validates before supplying
        // this callback. The transport test must cross that same host-owned release seam.
        authorizeRelease: () => { releases.calls += 1; },
        sendRunners: fakeSendRunner(providerMessageId, sends),
      });
      assert.equal(releases.calls, 1, "the host authorized the founder's release before delivery");
      assert.equal(sends.calls, 1, "the send transport was actually invoked for the approved item");
      assert.equal(resumed.nodes.out.items[0].executionStatus, "sent");
      assert.equal(resumed.nodes.out.items[0].providerMessageId, providerMessageId);
      assert.equal(resumed.nodes.out.items[0].joinKey, "jk-ada", "the durable joinKey survives the send");

      // PERSIST — exactly as the live route/operator path does: the whole run result into the FLOW store.
      // This is where a live send's provider id actually lands in production.
      recordFlowRun(graph, resumed, options);

      // POLL — the inbox reader now reads the flow store, indexes the sent item, and attributes EXACTLY ONE
      // Result to it when the recipient replies.
      const firstPoll = await pollInboxOutcomes(projectId, {
        ...options,
        token: "fake-read-token",
        readTransport: fakeReadReply({ recipient }),
      });
      assert.equal(firstPoll.ok, true);
      assert.equal(firstPoll.ingested.length, 1, "one reply detected and ingested from the live-sent item");
      assert.equal(firstPoll.ingested[0].joined, true, "the reply joined back to its exact run item");
      assert.equal(firstPoll.ingested[0].outcomeKind, "reply");
      assert.equal(firstPoll.deduped, 0, "the first poll is a genuinely new signal");

      const afterFirst = resultStore.list({ ...options, projectId });
      assert.equal(afterFirst.length, 1, "exactly one Result in the ledger after the first poll");
      assert.equal(afterFirst[0].joinKey, "jk-ada");
      assert.equal(afterFirst[0].outcomeKind, "reply");
      assert.equal(afterFirst[0].source, "connected-account");

      // RE-POLL — the same reply again. Durable cross-tick dedupe holds: NO new Result.
      const secondPoll = await pollInboxOutcomes(projectId, {
        ...options,
        token: "fake-read-token",
        readTransport: fakeReadReply({ recipient }),
      });
      assert.equal(secondPoll.ok, true);
      assert.equal(secondPoll.ingested.length, 0, "the second poll ingests nothing new");
      assert.equal(secondPoll.deduped, 1, "the re-seen signal is a durable dedupe, not a fresh win");

      const afterSecond = resultStore.list({ ...options, projectId });
      assert.equal(afterSecond.length, 1, "still exactly one Result — one real reply, never a per-tick duplicate");
    } finally {
      if (priorToken === undefined) delete process.env.GMAIL_OAUTH_TOKEN;
      else process.env.GMAIL_OAUTH_TOKEN = priorToken;
    }
  });
});
