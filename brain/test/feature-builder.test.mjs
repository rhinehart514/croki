import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { buildFeatureRequest, enqueueFeatureRequest, builderPrompt } from "../src/feature-builder.mjs";
import { listFrictionQueue } from "../src/friction.mjs";
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

function realGit(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

test("a successful build leaves a reviewable uncommitted worktree behind the wall", async () => {
  const queueDir = tmpQueue();
  let committed = true;
  const git = fakeGit({
    "rev-parse": "base-sha",
    "status": " M brain/src/x.mjs",
    "rev-list": () => committed ? "2" : "0",
    "reset --mixed": () => { committed = false; return ""; },
  });
  const result = await buildFeatureRequest(
    { report: "Show all ventures in one queue", context: "Working in RodentRadar" },
    { ...BASE_OPTS, queueDir, git, runQuery: async () => ({ text: "Built the cross-venture queue. Tests pass.", error: null }) },
  );

  assert.equal(result.status, "ready-for-review");
  assert.match(result.branch, /^dogfood\/2026-07-01-150000-show-all-ventures/);
  assert.equal(result.commits, 0);
  assert.match(result.worktree, /\.dogfood-worktrees/);

  const text = fs.readFileSync(result.file, "utf8");
  assert.match(text, /status: ready-for-review/);
  assert.match(text, /kind: feature/);
  assert.match(text, /branch: dogfood\//);
  assert.match(text, /Nothing was committed, pushed, merged, or deployed/);
  assert.match(text, /Built the cross-venture queue/);
  const listed = listFrictionQueue({ queueDir }).reports.find((item) => item.file === path.basename(result.file));
  assert.equal(listed?.branch, result.branch);
  assert.equal(listed?.worktree, result.worktree);
  assert.equal(listed?.commits, 0);

  const joined = git.calls.map((c) => c.args.join(" "));
  assert.ok(joined.some((c) => c.startsWith("worktree add -b dogfood/")), "cuts an isolated worktree");
  assert.ok(joined.some((c) => c.startsWith("reset --mixed base-sha")), "defensively uncommits injected runner work");
  assert.ok(!joined.some((c) => c.startsWith("worktree remove")), "reviewable worktree remains available");
  assert.ok(!git.calls.some(({ args }) => args[0] === "add" || args.includes("commit") || ["merge", "push"].includes(args[0])), "the wall: never stages, commits, merges, pushes, or deploys");
});

test("uncommitted builder work stays uncommitted and the model receives no shell", async () => {
  const queueDir = tmpQueue();
  const git = fakeGit({ "rev-parse": "base-sha", "status": "M brain/src/x.mjs", "rev-list": "0" });
  let offeredTools = [];
  await buildFeatureRequest(
    { report: "small tweak" },
    { ...BASE_OPTS, queueDir, git, runQuery: async ({ allowedTools }) => { offeredTools = allowedTools; return { text: "done", error: null }; } },
  );
  const joined = git.calls.map((c) => c.args.join(" "));
  assert.ok(!offeredTools.includes("Bash"));
  assert.ok(!git.calls.some(({ args }) => args[0] === "add" || args.includes("commit") || ["merge", "push"].includes(args[0])));
});

test("real git isolation preserves founder dirt and defensively uncommits a violating runner", async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "feature-real-git-"));
  const queueDir = tmpQueue();
  realGit(["init"], repoRoot);
  fs.writeFileSync(path.join(repoRoot, "existing.txt"), "base\n");
  realGit(["add", "existing.txt"], repoRoot);
  realGit(["-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-m", "base"], repoRoot);
  fs.writeFileSync(path.join(repoRoot, "existing.txt"), "founder draft\n");

  const result = await buildFeatureRequest(
    { report: "real isolation" },
    {
      repoRoot,
      queueDir,
      now: BASE_OPTS.now,
      gitSha: "host-sha",
      runQuery: async ({ cwd }) => {
        fs.writeFileSync(path.join(cwd, "generated.txt"), "review me\n");
        realGit(["add", "generated.txt"], cwd);
        realGit(["-c", "user.name=violator", "-c", "user.email=violator@example.com", "commit", "-m", "must be undone"], cwd);
        return { text: "claimed done", error: null };
      },
    },
  );

  assert.equal(result.status, "ready-for-review");
  assert.equal(result.commits, 0);
  assert.equal(fs.readFileSync(path.join(repoRoot, "existing.txt"), "utf8"), "founder draft\n");
  assert.equal(fs.existsSync(path.join(repoRoot, "generated.txt")), false);
  assert.equal(fs.readFileSync(path.join(result.worktree, "generated.txt"), "utf8"), "review me\n");
  assert.equal(realGit(["rev-list", "--count", `${realGit(["rev-parse", "HEAD"], repoRoot)}..HEAD`], result.worktree), "0");
  assert.match(realGit(["status", "--porcelain"], result.worktree), /generated\.txt/);
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

test("a failed worktree creation never deletes a branch it did not prove it created", async () => {
  const queueDir = tmpQueue();
  const git = fakeGit({
    "rev-parse": "base-sha",
    "worktree add": () => { throw new Error("branch already exists"); },
  });
  const result = await buildFeatureRequest(
    { report: "colliding branch" },
    { ...BASE_OPTS, queueDir, git, runQuery: async () => ({ text: "never runs", error: null }) },
  );
  assert.equal(result.status, "failed");
  assert.ok(!git.calls.some(({ args }) => args[0] === "branch" && args[1] === "-D"));
});

test("a symlinked worktree root cannot redirect product changes outside the repository", async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "feature-root-boundary-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "feature-root-outside-"));
  const queueDir = tmpQueue();
  realGit(["init"], repoRoot);
  fs.writeFileSync(path.join(repoRoot, "base.txt"), "base\n");
  realGit(["add", "base.txt"], repoRoot);
  realGit(["-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-m", "base"], repoRoot);
  fs.symlinkSync(outside, path.join(repoRoot, ".dogfood-worktrees"));

  const result = await buildFeatureRequest(
    { report: "stay isolated" },
    { repoRoot, queueDir, now: BASE_OPTS.now, gitSha: "host-sha", runQuery: async () => ({ text: "never runs", error: null }) },
  );
  assert.equal(result.status, "failed");
  assert.match(result.error, /resolves outside/);
  assert.deepEqual(fs.readdirSync(outside), []);
});

test("enqueueFeatureRequest returns a queued receipt immediately and serializes builds", async () => {
  const queueDir = tmpQueue();
  const order = [];
  const git = fakeGit({ "rev-parse": "base-sha", "status": "M changed.mjs", "rev-list": "0" });
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

test("identical same-second requests receive distinct branches and worktrees", async () => {
  const queueDir = tmpQueue();
  const git = fakeGit({ "rev-parse": "base-sha", "status": "M changed.mjs", "rev-list": "0" });
  const first = enqueueFeatureRequest({ report: "same request" }, { ...BASE_OPTS, queueDir, git, runQuery: async () => ({ text: "one", error: null }) });
  const second = enqueueFeatureRequest({ report: "same request" }, { ...BASE_OPTS, queueDir, git, runQuery: async () => ({ text: "two", error: null }) });
  const [a, b] = await Promise.all([first.build, second.build]);
  assert.notEqual(a.branch, b.branch);
  assert.notEqual(a.worktree, b.worktree);
  assert.match(b.branch, /-2$/);
});

test("an uninspectable failed build is preserved instead of being force-cleaned", async () => {
  const queueDir = tmpQueue();
  const git = fakeGit({
    "rev-parse": "base-sha",
    "rev-list": "1",
    "reset --mixed": () => { throw new Error("index locked"); },
  });
  const result = await buildFeatureRequest(
    { report: "preserve uncertain work" },
    { ...BASE_OPTS, queueDir, git, runQuery: async () => ({ text: "partial", error: { kind: "error", message: "model failed" } }) },
  );
  assert.equal(result.status, "failed");
  assert.equal(result.commits, 1);
  assert.ok(result.worktree);
  assert.ok(!git.calls.some(({ args }) => args[0] === "worktree" && args[1] === "remove"));
  assert.match(fs.readFileSync(result.file, "utf8"), /could not be safely inspected/);
  assert.match(fs.readFileSync(result.file, "utf8"), /1 local commit remains/);
});

test("the builder prompt carries the wall and the request verbatim", () => {
  const prompt = builderPrompt({ report: "Show me X", context: "mid-review", snapshot: { venture: { id: "v1" } }, branch: "dogfood/x" });
  assert.match(prompt, /"Show me X"/);
  assert.match(prompt, /NEVER commit.*push.*merge.*deploy/i);
  assert.match(prompt, /file tools only/i);
  assert.match(prompt, /AGENTS\.md/);
  assert.match(prompt, /dogfood\/x/);
});

test("request_feature is exposed on the MCP front door", () => {
  const tool = TOOL_MAP.get("request_feature");
  assert.ok(tool, "request_feature must be registered on the MCP server");
  assert.deepEqual(tool.inputSchema.required, ["report"]);
  assert.match(tool.description, /cannot run shell commands.*commit.*push.*deploy/i);
});

test("recoverStaleBuilds preserves dirty worktrees without staging or committing", async () => {
  const queueDir = tmpQueue();
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "feature-repo-"));

  // A stale building item + a healthy done item that must not be touched.
  const { reportFriction, updateFrictionItem } = await import("../src/friction.mjs");
  const stale = reportFriction({ report: "stuck build", kind: "feature" }, { queueDir, now: "2026-07-01T10:00:00.000Z", gitSha: "x" });
  updateFrictionItem(stale.file, { fields: { status: "building" } });
  const wt = path.join(repoRoot, ".dogfood-worktrees", path.basename(stale.file, ".md"));
  fs.mkdirSync(wt, { recursive: true });
  const done = reportFriction({ report: "finished earlier", kind: "feature" }, { queueDir, now: "2026-07-01T09:00:00.000Z", gitSha: "x" });
  updateFrictionItem(done.file, { fields: { status: "ready-for-review" } });

  const git = fakeGit({ "status": "M brain/src/x.mjs" });
  const { recoverStaleBuilds } = await import("../src/feature-builder.mjs");
  const recovered = recoverStaleBuilds({ queueDir, repoRoot, git });

  const joined = git.calls.map((c) => c.args.join(" "));
  assert.ok(!joined.some((c) => /(^| )(add|commit)( |$)/.test(c)), "recovery cannot stage or commit");
  assert.ok(!joined.some((c) => c.startsWith("worktree remove")), "dirty worktree stays available for review");

  assert.match(fs.readFileSync(stale.file, "utf8"), /status: interrupted/);
  assert.match(fs.readFileSync(done.file, "utf8"), /status: ready-for-review/, "terminal items untouched");
  assert.equal(recovered.filter((r) => r.item).length, 1);
  assert.equal(recovered.filter((r) => r.worktree).length, 1);

  const recoveredAgain = recoverStaleBuilds({ queueDir, repoRoot, git });
  assert.deepEqual(recoveredAgain, [], "a later server start does not recover the same retained work again");
});

test("recoverStaleBuilds leaves receipt-less retained worktrees alone", async () => {
  const queueDir = tmpQueue();
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "feature-repo-"));
  const wt = path.join(repoRoot, ".dogfood-worktrees", "old-review-without-receipt");
  fs.mkdirSync(wt, { recursive: true });
  const sharedModules = fs.mkdtempSync(path.join(os.tmpdir(), "feature-modules-"));
  fs.symlinkSync(sharedModules, path.join(wt, "node_modules"));
  const git = fakeGit({ "status": "?? founder-review.txt" });
  const { recoverStaleBuilds } = await import("../src/feature-builder.mjs");

  assert.deepEqual(recoverStaleBuilds({ queueDir, repoRoot, git }), []);
  assert.equal(fs.existsSync(wt), true);
  assert.equal(fs.lstatSync(path.join(wt, "node_modules")).isSymbolicLink(), true);
  assert.equal(git.calls.length, 0, "unknown retained work is not inspected or mutated");
});

test("recoverStaleBuilds uncommits interrupted model work before exposing it for review", async () => {
  const queueDir = tmpQueue();
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "feature-repo-"));
  const wt = path.join(repoRoot, ".dogfood-worktrees", "2026-07-01-interrupted");
  fs.mkdirSync(wt, { recursive: true });
  const { reportFriction, updateFrictionItem } = await import("../src/friction.mjs");
  const stale = reportFriction({ report: "interrupted commit", kind: "feature" }, { queueDir, now: "2026-07-01T10:00:00.000Z", gitSha: "x" });
  updateFrictionItem(stale.file, { fields: { status: "building", workspace: wt, base_commit: "base-sha" } });

  let committed = true;
  const git = fakeGit({
    "rev-list": () => committed ? "1" : "0",
    "reset --mixed": () => { committed = false; return ""; },
    "status": "M brain/src/x.mjs",
  });
  const { recoverStaleBuilds } = await import("../src/feature-builder.mjs");
  const recovered = recoverStaleBuilds({ queueDir, repoRoot, git });

  assert.ok(git.calls.some(({ args }) => args.join(" ") === "reset --mixed base-sha"));
  assert.ok(!git.calls.some(({ args }) => args[0] === "worktree" && args[1] === "remove"));
  assert.equal(recovered.find((entry) => entry.worktree)?.commits, 0);
});

test("get_dogfood_queue is exposed on the MCP front door, read-only", () => {
  const tool = TOOL_MAP.get("get_dogfood_queue");
  assert.ok(tool, "get_dogfood_queue must be registered");
  assert.deepEqual(tool.inputSchema.required, []);
});
