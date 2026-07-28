const assert = require("node:assert/strict");
const net = require("node:net");
const test = require("node:test");
const {
  discoverWorktreeListeners,
  findListeningPort,
  hasListenerOnHost,
  parseListeningProcesses,
  waitForHttpReady,
} = require("./preview-net.cjs");

function listen() {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

test("hasListenerOnHost detects a live loopback listener and a closed port", async (t) => {
  const { server, port } = await listen();
  t.after(() => server.close());
  assert.equal(await hasListenerOnHost(port, "127.0.0.1"), true);
  server.close();
  await new Promise((resolve) => server.once("close", resolve));
  assert.equal(await hasListenerOnHost(port, "127.0.0.1"), false);
});

test("findListeningPort returns the first live candidate and null when nothing listens", async (t) => {
  const { server, port } = await listen();
  t.after(() => server.close());
  const dead = port === 65_535 ? port - 1 : port + 1;
  assert.equal(await findListeningPort([dead, port]), port);
  assert.equal(await findListeningPort([dead]), null);
  assert.equal(await findListeningPort(["5173", -1, 0]), null); // non-integer and out-of-range candidates are skipped
});

test("listener discovery keeps only loopback servers owned by processes inside the exact worktree", () => {
  const worktree = "/tmp/croki/workspaces/workspace-1";
  const run = (_command, args) => {
    if (args.includes("-iTCP")) {
      return [
        "p101",
        "n127.0.0.1:4310",
        "n*:4311",
        "n10.0.0.4:9000",
        "p202",
        "n127.0.0.1:5555",
        "p303",
        "n127.0.0.1:4310",
      ].join("\n");
    }
    const pid = args[args.indexOf("-p") + 1];
    if (pid === "101") return `p101\nfcwd\nn${worktree}`;
    if (pid === "303") return `p303\nfcwd\nn${worktree}/packages/site`;
    return "p202\nfcwd\nn/tmp/some-other-project";
  };

  assert.deepEqual(discoverWorktreeListeners(worktree, { run }), [
    { port: 4310, url: "http://127.0.0.1:4310/" },
    { port: 4311, url: "http://127.0.0.1:4311/" },
  ]);
  assert.deepEqual(discoverWorktreeListeners("relative/worktree", { run }), []);
});

test("listener parser ignores public interfaces and malformed process records", () => {
  const parsed = parseListeningProcesses([
    "n127.0.0.1:9999",
    "p44",
    "n0.0.0.0:8888",
    "n[::1]:7777",
    "pnope",
    "n127.0.0.1:6666",
  ].join("\n"));
  assert.deepEqual([...parsed], [[44, new Set([7777])]]);
});

test("waitForHttpReady treats any HTTP response as ready, including error statuses", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls < 3) throw new Error("ECONNREFUSED");
    return { status: 500, arrayBuffer: async () => new ArrayBuffer(0) };
  };
  const result = await waitForHttpReady({ baseUrl: "http://127.0.0.1:5199/", timeoutMs: 2_000, intervalMs: 1, fetchImpl });
  assert.deepEqual(result, { ready: true, status: 500 });
  assert.equal(calls, 3);
});

test("waitForHttpReady fails honestly with the URL and last failure after the deadline", async () => {
  const fetchImpl = async () => { throw new Error("connect ECONNREFUSED"); };
  await assert.rejects(
    waitForHttpReady({ baseUrl: "http://127.0.0.1:5199/", timeoutMs: 30, intervalMs: 1, fetchImpl }),
    (error) => error.message.includes("http://127.0.0.1:5199/") && error.message.includes("ECONNREFUSED"),
  );
});
