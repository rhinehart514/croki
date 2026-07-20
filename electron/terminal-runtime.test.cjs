const assert = require("node:assert/strict");
const { mkdtemp, rm } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const pty = require("node-pty");
const { createTerminalRuntime } = require("./terminal-runtime.cjs");

test("terminal runtime resolves and retains one PTY per canonical workspace", async (t) => {
  const worktree = await mkdtemp(path.join(os.tmpdir(), "drover-terminal-"));
  t.after(() => rm(worktree, { recursive: true, force: true }));
  const events = [];
  let resolveCount = 0;
  const runtime = createTerminalRuntime({
    pty,
    shell: { file: "/bin/sh", args: [] },
    resolveWorkspace: async (ventureId, workspaceId) => {
      resolveCount += 1;
      return { workspace: { id: workspaceId, ventureId, worktree, status: "complete" } };
    },
    send: (_ownerId, channel, payload) => events.push({ channel, payload }),
  });
  t.after(() => runtime.stopAll());

  const first = await runtime.open(7, { ventureId: "venture-1", workspaceId: "workspace-1", cwd: "/", cols: 80, rows: 20 });
  runtime.write(7, first.sessionId, "pwd\n");
  await assert.doesNotReject(async () => {
    const deadline = Date.now() + 2_000;
    while (!events.some((event) => event.channel === "terminal-data" && event.payload.data.includes(worktree))) {
      if (Date.now() > deadline) throw new Error("PTY did not report its working directory.");
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  });
  const second = await runtime.open(7, { ventureId: "venture-1", workspaceId: "workspace-1", cols: 100, rows: 30 });
  assert.equal(second.sessionId, first.sessionId);
  assert.match(second.snapshot, new RegExp(worktree.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(resolveCount, 2, "reopening revalidates the canonical workspace");
});

test("terminal runtime rejects removed and mismatched workspaces", async () => {
  const runtime = createTerminalRuntime({
    pty,
    resolveWorkspace: async () => ({ workspace: { id: "another", ventureId: "venture-1", worktree: null, status: "discarded" } }),
    send: () => undefined,
  });
  await assert.rejects(
    runtime.open(1, { ventureId: "venture-1", workspaceId: "workspace-1", cols: 80, rows: 20 }),
    /could not verify/i,
  );
});
