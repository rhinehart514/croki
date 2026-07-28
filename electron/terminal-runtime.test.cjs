const assert = require("node:assert/strict");
const { mkdtemp, rm } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const pty = require("node-pty");
const { MAX_TRANSCRIPT_BYTES, createTerminalRuntime, terminalOutcome } = require("./terminal-runtime.cjs");
const { createTerminalStateStore } = require("./terminal-state-store.cjs");

test("terminal exits use the same completed, failed, and cancelled vocabulary as Work", () => {
  assert.equal(terminalOutcome(0), "completed");
  assert.equal(terminalOutcome(7), "failed");
  assert.equal(terminalOutcome(0, 15), "cancelled");
});

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
  runtime.write(7, first.sessionId, "exit 7\n");
  await assert.doesNotReject(async () => {
    const deadline = Date.now() + 2_000;
    while (!events.some((event) => event.channel === "terminal-exit")) {
      if (Date.now() > deadline) throw new Error("PTY did not report its terminal outcome.");
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  });
  const exit = events.find((event) => event.channel === "terminal-exit").payload;
  assert.deepEqual({ exitCode: exit.exitCode, terminal: exit.terminal }, { exitCode: 7, terminal: "failed" });
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

function fakePty() {
  const processes = [];
  return {
    processes,
    spawn(_file, _args, options) {
      const listeners = { data: null, exit: null };
      const process = {
        options,
        writes: [],
        sizes: [],
        killed: false,
        write(value) { this.writes.push(value); },
        resize(cols, rows) { this.sizes.push([cols, rows]); },
        kill() { this.killed = true; },
        onData(listener) { listeners.data = listener; },
        onExit(listener) { listeners.exit = listener; },
        data(value) { listeners.data?.(value); },
        exit(exitCode, signal = 0) { listeners.exit?.({ exitCode, signal }); },
      };
      processes.push(process);
      return process;
    },
  };
}

test("two named PTYs run independently and remain bound to one exact venture/workspace", async () => {
  const ptyHarness = fakePty();
  const runtime = createTerminalRuntime({
    pty: ptyHarness,
    shell: { file: "/bin/sh", args: [] },
    resolveWorkspace: async (ventureId, workspaceId) => ({
      workspace: { id: workspaceId, ventureId, worktree: `/worktrees/${ventureId}/${workspaceId}`, status: "running" },
    }),
    send: () => undefined,
  });
  const first = await runtime.open(1, { ventureId: "venture-a", workspaceId: "attempt-a", terminalId: "tests", name: "Tests" });
  const second = await runtime.open(1, { ventureId: "venture-a", workspaceId: "attempt-a", terminalId: "server", name: "Server" });
  assert.notEqual(first.sessionId, second.sessionId);
  runtime.write(1, first.sessionId, "npm test\n");
  runtime.write(1, second.sessionId, "npm start\n");
  assert.deepEqual(ptyHarness.processes[0].writes, ["npm test\n"]);
  assert.deepEqual(ptyHarness.processes[1].writes, ["npm start\n"]);
  assert.equal(runtime.inspect(1, "venture-a", "attempt-a").length, 2);
  assert.throws(() => runtime.write(2, first.sessionId, "cross-window\n"), /No such terminal session/);

  const foreign = await runtime.open(1, { ventureId: "venture-a", workspaceId: "attempt-b", terminalId: "tests", name: "Tests" });
  assert.notEqual(foreign.sessionId, first.sessionId, "the same terminal key cannot cross attempts");
  runtime.stopAll();
});

test("reopen and restart retain bounded scrollback, dimensions, and the prior exit", async () => {
  const ptyHarness = fakePty();
  const runtime = createTerminalRuntime({
    pty: ptyHarness,
    shell: { file: "/bin/sh", args: [] },
    resolveWorkspace: async (ventureId, workspaceId) => ({
      workspace: { id: workspaceId, ventureId, worktree: "/worktree", status: "running" },
    }),
    send: () => undefined,
  });
  const opened = await runtime.open(4, { ventureId: "v", workspaceId: "w", terminalId: "tests", name: "Tests", cols: 80, rows: 20 });
  ptyHarness.processes[0].data("x".repeat(MAX_TRANSCRIPT_BYTES + 10_000));
  ptyHarness.processes[0].exit(2);
  const hiddenReturn = await runtime.open(4, { ventureId: "v", workspaceId: "w", terminalId: "tests", name: "Tests", cols: 120, rows: 40 });
  assert.equal(hiddenReturn.sessionId, opened.sessionId);
  assert.equal(hiddenReturn.exit.terminal, "failed");
  assert.ok(Buffer.byteLength(hiddenReturn.snapshot, "utf8") <= MAX_TRANSCRIPT_BYTES);

  await runtime.restart(4, opened.sessionId);
  assert.equal(ptyHarness.processes[1].options.cols, 120);
  assert.equal(ptyHarness.processes[1].options.rows, 40);
  const restarted = await runtime.open(4, { ventureId: "v", workspaceId: "w", terminalId: "tests", name: "Tests" });
  assert.match(restarted.snapshot, /terminal restarted/);
  assert.equal(runtime.inspect(4, "v", "w")[0].lastExit.terminal, "failed");
  runtime.stopAll();
});

test("terminal identities and workspace ownership fail closed", async () => {
  const runtime = createTerminalRuntime({
    pty: fakePty(),
    resolveWorkspace: async () => ({ workspace: { id: "w", ventureId: "v", worktree: "/worktree", status: "running" } }),
    send: () => undefined,
  });
  await assert.rejects(runtime.open(1, { ventureId: "v", workspaceId: "w", terminalId: "../escape" }), /identity is invalid/);
  await assert.rejects(runtime.open(1, { ventureId: "other", workspaceId: "w", terminalId: "safe" }), /could not verify/);
});

test("bounded scrollback and exact exit survive a full Electron runtime relaunch", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "drover-terminal-state-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const target = { ventureId: "venture-relaunch", workspaceId: "attempt-relaunch", terminalId: "tests", name: "Tests" };
  const resolveWorkspace = async (ventureId, workspaceId) => ({
    workspace: { id: workspaceId, ventureId, worktree: "/worktree", status: "running" },
  });
  const firstPty = fakePty();
  const firstStore = createTerminalStateStore(root, { delayMs: 1 });
  const firstRuntime = createTerminalRuntime({
    pty: firstPty, shell: { file: "/bin/sh", args: [] }, resolveWorkspace, stateStore: firstStore, send: () => undefined,
  });
  const first = await firstRuntime.open(11, target);
  firstPty.processes[0].data("persisted test output\r\n");
  firstPty.processes[0].exit(9);
  firstRuntime.stopAll();

  const secondPty = fakePty();
  const secondStore = createTerminalStateStore(root, { delayMs: 1 });
  const secondRuntime = createTerminalRuntime({
    pty: secondPty, shell: { file: "/bin/sh", args: [] }, resolveWorkspace, stateStore: secondStore, send: () => undefined,
  });
  const restored = await secondRuntime.open(92, target);
  assert.match(restored.snapshot, /persisted test output/);
  assert.deepEqual(restored.exit, { exitCode: 9, signal: 0, terminal: "failed" });
  assert.equal(secondPty.processes.length, 0, "an exited terminal must not silently start a new shell on app return");

  await secondRuntime.restart(92, restored.sessionId);
  assert.equal(secondPty.processes.length, 1, "the founder's explicit restart starts the replacement shell");
  secondRuntime.close(92, restored.sessionId);
  secondStore.flush();

  const thirdPty = fakePty();
  const thirdRuntime = createTerminalRuntime({
    pty: thirdPty,
    shell: { file: "/bin/sh", args: [] },
    resolveWorkspace,
    stateStore: createTerminalStateStore(root, { delayMs: 1 }),
    send: () => undefined,
  });
  const forgotten = await thirdRuntime.open(103, target);
  assert.equal(forgotten.snapshot, "");
  assert.equal(forgotten.exit, null);
  assert.equal(thirdPty.processes.length, 1, "explicit close removes only that terminal's persisted state");
  thirdRuntime.stopAll();
});
