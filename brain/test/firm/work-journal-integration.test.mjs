import assert from "node:assert/strict";
import { fork } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, it } from "node:test";

import { recoverWorkJournals } from "../../src/desktop-runtime.mjs";
import { listConversation } from "../../src/firm/conversation.mjs";
import { getSemanticModel } from "../../src/firm/semantic-model-store.mjs";
import { createVenture } from "../../src/firm/venture-store.mjs";
import { createWorkJournal } from "../../src/firm/work-journal.mjs";
import { driveTeammate } from "../../src/firm/work-loop.mjs";

const fixtures = [];

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "drover-journal-kill-"));
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), "drover-journal-kill-repo-"));
  const options = { root };
  const venture = createVenture({ id: "journal-kill", name: "Journal kill", repository }, options);
  const value = { root, repository, options, venture };
  fixtures.push(value);
  return value;
}

function waitForRouteAcceptance(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("The crash fixture never acknowledged its route.")), 5_000);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("message", (message) => {
      if (message?.stage !== "route-accepted") return;
      clearTimeout(timeout);
      resolve(message);
    });
  });
}

function waitForExit(child) {
  return new Promise((resolve) => child.once("exit", (code, signal) => resolve({ code, signal })));
}

afterEach(() => {
  for (const item of fixtures.splice(0)) {
    fs.rmSync(item.root, { recursive: true, force: true });
    fs.rmSync(item.repository, { recursive: true, force: true });
  }
});

it("SIGKILL immediately after route acknowledgement recovers exactly one founder turn and one Run", {
  skip: process.platform === "win32",
}, async () => {
  const { root, options, venture } = fixture();
  const child = fork(
    path.resolve(import.meta.dirname, "../../test-support/work-journal-crash-child.mjs"),
    [root, venture.id],
    { stdio: ["ignore", "ignore", "pipe", "ipc"] },
  );
  const acceptance = await waitForRouteAcceptance(child);
  assert.equal(acceptance.status, 202);
  assert.match(acceptance.body.runRef, /^run:/);
  assert.equal(acceptance.retry.status, 202);
  assert.deepEqual(acceptance.retry.body, acceptance.body, "the same command receipt cannot dispatch a duplicate Run");
  child.kill("SIGKILL");
  const exit = await waitForExit(child);
  assert.equal(exit.signal, "SIGKILL");

  const journal = createWorkJournal(options);
  const stored = journal.events(venture.id);
  assert.deepEqual(stored.slice(0, 2).map((event) => event.kind), [
    "founder-turn-accepted",
    "run-started",
  ]);

  const projection = journal.readProjections(venture.id);
  assert.equal(projection.threads.length, 1);
  assert.equal(projection.threads[0].messageIds.length, 1);
  assert.equal(projection.runs.length, 1);
  assert.equal(projection.runs[0].status, "running");
  assert.equal(projection.runs[0].founderTurnIds.length, 1);

  assert.equal(
    listConversation(venture.id, options).filter((message) => message.role === "founder").length,
    1,
    "the canonical transcript and journal agree on one founder turn",
  );
  assert.equal(getSemanticModel(venture.id, options).runs.length, 1, "the canonical model and journal agree on one Run");

  const beforeDelete = structuredClone(projection);
  assert.equal(journal.deleteProjections(venture.id), true);
  const recovered = recoverWorkJournals(options);
  assert.equal(recovered[0].mode, "writable");
  assert.equal(recovered[0].projection.runs, 1);
  assert.deepEqual(journal.readProjections(venture.id), beforeDelete);
});

it("desktop recovery keeps a tampered journal read-only and returns its preservation path", () => {
  const { root, options, venture } = fixture();
  const journal = createWorkJournal(options);
  journal.append(venture.id, {
    eventId: "founder-turn",
    ventureId: venture.id,
    threadId: "thread-1",
    runId: "run-1",
    kind: "founder-turn-accepted",
    payload: { messageId: "message-1" },
  });
  const file = path.join(root, "ventures", venture.id, "workJournal", "events.json");
  const tampered = JSON.parse(fs.readFileSync(file, "utf8"));
  tampered.events[0].payload.messageId = "changed-without-a-new-hash";
  fs.writeFileSync(file, `${JSON.stringify(tampered, null, 2)}\n`);

  const recovered = recoverWorkJournals(options);
  assert.equal(recovered[0].mode, "read-only");
  assert.equal(recovered[0].diagnostics.journal.code, "work_journal_corrupt");
  assert.equal(recovered[0].diagnostics.journal.journalPath, file);
  assert.match(recovered[0].diagnostics.journal.steps[2], /Restore the journal/);
});

it("a settled provider run journals its native session, measured usage, activity, and completion", async () => {
  const { options, venture } = fixture();
  await driveTeammate({
    ventureId: venture.id,
    teammateRef: "founding-teammate",
    goal: "Return one measured result",
    initiatedBy: "founder",
    options,
    deps: {
      runtime: {
        id: "measured-provider",
        label: "Measured provider",
        costReporting: "usd",
        async drive(ctx) {
          ctx.onRuntimeSession("native-session-complete");
          ctx.onUsage({ inputTokens: 17, outputTokens: 5, cacheReadInputTokens: 3 });
          ctx.onCost(0.04);
          ctx.onToolStart("read_repository_excerpt", { summary: "Reading source evidence" });
          return { kind: "completed", summary: "Measured return" };
        },
      },
    },
  });

  const journal = createWorkJournal(options);
  const kinds = journal.events(venture.id).map((event) => event.kind);
  assert.equal(kinds.includes("provider-session-bound"), true);
  assert.equal(kinds.includes("factual-activity-recorded"), true);
  assert.equal(kinds.includes("run-completed"), true);
  assert.equal(kinds.at(-1), "run-quiescent");
  const projection = journal.readProjections(venture.id);
  assert.equal(projection.runs.length, 1);
  assert.equal(projection.runs[0].status, "completed");
  assert.equal(projection.runs[0].providerSession.sessionId, "native-session-complete");
  assert.deepEqual(projection.usage.total, {
    inputTokens: 17,
    outputTokens: 5,
    cachedInputTokens: 3,
    costUsd: 0.04,
  });
});

it("a provider failure drains to typed failed-layer receipts without erasing successful persistence", async () => {
  const { options, venture } = fixture();
  await assert.rejects(
    driveTeammate({
      ventureId: venture.id,
      teammateRef: "founding-teammate",
      goal: "Return one interrupted result",
      initiatedBy: "founder",
      options,
      deps: {
        runtime: {
          id: "failing-provider",
          label: "Failing provider",
          async drive() {
            throw Object.assign(new Error("Provider transport closed."), { code: "provider_closed" });
          },
        },
      },
    }),
    /Provider transport closed/,
  );

  const projection = createWorkJournal(options).readProjections(venture.id);
  const run = projection.runs[0];
  assert.equal(run.status, "interrupted");
  assert.deepEqual(run.layerReceipts.map(({ type, status }) => ({ type, status })), [
    { type: "provider-settled", status: "failed" },
    { type: "timeline-settled", status: "failed" },
    { type: "projection-persisted", status: "succeeded" },
  ]);
  assert.equal(run.quiescence.status, "failed");
  assert.deepEqual(run.quiescence.failedReceipts, ["provider-settled", "timeline-settled"]);
});
