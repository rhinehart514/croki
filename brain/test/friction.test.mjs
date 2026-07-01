import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { reportFriction, listFrictionQueue } from "../src/friction.mjs";
import { TOOL_MAP } from "../src/mcp.mjs";

function tmpQueue() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "friction-queue-"));
}

test("reportFriction writes one agent-readable markdown item with the snapshot attached", () => {
  const queueDir = tmpQueue();
  const record = reportFriction(
    {
      report: "The gate card hid the citation under the fold",
      kind: "bug",
      context: "Reviewing a RodentRadar draft at the gate",
      snapshot: { project: { id: "proj-1" }, needsFounder: [{ sessionId: "s1", gateNodeIds: ["g1"] }] },
      source: "test",
    },
    { queueDir, now: "2026-07-01T12:00:00.000Z", gitSha: "abc123" },
  );

  assert.equal(record.queued, true);
  assert.equal(record.kind, "bug");
  assert.equal(record.gitSha, "abc123");
  assert.ok(record.file.startsWith(queueDir));

  const text = fs.readFileSync(record.file, "utf8");
  assert.match(text, /^---\nkind: bug\nstatus: open\n/);
  assert.match(text, /captured_at: 2026-07-01T12:00:00\.000Z/);
  assert.match(text, /git_sha: abc123/);
  assert.match(text, /source: test/);
  assert.match(text, /The gate card hid the citation under the fold/);
  assert.match(text, /## What was happening/);
  assert.match(text, /Reviewing a RodentRadar draft at the gate/);
  assert.match(text, /## Snapshot/);
  assert.match(text, /"sessionId": "s1"/);
});

test("reportFriction refuses an empty report and never invents a git sha", () => {
  const queueDir = tmpQueue();
  assert.throws(() => reportFriction({ report: "   " }, { queueDir }), /needs the words/);

  const record = reportFriction({ report: "queue empty-sha case" }, { queueDir, gitSha: null, now: "2026-07-01T12:00:00.000Z" });
  const text = fs.readFileSync(record.file, "utf8");
  assert.equal(record.gitSha, null);
  assert.match(text, /git_sha: unknown/);
});

test("reportFriction defaults unknown kinds to friction and survives filename collisions", () => {
  const queueDir = tmpQueue();
  const opts = { queueDir, now: "2026-07-01T12:00:00.000Z", gitSha: "abc" };
  const a = reportFriction({ report: "same words same second", kind: "explosion" }, opts);
  const b = reportFriction({ report: "same words same second" }, opts);
  assert.equal(a.kind, "friction");
  assert.notEqual(a.file, b.file);
  assert.ok(fs.existsSync(a.file) && fs.existsSync(b.file));
});

test("listFrictionQueue reads the queue back with kind, status, and a summary line", () => {
  const queueDir = tmpQueue();
  reportFriction({ report: "First annoyance", kind: "wish" }, { queueDir, now: "2026-07-01T12:00:00.000Z", gitSha: "abc" });
  reportFriction({ report: "Second annoyance" }, { queueDir, now: "2026-07-01T12:00:01.000Z", gitSha: "abc" });

  const { reports } = listFrictionQueue({ queueDir });
  assert.equal(reports.length, 2);
  assert.equal(reports[0].kind, "wish");
  assert.equal(reports[0].status, "open");
  assert.equal(reports[0].summary, "First annoyance");

  const empty = listFrictionQueue({ queueDir: path.join(queueDir, "does-not-exist") });
  assert.deepEqual(empty.reports, []);
});

test("report_friction is exposed on the MCP front door and posts to the brain", () => {
  const tool = TOOL_MAP.get("report_friction");
  assert.ok(tool, "report_friction must be registered on the MCP server");
  assert.deepEqual(tool.inputSchema.required, ["report"]);
  // The wall stays intact: filing friction is not an outbound/approval verb.
  assert.doesNotMatch(tool.name, /approve|send|publish|deploy|charge/i);
});
