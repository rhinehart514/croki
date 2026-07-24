// work-delta.test.mjs — the typed-delta event path (Reshape decisions 27/28). Proves three things:
//   1. normalizeWorkDelta is total and safe: every union member normalizes, unknown types and junk drop
//      to null, lengths cap, and NO free-form field can smuggle prose/content through.
//   2. emitWorkDelta rides the venture-scoped firm-events bus as the additive `work-delta` kind, carrying
//      its typed payload, while every OTHER kind stays strictly data-free — and it frames over SSE as a
//      real `event: work-delta` frame a browser client parses.
//   3. The work loop emits the natural deltas at its safe seams (drive start/settle, tool step
//      started/finished with a measured duration) through active-drives.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { founderHeaders } from "../helpers/founder-capability.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "drover-work-delta-"));
process.env.GTM_IDE_HOME = root;
process.env.GTM_IDE_PERSISTENCE = "json";

const { default: dialogueRoutes } = await import("../../src/firm/dialogue-routes.mjs");
const { createVenture } = await import("../../src/firm/venture-store.mjs");
const { emitFirmEvent, subscribeFirmEvents } = await import("../../src/firm/firm-events.mjs");
const { normalizeWorkDelta, emitWorkDelta } = await import("../../src/firm/work-delta.mjs");
const {
  beginActiveDrive, noteDriveToolInput, noteDriveToolResult, __resetActiveDrives,
} = await import("../../src/firm/active-drives.mjs");

test.afterEach(() => {
  __resetActiveDrives();
});

test.after(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

// Collect every event a venture-scoped subscriber hears, then unsubscribe.
function collect(ventureId, run) {
  const heard = [];
  const unsubscribe = subscribeFirmEvents(ventureId, (event) => heard.push(event));
  try {
    run();
  } finally {
    unsubscribe();
  }
  return heard;
}

test("normalizeWorkDelta accepts each union member and keeps only its safe fields", () => {
  assert.deepEqual(
    normalizeWorkDelta({ type: "step-started", stepId: "d:1", label: "Read", extra: "dropped" }),
    { type: "step-started", stepId: "d:1", label: "Read" },
  );
  assert.deepEqual(
    normalizeWorkDelta({ type: "step-finished", stepId: "d:1", label: "Bash", status: "ok", durationMs: 42.6 }),
    { type: "step-finished", stepId: "d:1", label: "Bash", status: "ok", durationMs: 43 },
  );
  assert.deepEqual(
    normalizeWorkDelta({ type: "source-consulted", label: "docs", ref: "https://x/y" }),
    { type: "source-consulted", label: "docs", ref: "https://x/y" },
  );
  assert.deepEqual(
    normalizeWorkDelta({ type: "status-changed", status: "working", previous: "idle" }),
    { type: "status-changed", status: "working", previous: "idle" },
  );
});

test("normalizeWorkDelta drops junk and never carries a free-form prose field", () => {
  assert.equal(normalizeWorkDelta({ type: "nope" }), null, "unknown type drops");
  assert.equal(normalizeWorkDelta(null), null);
  assert.equal(normalizeWorkDelta({ type: "step-started", label: "Read" }), null, "a missing stepId drops");
  assert.equal(normalizeWorkDelta({ type: "step-finished", stepId: "d:1" }), null, "a missing label drops");

  // Any field outside the whitelist — detail/text/body/content — cannot survive: it is simply not read.
  const normalized = normalizeWorkDelta({
    type: "step-finished", stepId: "d:1", label: "Bash", status: "ok", durationMs: 1,
    detail: "raw model prose", text: "chain of thought", body: "file contents", secret: "token",
  });
  assert.deepEqual(Object.keys(normalized).sort(), ["durationMs", "label", "status", "stepId", "type"].sort());

  // Defaults and caps.
  assert.equal(normalizeWorkDelta({ type: "step-finished", stepId: "d:1", label: "Bash" }).status, "ok");
  assert.equal(normalizeWorkDelta({ type: "step-finished", stepId: "d:1", label: "Bash" }).durationMs, null);
  assert.equal(normalizeWorkDelta({ type: "step-started", stepId: "d:1", label: "x".repeat(500) }).label.length, 120);
});

test("emitWorkDelta rides the firm-events bus as work-delta; other kinds stay data-free", () => {
  const heard = collect("venture-a", () => {
    // Data-free invalidation cannot be tricked into carrying a payload, even if one is passed.
    emitFirmEvent("venture-a", "lens", { delta: { type: "status-changed", status: "working" } });
    // The typed delta rides as work-delta, keyed to a bet subject.
    const delivered = emitWorkDelta("venture-a", {
      betId: "bet-1", delta: { type: "step-started", stepId: "d:1", label: "Read" },
    });
    assert.equal(delivered, 1);
    // A junk delta is dropped with no emission.
    assert.equal(emitWorkDelta("venture-a", { delta: { type: "nope" } }), 0);
  });

  assert.equal(heard.length, 2);
  const [lens, work] = heard;
  assert.equal(lens.kind, "lens");
  assert.equal(lens.delta, undefined, "a data-free kind never carries a delta payload");
  assert.equal(work.kind, "work-delta");
  assert.equal(work.betId, "bet-1");
  assert.deepEqual(work.delta, { type: "step-started", stepId: "d:1", label: "Read" });
});

test("a work-delta frames over SSE as an event a browser client parses", async () => {
  const venture = createVenture({ name: "work delta sse" }, { root });
  const pathname = `/api/ventures/${venture.id}/events`;
  const writes = [];
  let closeHandler = null;
  const req = Readable.from([]);
  req.method = "GET";
  req.url = pathname;
  req.headers = founderHeaders({ method: "GET", path: pathname });
  req.on = (event, handler) => { if (event === "close") closeHandler = handler; return req; };
  const res = { writeHead() {}, setHeader() {}, write(chunk) { writes.push(chunk); }, end() {} };
  const handled = await dialogueRoutes({ req, res, url: new URL(pathname, "http://local") });
  assert.equal(handled, true);

  emitWorkDelta(venture.id, { threadRef: "thread:1", delta: { type: "step-finished", stepId: "d:1", label: "Bash", status: "ok", durationMs: 12 } });

  const frames = writes.join("").split("\n\n")
    .map((frame) => frame.match(/^event: (?<event>[^\n]+)\ndata: (?<data>[\s\S]+)$/)?.groups)
    .filter(Boolean)
    .map(({ event, data }) => ({ event, data: JSON.parse(data) }));
  assert.deepEqual(frames.map((frame) => frame.event), ["work-delta"]);
  assert.equal(frames[0].data.kind, "work-delta");
  assert.equal(frames[0].data.threadRef, "thread:1");
  assert.deepEqual(frames[0].data.delta, { type: "step-finished", stepId: "d:1", label: "Bash", status: "ok", durationMs: 12 });
  closeHandler?.();
});

test("the work loop emits deltas at its safe seams: start, step started/finished, settle", () => {
  const venture = createVenture({ name: "work delta seams" }, { root });
  let clock = 1_000;
  const now = () => clock;

  const heard = collect(venture.id, () => {
    const drive = beginActiveDrive({ ventureId: venture.id, teammateRef: "claude", betId: "bet-9", runtime: "claude-code", abortSupported: true });
    // A tool block opens: one step-started, minted once even across repeated partial-argument deltas.
    noteDriveToolInput(drive.id, "Read", '{"path":"a', { now });
    noteDriveToolInput(drive.id, "Read", '{"path":"a.txt"', { now });
    clock = 1_075;
    noteDriveToolResult(drive.id, { name: "Read", target: "a.txt", status: "ok", detail: "SECRET FILE BODY" }, { now });
    drive.finish();
  });

  const deltas = heard.filter((event) => event.kind === "work-delta").map((event) => event.delta);
  assert.deepEqual(deltas[0], { type: "status-changed", status: "working", previous: "idle" });
  assert.equal(deltas[1].type, "step-started");
  assert.equal(deltas[1].label, "Read");
  assert.match(deltas[1].stepId, /^drive-.+:1$/, "step id is drive-scoped and sequenced");
  assert.equal(deltas.filter((delta) => delta.type === "step-started").length, 1, "step-started fires once per tool block");
  const finished = deltas.find((delta) => delta.type === "step-finished");
  assert.equal(finished.label, "Read");
  assert.equal(finished.status, "ok");
  assert.equal(finished.durationMs, 75, "the measured duration is start→result");
  assert.equal(finished.stepId, deltas[1].stepId, "finished correlates to the started step");
  assert.deepEqual(deltas.at(-1), { type: "status-changed", status: "settled", previous: "working" });
  // The result body never leaves the drive-scoped stream: no venture delta carries it.
  assert.ok(!JSON.stringify(deltas).includes("SECRET FILE BODY"));
  // Every work-delta on this venture was keyed to the drive's bet, so a focused node can filter to itself.
  assert.ok(heard.filter((e) => e.kind === "work-delta").every((e) => e.betId === "bet-9"));
});
