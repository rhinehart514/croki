// Dev-server detection for the agent-drivable preview: a TCP probe finds the worktree's listening
// port and an HTTP readiness poll holds the preview open until the server actually answers.
// Portions Copyright (c) 2026 T3 Tools Inc. Licensed under MIT (github.com/pingdotgg/t3code).

const net = require("node:net");

const CONNECT_PROBE_TIMEOUT_MS = 250;

/** True when something is listening on {host, port}. */
function hasListenerOnHost(port, host) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.unref();
    socket.setTimeout(CONNECT_PROBE_TIMEOUT_MS);
    socket.once("connect", () => settle(true));
    socket.once("error", () => settle(false));
    socket.once("timeout", () => settle(false));
  });
}

/** True when something is listening on the loopback port over IPv4 or IPv6. */
async function hasLoopbackListener(port) {
  const [ipv4, ipv6] = await Promise.all([
    hasListenerOnHost(port, "127.0.0.1"),
    hasListenerOnHost(port, "::1"),
  ]);
  return ipv4 || ipv6;
}

/** First candidate port with a live loopback listener, or null. */
async function findListeningPort(candidatePorts) {
  for (const port of candidatePorts) {
    if (Number.isInteger(port) && port > 0 && port < 65_536 && (await hasLoopbackListener(port))) return port;
  }
  return null;
}

/**
 * Polls GET `baseUrl` until any HTTP response arrives (a dev server that answers 404/500 is still
 * up — the page decides what it renders) or `timeoutMs` elapses. Each probe is bounded by
 * `probeTimeoutMs` so one hung request cannot stall the loop.
 */
async function waitForHttpReady({ baseUrl, timeoutMs = 30_000, intervalMs = 100, probeTimeoutMs = 1_000, fetchImpl = fetch }) {
  const deadline = Date.now() + timeoutMs;
  let lastFailure = null;
  while (Date.now() <= deadline) {
    const controller = new AbortController();
    const probeTimer = setTimeout(() => controller.abort(), probeTimeoutMs);
    try {
      const response = await fetchImpl(baseUrl, { signal: controller.signal, redirect: "manual" });
      // Drain so keep-alive sockets are reusable; body content is irrelevant to readiness.
      await response.arrayBuffer().catch(() => undefined);
      return { ready: true, status: response.status };
    } catch (cause) {
      lastFailure = cause instanceof Error ? cause.message : String(cause);
    } finally {
      clearTimeout(probeTimer);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`The dev server at ${baseUrl} did not answer within ${Math.round(timeoutMs / 1000)}s${lastFailure ? ` (${lastFailure})` : ""}.`);
}

module.exports = { hasListenerOnHost, hasLoopbackListener, findListeningPort, waitForHttpReady };
