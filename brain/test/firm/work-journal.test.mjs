import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { createVenture } from "../../src/firm/venture-store.mjs";
import {
  createWorkJournal,
  WORK_JOURNAL_SCHEMA_VERSION,
} from "../../src/firm/work-journal.mjs";

const fixtures = [];
const STAMP = "2026-07-25T14:00:00.000Z";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "drover-work-journal-"));
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), "drover-work-journal-repo-"));
  const options = { root };
  createVenture({ id: "venture-a", name: "A", repository }, options);
  createVenture({ id: "venture-b", name: "B", repository }, options);
  const journal = createWorkJournal({ ...options, now: () => STAMP });
  const value = { root, repository, options, journal };
  fixtures.push(value);
  return value;
}

function event(kind, payload = {}, overrides = {}) {
  return {
    eventId: `${kind}-1`,
    ventureId: "venture-a",
    threadId: "thread-1",
    runId: "run-1",
    kind,
    occurredAt: STAMP,
    payload,
    ...overrides,
  };
}

function journalFile(root, ventureId = "venture-a") {
  return path.join(root, "ventures", ventureId, "workJournal", "events.json");
}

afterEach(() => {
  for (const item of fixtures.splice(0)) {
    fs.rmSync(item.root, { recursive: true, force: true });
    fs.rmSync(item.repository, { recursive: true, force: true });
  }
});

describe("durable Work journal", () => {
  it("accepts one founder turn and its exact Run atomically across process replacement", () => {
    const { options, journal } = fixture();
    const founderTurn = event("founder-turn-accepted", {
      messageId: "message-founder-1",
      contentRef: "conversation:message-founder-1",
    });

    const accepted = journal.append("venture-a", founderTurn, { expectedRevision: 0 });
    assert.equal(accepted.revision, 1);
    assert.equal(accepted.event.sequence, 1);

    const replacement = createWorkJournal({ ...options, now: () => STAMP });
    const projection = replacement.readProjections("venture-a");
    assert.deepEqual(projection.threads.map((thread) => thread.id), ["thread-1"]);
    assert.deepEqual(projection.threads[0].messageIds, ["message-founder-1"]);
    assert.deepEqual(projection.runs.map((run) => run.id), ["run-1"]);
    assert.equal(projection.runs[0].status, "accepted");

    const retry = replacement.append("venture-a", founderTurn);
    assert.equal(retry.duplicate, true);
    assert.equal(retry.event.sequence, 1);
    assert.equal(replacement.events("venture-a").length, 1);
    assert.throws(
      () => replacement.append("venture-a", {
        ...founderTurn,
        payload: { messageId: "different-message" },
      }),
      (error) => error.code === "work_journal_event_conflict",
    );
  });

  it("rebuilds stable Thread, Run, Review, usage, and attention identities from events alone", () => {
    const { journal } = fixture();
    const append = (input) => journal.append("venture-a", input);
    append(event("founder-turn-accepted", { messageId: "message-founder-1" }));
    append(event("provider-session-bound", {
      provider: "claude",
      sessionId: "native-session-1",
      participantRef: "teammate:claude",
      model: "claude-sonnet",
    }));
    append(event("run-started", {
      workScopeRef: "work-scope:one",
      worktreeRef: "workspace:one",
    }));
    append(event("factual-activity-recorded", {
      activityId: "activity-1",
      label: "Read source evidence",
      durationMs: 42,
      sourceRefs: ["file:src/index.ts#L20"],
      usage: { inputTokens: 100, outputTokens: 20, costUsd: 0.01 },
    }));
    append(event("intervention-opened", {
      interventionId: "intervention-1",
      kind: "question",
      questionRef: "decision:question-1",
    }));
    append(event("checkpoint-recorded", {
      checkpointId: "checkpoint-1",
      checkpointRef: "git-checkpoint:one",
      treeRef: "git-tree:abc",
      diffRef: "artifact:diff-1",
    }));
    append(event("command-receipt-recorded", {
      commandId: "command-1",
      status: "passed",
      receiptRef: "receipt:command-1",
    }));
    append(event("verification-receipt-recorded", {
      verificationId: "verification-1",
      status: "passed",
      receiptRef: "receipt:verification-1",
      usage: { cachedInputTokens: 5 },
    }));
    append(event("review-readiness-changed", {
      ready: true,
      checkpointId: "checkpoint-1",
      receiptRefs: ["receipt:verification-1"],
    }, { reviewId: "review-1" }));
    append(event("forming-reply-checkpointed", {
      replyId: "reply-1",
      contentRef: "forming-reply:reply-1",
      boundedText: "The coherent forming reply.",
    }));
    append(event("intervention-resolved", {
      interventionId: "intervention-1",
      outcome: "answered",
      decisionRef: "decision:answer-1",
    }));
    append(event("usage-recorded", {
      inputTokens: 2,
      outputTokens: 3,
      costUsd: 0.02,
    }));
    append(event("run-completed", {
      outcomeRefs: ["outcome:one"],
    }));

    const first = journal.rebuildProjections("venture-a");
    assert.equal(first.throughSequence, 13);
    assert.equal(first.runs[0].id, "run-1");
    assert.equal(first.runs[0].threadId, "thread-1");
    assert.equal(first.runs[0].providerSession.sessionId, "native-session-1");
    assert.equal(first.runs[0].status, "completed");
    assert.equal(first.runs[0].formingReply, null);
    assert.deepEqual(first.reviews, [{
      id: "review-1",
      ventureId: "venture-a",
      threadId: "thread-1",
      runId: "run-1",
      ready: true,
      checkpointId: "checkpoint-1",
      receiptRefs: ["receipt:verification-1"],
      reasons: [],
      updatedAt: STAMP,
      throughSequence: 9,
    }]);
    assert.deepEqual(first.usage.total, {
      inputTokens: 102,
      outputTokens: 23,
      cachedInputTokens: 5,
      costUsd: 0.03,
    });
    assert.deepEqual(first.attention, []);

    assert.equal(journal.deleteProjections("venture-a"), true);
    const rebuilt = journal.rebuildProjections("venture-a");
    assert.deepEqual(rebuilt, first, "derived projection deletion and rebuild cannot change public identities");
  });

  it("projects interruption and unresolved interventions as factual attention", () => {
    const { journal } = fixture();
    journal.append("venture-a", event("founder-turn-accepted", { messageId: "message-founder-1" }));
    journal.append("venture-a", event("intervention-opened", {
      interventionId: "intervention-1",
      kind: "permission",
      questionRef: "decision:permission-1",
    }));
    journal.append("venture-a", event("run-interrupted", {
      reasonCode: "brain-restarted",
      recovery: { action: "resume", sessionId: "native-session-1" },
    }));

    assert.deepEqual(journal.readProjections("venture-a").attention.map((item) => item.id), [
      "intervention:intervention-1",
      "run:run-1:interrupted",
    ]);
  });

  it("uses revision CAS and exposes stable duplicate-event idempotency", () => {
    const { journal } = fixture();
    journal.append("venture-a", event("founder-turn-accepted", { messageId: "message-founder-1" }), {
      expectedRevision: 0,
    });
    assert.throws(
      () => journal.append("venture-a", event("run-started", {}, { eventId: "run-started-2" }), {
        expectedRevision: 0,
      }),
      (error) => (
        error.code === "work_journal_revision_conflict"
        && error.expectedRevision === 0
        && error.actualRevision === 1
      ),
    );
    assert.equal(journal.events("venture-a").length, 1);
  });

  it("rejects cross-venture scope and physically isolates venture journals", () => {
    const { root, journal } = fixture();
    assert.throws(
      () => journal.append("venture-a", event("founder-turn-accepted", {
        messageId: "message-founder-1",
      }, { ventureId: "venture-b" })),
      (error) => error.code === "work_journal_scope_mismatch" && error.status === 403,
    );
    journal.append("venture-a", event("founder-turn-accepted", { messageId: "message-founder-1" }));
    journal.append("venture-b", event("founder-turn-accepted", { messageId: "message-founder-b" }, {
      eventId: "founder-b",
      ventureId: "venture-b",
      threadId: "thread-b",
      runId: "run-b",
    }));

    assert.equal(fs.existsSync(journalFile(root, "venture-a")), true);
    assert.equal(fs.existsSync(journalFile(root, "venture-b")), true);
    assert.deepEqual(journal.events("venture-a").map((entry) => entry.ventureId), ["venture-a"]);
    assert.deepEqual(journal.events("venture-b").map((entry) => entry.ventureId), ["venture-b"]);
  });

  it("opens truncated and hash-corrupt journals read-only with an actionable recovery path", () => {
    const { root, journal } = fixture();
    journal.append("venture-a", event("founder-turn-accepted", { messageId: "message-founder-1" }));
    const file = journalFile(root);
    const valid = fs.readFileSync(file, "utf8");

    fs.writeFileSync(file, valid.slice(0, -8));
    const truncated = journal.inspect("venture-a");
    assert.equal(truncated.mode, "read-only");
    assert.equal(truncated.diagnostic.code, "work_journal_corrupt");
    assert.equal(truncated.diagnostic.journalPath, file);
    assert.equal(truncated.diagnostic.steps.length, 3);
    assert.throws(
      () => journal.append("venture-a", event("run-started", {}, { eventId: "run-started-2" })),
      (error) => error.code === "work_journal_corrupt" && error.diagnostic.journalPath === file,
    );

    fs.writeFileSync(file, valid);
    const tampered = JSON.parse(valid);
    tampered.events[0].payload.messageId = "tampered";
    fs.writeFileSync(file, `${JSON.stringify(tampered, null, 2)}\n`);
    assert.equal(journal.inspect("venture-a").mode, "read-only");
    assert.match(journal.exportDiagnostics("venture-a").journal.message, /hash chain/);
  });

  it("opens a future schema read-only and migrates schema zero with one CAS revision", () => {
    const { root, journal } = fixture();
    fs.mkdirSync(path.dirname(journalFile(root)), { recursive: true });
    fs.writeFileSync(journalFile(root), `${JSON.stringify({
      schemaVersion: WORK_JOURNAL_SCHEMA_VERSION + 1,
      revision: 4,
      ventureId: "venture-a",
      events: [],
    })}\n`);
    const incompatible = journal.inspect("venture-a");
    assert.equal(incompatible.mode, "read-only");
    assert.equal(incompatible.diagnostic.code, "work_journal_schema_incompatible");
    assert.match(incompatible.diagnostic.steps[2], /supports the recorded schema/);

    fs.writeFileSync(journalFile(root), `${JSON.stringify({
      schemaVersion: 0,
      revision: 4,
      ventureId: "venture-a",
      events: [event("founder-turn-accepted", { messageId: "message-founder-1" })],
    })}\n`);
    assert.equal(journal.inspect("venture-a").mode, "migration-required");
    const migrated = journal.migrate("venture-a");
    assert.equal(migrated.schemaVersion, WORK_JOURNAL_SCHEMA_VERSION);
    assert.equal(migrated.revision, 5);
    assert.equal(migrated.events[0].sequence, 1);
    assert.equal(journal.inspect("venture-a").mode, "writable");
    assert.deepEqual(journal.readProjections("venture-a").runs.map((run) => run.id), ["run-1"]);
  });

  it("keeps large artifacts and hidden reasoning out of the hot journal", () => {
    const { journal } = fixture();
    assert.throws(
      () => journal.append("venture-a", event("factual-activity-recorded", {
        activityId: "activity-1",
        label: "Inspected the repository",
        hiddenReasoning: "private unshaped model prose",
      })),
      (error) => error.code === "work_journal_hidden_reasoning",
    );
    assert.throws(
      () => journal.append("venture-a", event("factual-activity-recorded", {
        activityId: "activity-1",
        label: "Inspected the repository",
        detail: "unshaped provider material",
      })),
      (error) => error.code === "work_journal_activity_unshaped",
    );
    assert.throws(
      () => journal.append("venture-a", event("checkpoint-recorded", {
        checkpointId: "checkpoint-1",
        inlinePatch: "x".repeat(70 * 1024),
      })),
      (error) => error.code === "work_journal_blob_too_large" && error.status === 413,
    );
    assert.equal(journal.events("venture-a").length, 0);
  });

  it("refuses semantically incomplete events before they become durable", () => {
    const { journal } = fixture();
    assert.throws(
      () => journal.append("venture-a", event("intervention-resolved", {
        interventionId: "never-opened",
        outcome: "answered",
      })),
      (error) => error.code === "work_journal_projection_invalid",
    );
    assert.equal(journal.inspect("venture-a").lastSequence, 0);
    assert.equal(journal.events("venture-a").length, 0);
  });
});
