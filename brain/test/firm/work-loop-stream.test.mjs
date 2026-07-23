import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "drover-work-loop-stream-"));
process.env.GTM_IDE_HOME = root;
process.env.GTM_IDE_PERSISTENCE = "json";

const { beginActiveDrive, listActiveDrives, __resetActiveDrives } = await import("../../src/firm/active-drives.mjs");
const { buildStreamSeam, findLiveRun, registerLiveRun, steerLiveRun, __resetLiveRuns } = await import("../../src/firm/work-loop-stream.mjs");

function fakeHandle() {
  const steers = [];
  const models = [];
  return {
    steers,
    models,
    steer: (text, attachments) => { steers.push({ text, attachments }); return true; },
    setModel: async (model) => { models.push(model); },
  };
}

test.afterEach(() => {
  __resetLiveRuns();
  __resetActiveDrives();
});

test.after(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

test("a founder message steers the live run matched by effort or Thread onto the same turn", () => {
  const handle = fakeHandle();
  registerLiveRun({ driveId: "drive-1", ventureId: "v1", betId: "bet-1", threadRef: "thread:t1", handle });

  assert.equal(findLiveRun({ ventureId: "v1", betId: "bet-1" })?.driveId, "drive-1");
  assert.equal(findLiveRun({ ventureId: "v1", threadRef: "thread:t1" })?.driveId, "drive-1");
  assert.equal(findLiveRun({ ventureId: "other", betId: "bet-1" }), null, "venture isolation holds for live runs");

  const steered = steerLiveRun({ ventureId: "v1", betId: "bet-1", text: "  Lead with pricing.  ", model: "claude-opus" });
  assert.deepEqual(steered, { driveId: "drive-1", betId: "bet-1", threadRef: "thread:t1" });
  assert.deepEqual(handle.steers, [{ text: "Lead with pricing.", attachments: [] }]);
  assert.deepEqual(handle.models, ["claude-opus"], "a model change on the steer rides the SDK's own control");
});

test("a steer against a settled queue falls back instead of vanishing", () => {
  registerLiveRun({ driveId: "drive-2", ventureId: "v1", betId: "bet-2", handle: { steer: () => false } });
  assert.equal(steerLiveRun({ ventureId: "v1", betId: "bet-2", text: "Too late" }), null);
  assert.equal(findLiveRun({ ventureId: "v1", betId: "bet-2" }), null, "the stale entry is dropped so the durable queue owns the steer");
  assert.equal(steerLiveRun({ ventureId: "v1", betId: "bet-2", text: "   " }), null, "an empty steer never reaches a run");
});

function seamFixture() {
  const activeDrive = beginActiveDrive({ ventureId: "v1", teammateRef: "claude", betId: "bet-1", runtime: "claude-code", abortSupported: true });
  const recorded = [];
  const narration = [];
  let work = { runtimeSessionId: "claude-code:s1", resumeSessionAt: null, stepCount: 0, spentUsd: 0, pausedFor: null };
  const checkpoints = [];
  const seam = buildStreamSeam({
    activeDrive,
    receipts: { record: (receipt) => recorded.push(receipt) },
    narration,
    ventureId: "v1",
    betId: "bet-1",
    threadRef: "thread:t1",
    getWork: () => work,
    putWork: (next) => { work = next; checkpoints.push(next); },
  });
  return { activeDrive, seam, recorded, narration, checkpoints, getWork: () => work };
}

test("streamed deltas own the live reply; the complete message never doubles it", () => {
  const { activeDrive, seam, recorded, narration } = seamFixture();
  seam.onTextDelta("Working ");
  seam.onTextDelta("on it.");
  seam.onText("Working on it.");
  const drive = listActiveDrives("v1").find((entry) => entry.id === activeDrive.id);
  assert.equal(drive.liveText, "Working on it.");
  assert.deepEqual(recorded, [{ type: "text", detail: "Working on it." }], "the durable receipt still lands once");
  assert.deepEqual(narration, ["Working on it."]);
  activeDrive.finish();
});

test("a non-streaming adapter keeps the whole-message live reply path", () => {
  const { activeDrive, seam } = seamFixture();
  seam.onText("Complete reply.");
  assert.equal(listActiveDrives("v1").find((entry) => entry.id === activeDrive.id).liveText, "Complete reply.");
  activeDrive.finish();
});

test("forming tool arguments surface on the drive and clear when the block closes", () => {
  const { activeDrive, seam } = seamFixture();
  seam.onToolInputDelta("Bash", '{"command":"ls"');
  assert.deepEqual(
    listActiveDrives("v1").find((entry) => entry.id === activeDrive.id).liveTool,
    { name: "Bash", partialInput: '{"command":"ls"' },
  );
  seam.onToolInputDelta(null, null);
  assert.equal(listActiveDrives("v1").find((entry) => entry.id === activeDrive.id).liveTool, null);
  activeDrive.finish();
});

test("the resume cursor checkpoints once per fresh assistant uuid onto the same work record", () => {
  const { activeDrive, seam, checkpoints, getWork } = seamFixture();
  seam.onResumeCursor({ resumeSessionAt: "uuid-1" });
  seam.onResumeCursor({ resumeSessionAt: "uuid-1" });
  seam.onResumeCursor({});
  seam.onResumeCursor({ resumeSessionAt: "uuid-2" });
  assert.deepEqual(checkpoints.map((entry) => entry.resumeSessionAt), ["uuid-1", "uuid-2"]);
  assert.equal(getWork().runtimeSessionId, "claude-code:s1", "the cursor rides the record that already carries the session id");
  activeDrive.finish();
});

test("the run handle is live exactly while the adapter holds its turn open", () => {
  const { activeDrive, seam } = seamFixture();
  const handle = fakeHandle();
  seam.onRunHandle(handle);
  const steered = steerLiveRun({ ventureId: "v1", threadRef: "thread:t1", text: "Steer mid-turn" });
  assert.equal(steered?.driveId, activeDrive.id);
  assert.deepEqual(handle.steers, [{ text: "Steer mid-turn", attachments: [] }]);
  seam.onRunHandle(null);
  assert.equal(steerLiveRun({ ventureId: "v1", threadRef: "thread:t1", text: "After the turn" }), null);
  activeDrive.finish();
});
