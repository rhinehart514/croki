import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "firm-thread-timeline-"));
process.env.GTM_IDE_HOME = root;
process.env.GTM_IDE_PERSISTENCE = "json";

const { createVenture, setVentureDoc } = await import("../../src/firm/venture-store.mjs");
const { createBet } = await import("../../src/firm/bet.mjs");
const { appendConversationMessage } = await import("../../src/firm/conversation.mjs");
const { ensureDirectionThread, getSemanticModel, recordRun } = await import("../../src/firm/semantic-model-store.mjs");
const { buildThreadTimeline } = await import("../../src/firm/thread-timeline.mjs");
const { buildWorkIndex } = await import("../../src/firm/work-index.mjs");
const { applyFirmConfiguration, getFirmConfiguration } = await import("../../src/firm/configuration.mjs");
const { beginActiveDrive, __resetActiveDrives } = await import("../../src/firm/active-drives.mjs");
const { appendEvent } = await import("../../src/firm/work-loop-tools.mjs");

const options = { root };

function fixture() {
  const venture = createVenture({ name: "timeline" }, options);
  const configuration = getFirmConfiguration(venture.id, options);
  applyFirmConfiguration({
    ventureId: venture.id,
    expectedRevision: configuration.revision,
    configuration: {
      ...configuration,
      agents: [{ ref: "codex", name: "Mara", activation: "direct-or-relevant", capabilities: { firmTools: true }, context: {}, memory: {}, runtime: {}, budget: {}, authority: { outwardEffects: "wall" }, evaluation: {} }],
    },
  }, options);
  const bet = createBet({ ventureId: venture.id, intent: "Improve onboarding", teammateRef: "codex" });
  const staged = { id: "onboarding-flow", title: "Job-first flow", content: { kind: "flow", steps: [{ id: "job", label: "Choose current job" }, { id: "log", label: "Log observation" }], edges: [{ from: "job", to: "log" }] }, stagedAt: "2026-07-19T10:02:00.000Z" };
  setVentureDoc(venture.id, "bets", bet.id, { ...bet, staged: [staged], evidence: [{ id: "quote-1", body: "I lose context between visits." }] }, options);
  const founder = appendConversationMessage({ ventureId: venture.id, role: "founder", content: "Make setup feel immediate.", betId: bet.id }, options);
  const returned = appendConversationMessage({ ventureId: venture.id, role: "teammate", teammateRef: "codex", content: "I traced the current setup.", betId: bet.id }, options);
  const thread = ensureDirectionThread(venture.id, { name: bet.intent, originMessageRef: founder.id, subjectRefs: [`bet:${bet.id}`], at: "2026-07-19T10:00:00.000Z" }, options);
  recordRun(venture.id, { id: "run-one", threadRef: thread.threadRef, betRefs: [`bet:${bet.id}`], originMessageRef: `conversation:${founder.id}`, participantRefs: [], eventRefs: [], workRefs: [], decisionRefs: [], outcomeRefs: [], scopeRefs: [], createdAt: "2026-07-19T10:01:00.000Z" }, { at: "2026-07-19T10:01:00.000Z" }, options);
  return { venture, bet, staged, returned, thread };
}

describe("thread timeline projection", () => {
  it("projects an empty venture root without creating durable thread state", () => {
    const venture = createVenture({ name: "empty timeline" }, options);
    const timeline = buildThreadTimeline(venture.id, "venture-root", options);

    assert.equal(timeline.thread.threadRef, "thread:venture-root");
    assert.equal(timeline.items.find((item) => item.kind === "return-summary").counts.total, 0);
    assert.equal(getSemanticModel(venture.id, options).threads.length, 0);
  });

  it("joins legacy bet messages, structured work, evidence, activity, and map without another store", () => {
    const fx = fixture();
    const timeline = buildThreadTimeline(fx.venture.id, fx.thread.threadRef.replace(/^thread:/, ""), options);
    assert.ok(timeline.items.some((item) => item.ref === `conversation:${fx.returned.id}`), "bet fallback joins the returned message without backfill");
    assert.equal(timeline.items.find((item) => item.ref === `conversation:${fx.returned.id}`).participantLabel, "Mara");
    assert.ok(timeline.items.some((item) => item.kind === "artifact" && item.ref === `work:${fx.staged.id}`));
    assert.ok(timeline.items.some((item) => item.kind === "evidence"));
    assert.ok(timeline.visuals.some((item) => item.kind === "flow" && item.ref === `work:${fx.staged.id}`));
    assert.ok(timeline.visuals.some((item) => item.kind === "map"));
  });

  it("projects exact durable changes on a work handoff", () => {
    const fx = fixture();
    const changes = { openedBetIds: [fx.bet.id], stagedBetIds: [fx.bet.id], wallBetIds: [] };
    const handoff = appendConversationMessage({
      ventureId: fx.venture.id,
      role: "system",
      kind: "handoff",
      content: "Work landed on the canvas.",
      betId: fx.bet.id,
      changes,
    }, options);

    const timeline = buildThreadTimeline(fx.venture.id, fx.thread.threadRef.replace(/^thread:/, ""), options);
    assert.deepEqual(timeline.items.find((item) => item.ref === `conversation:${handoff.id}`).changes, changes);
  });

  it("keeps artifact identity stable across a content revision and searches inside its body", () => {
    const fx = fixture();
    const first = buildThreadTimeline(fx.venture.id, fx.thread.threadRef.replace(/^thread:/, ""), options);
    const revised = { ...fx.staged, content: { ...fx.staged.content, steps: [...fx.staged.content.steps, { id: "history", label: "See property history" }] }, updatedAt: "2026-07-19T10:03:00.000Z" };
    setVentureDoc(fx.venture.id, "bets", fx.bet.id, { ...fx.bet, staged: [revised], evidence: [] }, options);
    const second = buildThreadTimeline(fx.venture.id, fx.thread.threadRef.replace(/^thread:/, ""), options);
    assert.equal(first.items.find((item) => item.ref === `work:${fx.staged.id}`).id, second.items.find((item) => item.ref === `work:${fx.staged.id}`).id);
    const search = buildWorkIndex(fx.venture.id, { ...options, query: "property history" });
    assert.equal(search.items[0].matchRefs[0].ref, `work:${fx.staged.id}`);
    assert.equal(search.counts.total, 1);
    assert.equal(search.counts.matchCount, 1);
  });

  it("projects the venture return summary from current thread attention", () => {
    const fx = fixture();
    const timeline = buildThreadTimeline(fx.venture.id, "venture-root", options);
    const returned = timeline.items.find((item) => item.kind === "return-summary");
    assert.ok(returned, "the venture root carries a return summary instead of a dashboard");
    assert.equal(returned.actions[0].threadRef, fx.thread.threadRef);
    assert.ok(returned.counts.attention >= 1);
  });

  it("projects inspectable tool receipts for live work without model reasoning", () => {
    const fx = fixture();
    const drive = beginActiveDrive({ ventureId: fx.venture.id, teammateRef: "codex", betId: fx.bet.id, runtime: "codex", abortSupported: true });
    try {
      appendEvent(fx.venture.id, fx.bet.id, { id: "event-search", type: "tool_started", detail: "search_repository", durationMs: 145 }, options);
      appendEvent(fx.venture.id, fx.bet.id, { id: "event-private", type: "text", detail: "private internal reasoning" }, options);
      appendEvent(fx.venture.id, fx.bet.id, { id: "event-read", type: "tool_started", detail: "read_repository_excerpt", durationMs: 1_420 }, options);
      const timeline = buildThreadTimeline(fx.venture.id, fx.thread.threadRef.replace(/^thread:/, ""), options);
      const status = timeline.items.find((item) => item.kind === "agent-status");
      assert.deepEqual(status.activitySteps.map((step) => step.label), ["Searched the repository", "Read source evidence"]);
      assert.deepEqual(status.activitySteps.map((step) => step.durationMs), [145, 1_420]);
      assert.equal(JSON.stringify(status.activitySteps).includes("private internal reasoning"), false);
    } finally {
      drive.finish();
      __resetActiveDrives();
    }
  });

  it("compares coding attempts with the facts needed for founder judgment", () => {
    const fx = fixture();
    const base = {
      kind: "native-code", ventureId: fx.venture.id, threadRef: fx.thread.threadRef, betId: fx.bet.id,
      repository: "/repo", sourceHead: "abc", worktree: null, runRefs: [], checkpoints: [], commands: [], changedFiles: [],
      diff: "", patchHash: "hash", currentActivity: null, consequence: null, createdAt: "2026-07-19T10:03:00.000Z", updatedAt: "2026-07-19T10:03:00.000Z",
    };
    setVentureDoc(fx.venture.id, "codeWorkspaces", "reviewable", {
      ...base, id: "reviewable", goal: "Reviewable approach", branch: "drover/reviewable", participantRefs: ["codex"], providerSessions: [],
      verification: [{ command: "npm test", status: "passed" }], changedFiles: [{ status: "M", path: "product.ts" }], diffStat: "1 file changed", status: "reviewable",
    }, options);
    setVentureDoc(fx.venture.id, "codeWorkspaces", "interrupted", {
      ...base, id: "interrupted", goal: "Interrupted approach", branch: "drover/interrupted", participantRefs: ["codex"], providerSessions: [],
      verification: [], diffStat: "", status: "interrupted", interruption: { message: "Provider stopped", recovery: "Resume from the retained worktree", at: "2026-07-19T10:04:00.000Z" },
    }, options);

    const timeline = buildThreadTimeline(fx.venture.id, fx.thread.threadRef.replace(/^thread:/, ""), options);
    const comparison = timeline.items.find((item) => item.ref === `${fx.thread.threadRef}#code-attempts`);
    const reviewable = comparison.alternatives.find((alternative) => alternative.id === "reviewable");
    const interrupted = comparison.alternatives.find((alternative) => alternative.id === "interrupted");

    assert.deepEqual(reviewable.items.map((item) => item.label), ["Status", "Changes", "Verification", "Branch", "Agent"]);
    assert.equal(reviewable.items.find((item) => item.label === "Verification").detail, "1 passed");
    assert.equal(interrupted.items.find((item) => item.label === "Verification").detail, "No verification receipts");
    assert.equal(interrupted.items.find((item) => item.label === "Recovery").detail, "Resume from the retained worktree");
  });
});
