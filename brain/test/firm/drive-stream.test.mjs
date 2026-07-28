// drive-stream.test.mjs — the payload-carrying per-drive delta channel (T3 streaming parity). Proves the
// regression this bus exists to kill: token deltas stream to the founder WITHOUT making the client rebuild
// the thread timeline. Also proves seq monotonicity and per-drive isolation, snapshot-then-delta framing,
// `?since=` replay and its honest fall back to a full snapshot, venture isolation on the SSE route, and the
// best-effort contract that a broken subscriber never breaks the drive that is streaming.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { founderHeaders } from "../helpers/founder-capability.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "drover-drive-stream-"));
process.env.GTM_IDE_HOME = root;
process.env.GTM_IDE_PERSISTENCE = "json";

const { default: dialogueRoutes } = await import("../../src/firm/dialogue-routes.mjs");
const { createVenture } = await import("../../src/firm/venture-store.mjs");
const { beginActiveDrive, listActiveDrives, noteDriveText, noteDriveToolInput, __resetActiveDrives } = await import("../../src/firm/active-drives.mjs");
const { subscribeFirmEvents } = await import("../../src/firm/firm-events.mjs");
const {
  driveSnapshot, dropDriveStream, publishDriveDelta, subscribeDriveDeltas, __resetDriveStreams,
} = await import("../../src/firm/drive-stream.mjs");

test.afterEach(() => {
  __resetActiveDrives();
  __resetDriveStreams();
});

test.after(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

// One SSE client: the same fake response shape the venture event-stream test uses, plus a reader that
// parses the frames back into { event, data } so a test asserts on what a real client would receive.
function openStream(pathname) {
  const writes = [];
  let closeHandler = null;
  const req = Readable.from([]);
  req.method = "GET";
  req.url = pathname;
  req.headers = founderHeaders({ method: "GET", path: pathname });
  req.on = (event, handler) => { if (event === "close") closeHandler = handler; return req; };
  let status = 0;
  let raw = "";
  const res = {
    writeHead(next) { status = next; },
    setHeader() {},
    write(chunk) { writes.push(chunk); },
    end(next) { raw += next ?? ""; },
  };
  const frames = () => writes.join("").split("\n\n")
    .map((frame) => frame.match(/^event: (?<event>[^\n]+)\ndata: (?<data>[\s\S]+)$/)?.groups)
    .filter(Boolean)
    .map(({ event, data }) => ({ event, data: JSON.parse(data) }));
  return dialogueRoutes({ req, res, url: new URL(pathname, "http://local") })
    .then((handled) => ({ handled, status, frames, close: () => closeHandler?.(), body: raw ? JSON.parse(raw) : null }));
}

test("seq is monotonic within a drive and isolated between drives", () => {
  assert.equal(publishDriveDelta("drive-a", { kind: "text", text: "one " }).seq, 1);
  assert.equal(publishDriveDelta("drive-a", { kind: "text", text: "two" }).seq, 2);
  assert.equal(publishDriveDelta("drive-b", { kind: "text", text: "elsewhere" }).seq, 1, "another drive starts its own count");

  assert.equal(driveSnapshot("drive-a").text, "one two");
  assert.equal(driveSnapshot("drive-a").seq, 2);
  assert.equal(driveSnapshot("drive-b").text, "elsewhere");
  assert.equal(driveSnapshot("drive-never-ran").seq, 0, "an unknown drive reads as an empty snapshot, not an error");

  dropDriveStream("drive-a");
  assert.deepEqual(driveSnapshot("drive-a"), { seq: 0, text: "", tool: null, thinking: null, todos: [], children: {}, nestedTasks: {} });
});

test("the snapshot folds every delta kind, and thinking carries shape only", () => {
  publishDriveDelta("drive-c", { kind: "text", text: "Reading the route." });
  publishDriveDelta("drive-c", { kind: "tool", name: "Read", partialInput: '{"path":"routes' });
  publishDriveDelta("drive-c", { kind: "thinking", state: "start" });
  publishDriveDelta("drive-c", { kind: "thinking", state: "stop", durationMs: 4_200 });
  publishDriveDelta("drive-c", { kind: "todo", items: [{ content: "Trace the seam", status: "in_progress" }, { content: "", status: "pending" }] });
  publishDriveDelta("drive-c", { kind: "child", parentToolUseId: "toolu_1", delta: { kind: "text", text: "subagent working" } });
  publishDriveDelta("drive-c", {
    kind: "nested-task",
    task: { taskId: "route-audit", label: "Checking routes", taskKind: "workflow", status: "running", totalCount: 18, completedCount: 0 },
  });
  publishDriveDelta("drive-c", {
    kind: "nested-task",
    task: { taskId: "route-audit", completedCount: 6, totalTokens: 12_400, elapsedMs: 9_000 },
  });
  publishDriveDelta("drive-c", {
    kind: "nested-task",
    task: { taskId: "silent-child", parentToolUseId: "route-audit", label: "Internal relay", status: "running", hidden: true },
  });

  const before = driveSnapshot("drive-c");
  assert.deepEqual(before.tool, { name: "Read", partialInput: '{"path":"routes' });
  assert.deepEqual(before.thinking, { state: "stop", durationMs: 4_200 }, "a thinking frame carries duration and never content");
  assert.deepEqual(before.todos, [{ content: "Trace the seam", status: "in_progress" }], "an empty plan item is dropped");
  assert.equal(before.children.toolu_1.text, "subagent working");
  assert.deepEqual(before.nestedTasks["route-audit"], {
    taskId: "route-audit",
    label: "Checking routes",
    taskKind: "workflow",
    status: "running",
    totalCount: 18,
    completedCount: 6,
    totalTokens: 12_400,
    elapsedMs: 9_000,
  }, "partial nested-task events merge without erasing the task identity or earlier facts");
  assert.deepEqual(before.nestedTasks["silent-child"], {
    taskId: "silent-child",
    parentTaskId: "route-audit",
    label: "Internal relay",
    status: "running",
    skipTranscript: true,
  }, "provider parent and hidden aliases normalize into the neutral transcript contract");

  publishDriveDelta("drive-c", { kind: "tool-result", name: "Read", target: "brain/src/firm/routes.mjs", status: "ok", detail: "48 lines" });
  assert.equal(driveSnapshot("drive-c").tool, null, "a returned tool closes the call that was forming");

  assert.equal(publishDriveDelta("drive-c", { kind: "not-a-kind", text: "x" }), null, "an unknown kind is dropped, never thrown");
  assert.equal(publishDriveDelta("drive-c", { kind: "child", parentToolUseId: "toolu_1", delta: { kind: "child", parentToolUseId: "toolu_2", delta: { kind: "text", text: "deep" } } }), null, "children never nest again");
  assert.equal(publishDriveDelta(null, { kind: "text", text: "x" }), null);
});

test("a throwing subscriber never breaks publishDriveDelta", () => {
  const heard = [];
  const unsubscribeBroken = subscribeDriveDeltas("drive-d", () => { throw new Error("this listener is broken"); });
  subscribeDriveDeltas("drive-d", (delta) => heard.push(delta.seq));

  assert.equal(publishDriveDelta("drive-d", { kind: "text", text: "still streams" }).seq, 1);
  assert.deepEqual(heard, [1], "the healthy subscriber still hears it");
  assert.equal(driveSnapshot("drive-d").text, "still streams");

  unsubscribeBroken();
  publishDriveDelta("drive-d", { kind: "text", text: " and again" });
  assert.deepEqual(heard, [1, 2]);
});

test("a subscriber gets the snapshot first, then live deltas", async () => {
  const venture = createVenture({ name: "drive stream snapshot" }, { root });
  const drive = beginActiveDrive({ ventureId: venture.id, teammateRef: "claude", betId: null, runtime: "claude-code", abortSupported: true });
  noteDriveText(drive.id, "Half-formed ");

  const stream = await openStream(`/api/ventures/${venture.id}/drives/${drive.id}/stream`);
  assert.equal(stream.handled, true);
  assert.equal(stream.status, 200);
  assert.deepEqual(stream.frames().map((frame) => frame.event), ["snapshot"]);
  assert.equal(stream.frames()[0].data.text, "Half-formed ");
  assert.equal(stream.frames()[0].data.seq, 1);

  noteDriveText(drive.id, "reply.");
  noteDriveToolInput(drive.id, "Bash", '{"command":"ls"');
  assert.deepEqual(stream.frames().map((frame) => frame.event), ["snapshot", "delta", "delta"]);
  assert.deepEqual(stream.frames()[1].data, { kind: "text", text: "reply.", seq: 2 });
  assert.deepEqual(stream.frames()[2].data, { kind: "tool", name: "Bash", partialInput: '{"command":"ls"', seq: 3 });

  stream.close();
  noteDriveText(drive.id, "after the client left");
  assert.equal(stream.frames().length, 3, "closing the connection unsubscribes");
  drive.finish();
});

test("?since replays only what a reconnect missed, and falls back to a full snapshot when it cannot", async () => {
  const venture = createVenture({ name: "drive stream replay" }, { root });
  const drive = beginActiveDrive({ ventureId: venture.id, teammateRef: "claude", betId: null, runtime: "claude-code", abortSupported: true });
  for (const word of ["one ", "two ", "three "]) noteDriveText(drive.id, word);

  const replay = await openStream(`/api/ventures/${venture.id}/drives/${drive.id}/stream?since=1`);
  assert.deepEqual(replay.frames().map((frame) => frame.event), ["delta", "delta"]);
  assert.deepEqual(replay.frames().map((frame) => frame.data.text), ["two ", "three "]);

  const current = await openStream(`/api/ventures/${venture.id}/drives/${drive.id}/stream?since=3`);
  assert.deepEqual(current.frames(), [], "a caught-up reconnect replays nothing");

  // Past the retained window: the client asks for a seq this drive never reached, and for one older than
  // anything still held. Both degrade to the full snapshot, which is always enough to catch up.
  const ahead = await openStream(`/api/ventures/${venture.id}/drives/${drive.id}/stream?since=99`);
  assert.deepEqual(ahead.frames().map((frame) => frame.event), ["snapshot"]);
  assert.equal(ahead.frames()[0].data.text, "one two three ");

  for (let i = 0; i < 600; i += 1) noteDriveText(drive.id, `${i} `);
  const stale = await openStream(`/api/ventures/${venture.id}/drives/${drive.id}/stream?since=2`);
  assert.deepEqual(stale.frames().map((frame) => frame.event), ["snapshot"], "older than the replay window falls back");
  assert.equal(stale.frames()[0].data.seq, 603);

  const garbage = await openStream(`/api/ventures/${venture.id}/drives/${drive.id}/stream?since=not-a-number`);
  assert.deepEqual(garbage.frames().map((frame) => frame.event), ["snapshot"]);

  for (const stream of [replay, current, ahead, stale, garbage]) stream.close();
  drive.finish();
});

test("a drive is readable only through its own venture's URL", async () => {
  const owner = createVenture({ name: "drive stream owner" }, { root });
  const other = createVenture({ name: "drive stream neighbour" }, { root });
  const drive = beginActiveDrive({ ventureId: owner.id, teammateRef: "claude", betId: null, runtime: "claude-code", abortSupported: true });
  noteDriveText(drive.id, "Owner-only presence.");

  const crossVenture = await openStream(`/api/ventures/${other.id}/drives/${drive.id}/stream`);
  assert.equal(crossVenture.status, 404);
  assert.deepEqual(crossVenture.frames(), [], "not a single frame of another venture's drive is written");

  const unknownVenture = await openStream(`/api/ventures/no-such-venture/drives/${drive.id}/stream`);
  assert.equal(unknownVenture.status, 404, "the venture read guard still fails closed first");

  const settled = await openStream(`/api/ventures/${owner.id}/drives/drive-does-not-exist/stream`);
  assert.equal(settled.status, 404);

  const owned = await openStream(`/api/ventures/${owner.id}/drives/${drive.id}/stream`);
  assert.equal(owned.status, 200);
  assert.equal(owned.frames()[0].data.text, "Owner-only presence.");
  owned.close();
  drive.finish();
});

test("the stream seam's optional passthroughs publish to the drive's own channel", async () => {
  const { buildStreamSeam, __resetLiveRuns } = await import("../../src/firm/work-loop-stream.mjs");
  const drive = beginActiveDrive({ ventureId: "seam-venture", teammateRef: "claude", betId: null, runtime: "claude-code", abortSupported: true });
  let work = { runtimeSessionId: "claude-code:s1", resumeSessionAt: null };
  const seam = buildStreamSeam({
    activeDrive: drive, receipts: { record: () => {} }, narration: [], ventureId: "seam-venture",
    getWork: () => work, putWork: (next) => { work = next; },
  });

  seam.onThinking?.({ state: "start" });
  seam.onToolResult?.({ name: "Edit", target: "brain/src/firm/drive-stream.mjs", status: "ok", detail: "1 hunk" });
  seam.onTodos?.([{ content: "Ship the delta channel", status: "in_progress" }]);
  seam.onChildDelta?.({ parentToolUseId: "toolu_9", delta: { kind: "text", text: "explorer subagent" } });

  const snapshot = driveSnapshot(drive.id);
  assert.deepEqual(snapshot.thinking, { state: "start", durationMs: null });
  assert.deepEqual(snapshot.todos, [{ content: "Ship the delta channel", status: "in_progress" }]);
  assert.equal(snapshot.children.toolu_9.text, "explorer subagent");
  assert.equal(snapshot.seq, 4, "each passthrough stamped exactly one delta");

  // The same three facts must also land on the drive record itself, because a client with no delta
  // stream open reads them off the thread timeline instead.
  const record = listActiveDrives("seam-venture").find((entry) => entry.id === drive.id);
  assert.equal(record.liveThinking.state, "start");
  assert.equal(record.liveToolResults.at(-1).target, "brain/src/firm/drive-stream.mjs");
  assert.deepEqual(record.liveTodos, [{ content: "Ship the delta channel", status: "in_progress" }]);

  // An adapter that produces none of these is unchanged: nothing here is required for a run to work.
  assert.doesNotThrow(() => seam.onToolResult?.());
  __resetLiveRuns();
  drive.finish();
});

test("streaming 10k tokens costs one fallback refetch ping per second, not one per token", () => {
  const drive = beginActiveDrive({ ventureId: "refetch-venture", teammateRef: "claude", betId: null, runtime: "claude-code", abortSupported: true });
  const pings = [];
  const unsubscribe = subscribeFirmEvents("refetch-venture", (event) => { if (event.kind === "drive") pings.push(event); });
  const deltas = [];
  subscribeDriveDeltas(drive.id, (delta) => deltas.push(delta));

  // A whole second of streaming at a rate no provider reaches: 10k deltas, one every 0.1 ms.
  let clock = 1_000_000;
  for (let i = 0; i < 10_000; i += 1) noteDriveText(drive.id, "tok ", { now: () => (clock += 0.1) });

  assert.equal(deltas.length, 10_000, "every token reached the founder on the payload channel");
  assert.equal(pings.length, 1, "the data-free refetch ping fires on the ~1s fallback cadence, never per token");
  assert.equal(deltas.at(-1).seq, 10_000);

  clock += 1_000;
  noteDriveText(drive.id, "next second", { now: () => clock });
  assert.equal(pings.length, 2, "the degraded path still gets a ping about once a second");

  unsubscribe();
  drive.finish();
});
