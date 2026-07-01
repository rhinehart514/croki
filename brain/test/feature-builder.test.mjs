import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildFeatureRequest, enqueueFeatureRequest, builderPrompt } from "../src/feature-builder.mjs";
import { TOOL_MAP } from "../src/mcp.mjs";

function tmpQueue() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "feature-queue-"));
}

// A scripted git fake: answers by subcommand, records every call.
function fakeGit(answers = {}) {
  const calls = [];
  const git = (args, cwd) => {
    calls.push({ args: [...args], cwd });
    const key = args.filter((a) => !a.startsWith("-")).slice(0, 2).join(" ");
    for (const [prefix, value] of Object.entries(answers)) {
      if (key.startsWith(prefix) || args.join(" ").includes(prefix)) {
        return typeof value === "function" ? value(args) : value;
      }
    }
    return "";
  };
  git.calls = calls;
  return git;
}

const BASE_OPTS = { now: "2026-07-01T15:00:00.000Z", gitSha: "host-sha", repoRoot: "/repo" };

test("a successful build lands ready-for-review with the branch recorded and the worktree removed", async () => {
  const queueDir = tmpQueue();
  const git = fakeGit({
    "rev-parse": "base-sha",
    "status": "", // builder committed its own work
    "rev-list": "2",
    "diff": " brain/src/x.mjs | 10 +++++",
  });
  const result = await buildFeatureRequest(
    { report: "Show all ventures in one queue", context: "Working in RodentRadar" },
    { ...BASE_OPTS, queueDir, git, runQuery: async () => ({ text: "Built the cross-venture queue. Tests pass.", error: null }) },
  );

  assert.equal(result.status, "ready-for-review");
  assert.match(result.branch, /^dogfood\/2026-07-01-150000-show-all-ventures/);
  assert.equal(result.commits, 2);

  const text = fs.readFileSync(result.file, "utf8");
  assert.match(text, /status: ready-for-review/);
  assert.match(text, /kind: feature/);
  assert.match(text, /branch: dogfood\//);
  assert.match(text, /Nothing merges without you/);
  assert.match(text, /Built the cross-venture queue/);

  const joined = git.calls.map((c) => c.args.join(" "));
  assert.ok(joined.some((c) => c.startsWith("worktree add -b dogfood/")), "cuts an isolated worktree");
  assert.ok(joined.some((c) => c.startsWith("worktree remove")), "removes the worktree after");
  assert.ok(!joined.some((c) => /merge|push/.test(c)), "the wall: never merges or pushes");
});

test("uncommitted builder work is committed by the spine, not lost", async () => {
  const queueDir = tmpQueue();
  const git = fakeGit({ "rev-parse": "base-sha", "status": "M brain/src/x.mjs", "rev-list": "1", "diff": "1 file changed" });
  await buildFeatureRequest(
    { report: "small tweak" },
    { ...BASE_OPTS, queueDir, git, runQuery: async () => ({ text: "done", error: null }) },
  );
  const joined = git.calls.map((c) => c.args.join(" "));
  assert.ok(joined.some((c) => c.includes("add -A")));
  assert.ok(joined.some((c) => c.includes("commit -m dogfood: small tweak")));
});

test("a builder that declines (no commits) marks the item declined and deletes the branch", async () => {
  const queueDir = tmpQueue();
  const git = fakeGit({ "rev-parse": "base-sha", "status": "", "rev-list": "0" });
  const result = await buildFeatureRequest(
    { report: "make it better" },
    { ...BASE_OPTS, queueDir, git, runQuery: async () => ({ text: "Too vague: better at what, for which moment?", error: null }) },
  );
  assert.equal(result.status, "declined");
  assert.equal(result.branch, null);
  const text = fs.readFileSync(result.file, "utf8");
  assert.match(text, /status: declined/);
  assert.match(text, /Too vague/);
  assert.ok(git.calls.some((c) => c.args.join(" ").startsWith("branch -D dogfood/")), "empty branch is deleted");
});

test("a failed build is honest: status failed, error recorded, worktree cleaned up", async () => {
  const queueDir = tmpQueue();
  const git = fakeGit({ "rev-parse": "base-sha", "rev-list": "0" });
  const result = await buildFeatureRequest(
    { report: "broken build case" },
    { ...BASE_OPTS, queueDir, git, runQuery: async () => ({ text: "", error: { kind: "max_turns", message: "The agent hit its turn budget before finishing." } }) },
  );
  assert.equal(result.status, "failed");
  const text = fs.readFileSync(result.file, "utf8");
  assert.match(text, /status: failed/);
  assert.match(text, /turn budget/);
  assert.ok(git.calls.some((c) => c.args.join(" ").startsWith("worktree remove")));
});

test("enqueueFeatureRequest returns a queued receipt immediately and serializes builds", async () => {
  const queueDir = tmpQueue();
  const order = [];
  const git = fakeGit({ "rev-parse": "base-sha", "status": "", "rev-list": "1", "diff": "x" });
  const slowThenFast = (label, ms) => async () => {
    order.push(`${label}:start`);
    await new Promise((r) => setTimeout(r, ms));
    order.push(`${label}:end`);
    return { text: label, error: null };
  };

  const first = enqueueFeatureRequest({ report: "first request" }, { ...BASE_OPTS, queueDir, git, runQuery: slowThenFast("first", 30) });
  const second = enqueueFeatureRequest({ report: "second request" }, { ...BASE_OPTS, now: "2026-07-01T15:00:01.000Z", queueDir, git, runQuery: slowThenFast("second", 1) });

  // Receipts exist before any build finishes.
  assert.equal(first.status, "queued");
  assert.equal(second.status, "queued");
  assert.ok(fs.existsSync(first.file) && fs.existsSync(second.file));

  await Promise.all([first.build, second.build]);
  assert.deepEqual(order, ["first:start", "first:end", "second:start", "second:end"], "strictly one build at a time");
});

test("the builder prompt carries the wall and the request verbatim", () => {
  const prompt = builderPrompt({ report: "Show me X", context: "mid-review", snapshot: { project: { id: "p1" } }, branch: "dogfood/x" });
  assert.match(prompt, /"Show me X"/);
  assert.match(prompt, /NEVER push, never merge/);
  assert.match(prompt, /AGENTS\.md/);
  assert.match(prompt, /dogfood\/x/);
});

test("request_feature is exposed on the MCP front door", () => {
  const tool = TOOL_MAP.get("request_feature");
  assert.ok(tool, "request_feature must be registered on the MCP server");
  assert.deepEqual(tool.inputSchema.required, ["report"]);
  assert.match(tool.description, /never merge/i);
});

test("recoverStaleBuilds salvages orphaned worktrees and flips stale items to interrupted", async () => {
  const queueDir = tmpQueue();
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "feature-repo-"));
  const wt = path.join(repoRoot, ".dogfood-worktrees", "2026-07-01-old-build");
  fs.mkdirSync(wt, { recursive: true });

  // A stale building item + a healthy done item that must not be touched.
  const { reportFriction, updateFrictionItem } = await import("../src/friction.mjs");
  const stale = reportFriction({ report: "stuck build", kind: "feature" }, { queueDir, now: "2026-07-01T10:00:00.000Z", gitSha: "x" });
  updateFrictionItem(stale.file, { fields: { status: "building" } });
  const done = reportFriction({ report: "finished earlier", kind: "feature" }, { queueDir, now: "2026-07-01T09:00:00.000Z", gitSha: "x" });
  updateFrictionItem(done.file, { fields: { status: "ready-for-review" } });

  const git = fakeGit({ "status": "M brain/src/x.mjs" });
  const { recoverStaleBuilds } = await import("../src/feature-builder.mjs");
  const recovered = recoverStaleBuilds({ queueDir, repoRoot, git });

  const joined = git.calls.map((c) => c.args.join(" "));
  assert.ok(joined.some((c) => c.includes("add -A")), "salvages uncommitted worktree work");
  assert.ok(joined.some((c) => c.includes("salvaged from interrupted build")), "salvage commit message");
  assert.ok(joined.some((c) => c.startsWith("worktree remove")), "removes the orphaned worktree");

  assert.match(fs.readFileSync(stale.file, "utf8"), /status: interrupted/);
  assert.match(fs.readFileSync(done.file, "utf8"), /status: ready-for-review/, "terminal items untouched");
  assert.equal(recovered.filter((r) => r.item).length, 1);
  assert.equal(recovered.filter((r) => r.worktree).length, 1);
});

test("get_dogfood_queue is exposed on the MCP front door, read-only", () => {
  const tool = TOOL_MAP.get("get_dogfood_queue");
  assert.ok(tool, "get_dogfood_queue must be registered");
  assert.deepEqual(tool.inputSchema.required, []);
});
