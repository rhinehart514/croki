// Dev-server detection for the agent-drivable preview: a TCP probe finds the worktree's listening
// port and an HTTP readiness poll holds the preview open until the server actually answers.
// Portions Copyright (c) 2026 T3 Tools Inc. Licensed under MIT (github.com/pingdotgg/t3code).

const net = require("node:net");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

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

function parseListeningProcesses(output) {
  const listeners = new Map();
  let pid = null;
  for (const line of String(output ?? "").split(/\r?\n/)) {
    if (line.startsWith("p")) {
      pid = Number(line.slice(1));
      if (Number.isInteger(pid)) listeners.set(pid, listeners.get(pid) ?? new Set());
      continue;
    }
    if (!pid || !line.startsWith("n")) continue;
    const match = line.match(/(?:127\.0\.0\.1|localhost|\[::1\]|\*):(\d+)(?:\s|$)/);
    const port = Number(match?.[1]);
    if (Number.isInteger(port) && port > 0 && port < 65_536) listeners.get(pid)?.add(port);
  }
  return listeners;
}

function processCwd(pid, run = execFileSync) {
  try {
    const output = run("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"], {
      encoding: "utf8",
      timeout: 1_000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return String(output).split(/\r?\n/).find((line) => line.startsWith("n"))?.slice(1) ?? null;
  } catch {
    return null;
  }
}

function insideWorktree(worktree, candidate) {
  if (!candidate) return false;
  const relative = path.relative(path.resolve(worktree), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/** Exact loopback listeners whose owning process has its cwd inside this isolated worktree. */
function discoverWorktreeListeners(worktree, { run = execFileSync } = {}) {
  if (!path.isAbsolute(String(worktree ?? ""))) return [];
  let output;
  try {
    output = run("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-Fpn"], {
      encoding: "utf8",
      timeout: 2_000,
      maxBuffer: 4 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return [];
  }
  const ports = new Set();
  for (const [pid, candidates] of parseListeningProcesses(output)) {
    if (!insideWorktree(worktree, processCwd(pid, run))) continue;
    for (const port of candidates) ports.add(port);
  }
  return [...ports].sort((left, right) => left - right).map((port) => ({
    port,
    url: `http://127.0.0.1:${port}/`,
  }));
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

module.exports = {
  hasListenerOnHost,
  hasLoopbackListener,
  findListeningPort,
  waitForHttpReady,
  parseListeningProcesses,
  discoverWorktreeListeners,
};
