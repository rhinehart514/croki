const assert = require("node:assert/strict");
const net = require("node:net");
const test = require("node:test");
const { hasListenerOnHost, findListeningPort, waitForHttpReady } = require("./preview-net.cjs");

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
