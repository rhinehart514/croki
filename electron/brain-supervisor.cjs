"use strict";

const path = require("node:path");
const { fork: nodeFork } = require("node:child_process");
const { attachSyncDesktopHostPipe } = require("./desktop-host-seams.cjs");

const PROTOCOL = "drover-brain-ipc";
const PROTOCOL_VERSION = 1;
const DEFAULT_RESTART = Object.freeze({
  minDelayMs: 100,
  maxDelayMs: 5_000,
  stableAfterMs: 30_000,
  maxAttempts: Number.POSITIVE_INFINITY,
});

/**
 * @typedef {{
 *   protocol: typeof PROTOCOL,
 *   version: typeof PROTOCOL_VERSION,
 *   type: "request",
 *   id: string,
 *   method: string,
 *   input: unknown
 * }} BrainRequestEnvelope
 *
 * @typedef {{
 *   state: "stopped"|"engine-starting"|"engine-ready"|"degraded"|"failed"|"shutting-down",
 *   protocol: typeof PROTOCOL,
 *   version: typeof PROTOCOL_VERSION,
 *   pid: number|null,
 *   generation: number,
 *   restartAttempts: number,
 *   error: object|null
 * }} BrainReadiness
 */

function serializableError(error) {
  return {
    name: String(error?.name || "Error"),
    message: String(error?.message || error || "The Electron host call failed."),
    ...(error?.code != null ? { code: String(error.code) } : {}),
    ...(Number.isInteger(error?.status) ? { status: error.status } : {}),
  };
}

function remoteError(value, fallback = "The Brain request failed.") {
  const error = new Error(String(value?.message || fallback));
  error.name = String(value?.name || "Error");
  if (value?.code != null) error.code = String(value.code);
  if (Number.isInteger(value?.status)) error.status = value.status;
  return error;
}

function processExitError(code, signal) {
  const detail = signal ? `signal ${signal}` : `code ${code ?? "unknown"}`;
  return Object.assign(new Error(`The Brain process exited unexpectedly (${detail}).`), {
    code: "BRAIN_PROCESS_EXITED",
    exitCode: code,
    signal,
  });
}

function createBrainSupervisor(options = {}) {
  const fork = options.fork || nodeFork;
  const childPath = path.resolve(options.childPath || path.join(__dirname, "brain-child.mjs"));
  const hostCall = typeof options.hostCall === "function"
    ? options.hostCall
    : async () => {
      throw Object.assign(new Error("That Electron host operation is unavailable."), {
        code: "DESKTOP_HOST_UNAVAILABLE",
      });
    };
  const restart = { ...DEFAULT_RESTART, ...(options.restart || {}) };
  const readinessListeners = new Set();
  const pending = new Map();
  const subscriptions = new Map();
  let child = null;
  let childGeneration = 0;
  let nextRequest = 0;
  let nextSubscription = 0;
  let desiredRunning = false;
  let shuttingDown = false;
  let engineReady = false;
  let restartTimer = null;
  let stableTimer = null;
  let restartAttempts = 0;
  let syncHostAttachment = null;
  let startup = null;
  let state = Object.freeze({
    state: "stopped",
    protocol: PROTOCOL,
    version: PROTOCOL_VERSION,
    pid: null,
    generation: 0,
    restartAttempts: 0,
    error: null,
  });

  function readiness() {
    return state;
  }

  function publish(nextState, extra = {}) {
    state = Object.freeze({
      ...state,
      state: nextState,
      generation: childGeneration,
      restartAttempts,
      ...extra,
    });
    for (const listener of readinessListeners) {
      try { listener(state); } catch { /* a status observer cannot stop supervision */ }
    }
  }

  function subscribeReadiness(listener) {
    if (typeof listener !== "function") throw new TypeError("A readiness listener is required.");
    readinessListeners.add(listener);
    listener(state);
    return () => readinessListeners.delete(listener);
  }

  function envelope(type, fields = {}) {
    return { protocol: PROTOCOL, version: PROTOCOL_VERSION, type, ...fields };
  }

  function send(message, target = child) {
    if (!target?.connected || typeof target.send !== "function") return false;
    try { return target.send(message); } catch { return false; }
  }

  function rejectPendingForGeneration(generation, error) {
    for (const [id, request] of pending) {
      if (request.generation !== generation) continue;
      pending.delete(id);
      request.cleanup?.();
      request.reject(error);
    }
  }

  function request(method, input, { signal, allowStarting = false } = {}) {
    if (!child || !child.connected || (!allowStarting && !engineReady)) {
      return Promise.reject(Object.assign(new Error("The Brain engine is not ready."), {
        code: "BRAIN_NOT_READY",
        readiness: state.state,
      }));
    }
    if (signal?.aborted) {
      return Promise.reject(signal.reason || Object.assign(new Error("The Brain request was cancelled."), {
        name: "AbortError",
      }));
    }
    const id = `request-${process.pid}-${++nextRequest}`;
    const generation = childGeneration;
    return new Promise((resolve, reject) => {
      let cleanup = null;
      if (signal) {
        const abort = () => {
          const active = pending.get(id);
          if (!active) return;
          pending.delete(id);
          cleanup?.();
          send(envelope("request", {
            id: `cancel-${id}`,
            method: "cancel",
            input: { requestId: id },
          }));
          reject(signal.reason || Object.assign(new Error("The Brain request was cancelled."), {
            name: "AbortError",
          }));
        };
        signal.addEventListener("abort", abort, { once: true });
        cleanup = () => signal.removeEventListener("abort", abort);
      }
      pending.set(id, { resolve, reject, generation, cleanup });
      if (!send(envelope("request", { id, method, input }))) {
        pending.delete(id);
        cleanup?.();
        reject(Object.assign(new Error("The Brain request could not be sent."), {
          code: "BRAIN_NOT_READY",
        }));
      }
    });
  }

  function replaySubscriptions() {
    for (const subscription of subscriptions.values()) {
      void request(subscription.method, subscription.input).catch((error) => {
        publish("degraded", {
          pid: child?.pid ?? null,
          error: serializableError(error),
        });
      });
    }
  }

  function handleHostRequest(message, source) {
    Promise.resolve()
      .then(() => hostCall(String(message.method || ""), message.input, {
        child: source,
        requestId: message.id,
      }))
      .then(
        (value) => send(envelope("host-response", {
          id: message.id,
          ok: true,
          value,
        }), source),
        (error) => send(envelope("host-response", {
          id: message.id,
          ok: false,
          error: serializableError(error),
        }), source),
      );
  }

  function handleMessage(source, generation, message) {
    if (source !== child || generation !== childGeneration) return;
    if (message?.protocol !== PROTOCOL || message?.version !== PROTOCOL_VERSION) return;
    if (message.type === "ready") {
      engineReady = true;
      clearTimeout(stableTimer);
      stableTimer = setTimeout(() => { restartAttempts = 0; }, restart.stableAfterMs);
      stableTimer.unref?.();
      publish("engine-ready", { pid: source.pid, error: null });
      startup?.resolve(state);
      startup = null;
      replaySubscriptions();
      return;
    }
    if (message.type === "response" && typeof message.id === "string") {
      const active = pending.get(message.id);
      if (!active || active.generation !== generation) return;
      pending.delete(message.id);
      active.cleanup?.();
      if (message.ok) active.resolve(message.value);
      else active.reject(remoteError(message.error));
      return;
    }
    if (message.type === "event" && typeof message.subscriptionId === "string") {
      const subscription = subscriptions.get(message.subscriptionId);
      if (subscription) {
        if (
          subscription.method === "subscribe-work"
        ) {
          if (
            message.event?.frame === "handshake"
            && Number.isInteger(message.event.cursor)
            && (
              message.event.mode === "snapshot"
              || !Number.isInteger(subscription.input.cursor)
            )
          ) {
            subscription.input.cursor = message.event.cursor;
            for (const sequence of subscription.pendingSequences) {
              if (sequence <= message.event.cursor) subscription.pendingSequences.delete(sequence);
            }
          }
          if (
            message.event?.frame === "push"
            && Number.isInteger(message.event.sequence)
            && (
              !Number.isInteger(subscription.input.cursor)
              || message.event.sequence > subscription.input.cursor
            )
          ) {
            subscription.pendingSequences.add(message.event.sequence);
            while (
              Number.isInteger(subscription.input.cursor)
              && subscription.pendingSequences.has(subscription.input.cursor + 1)
            ) {
              subscription.pendingSequences.delete(subscription.input.cursor + 1);
              subscription.input.cursor += 1;
            }
          }
        }
        try { subscription.listener(message.event); } catch { /* preserve the child stream */ }
      }
      return;
    }
    if (message.type === "host-request" && typeof message.id === "string") {
      handleHostRequest(message, source);
    }
  }

  function killProcessGroup(source, signal = "SIGTERM") {
    const pid = Number(source?.pid);
    if (!Number.isInteger(pid) || pid <= 1) return;
    try {
      if (process.platform === "win32") source.kill?.(signal);
      else process.kill(-pid, signal);
    } catch {
      try { source.kill?.(signal); } catch { /* it already exited */ }
    }
  }

  function scheduleRestart(error) {
    if (!desiredRunning || shuttingDown) return;
    restartAttempts += 1;
    if (restartAttempts > restart.maxAttempts) {
      publish("failed", { pid: null, error: serializableError(error) });
      startup?.reject(error);
      startup = null;
      return;
    }
    const delay = Math.min(
      restart.maxDelayMs,
      restart.minDelayMs * (2 ** Math.max(0, restartAttempts - 1)),
    );
    publish("degraded", {
      pid: null,
      error: serializableError(error),
      retryAt: Date.now() + delay,
    });
    clearTimeout(restartTimer);
    restartTimer = setTimeout(spawnChild, delay);
    restartTimer.unref?.();
  }

  function handleExit(source, generation, code, signal) {
    if (source !== child || generation !== childGeneration) return;
    clearTimeout(stableTimer);
    stableTimer = null;
    syncHostAttachment?.close();
    syncHostAttachment = null;
    child = null;
    engineReady = false;
    const expected = shuttingDown || !desiredRunning;
    const error = processExitError(code, signal);
    rejectPendingForGeneration(generation, error);
    if (expected) {
      publish("stopped", { pid: null, error: null });
      startup?.resolve(state);
      startup = null;
      return;
    }
    // The Brain owns provider subprocesses. Its dedicated process group must be reaped before a
    // replacement starts so an orphan cannot keep performing work beside the recovered engine.
    killProcessGroup(source);
    scheduleRestart(error);
  }

  function spawnChild() {
    if (!desiredRunning || shuttingDown || child) return;
    clearTimeout(restartTimer);
    restartTimer = null;
    childGeneration += 1;
    engineReady = false;
    publish("engine-starting", { pid: null, error: null, retryAt: null });
    const env = {
      ...process.env,
      ...(options.env || {}),
      ELECTRON_RUN_AS_NODE: "1",
    };
    let spawned;
    try {
      spawned = fork(childPath, options.args || [], {
        cwd: options.cwd || path.dirname(path.dirname(childPath)),
        env,
        execArgv: options.execArgv || [],
        detached: process.platform !== "win32",
        stdio: ["ignore", "inherit", "inherit", "ipc", "pipe"],
        ...(options.forkOptions || {}),
      });
    } catch (error) {
      scheduleRestart(error);
      return;
    }
    child = spawned;
    const generation = childGeneration;
    try {
      syncHostAttachment = attachSyncDesktopHostPipe(spawned.stdio?.[4], hostCall);
    } catch (error) {
      child = null;
      killProcessGroup(spawned);
      scheduleRestart(error);
      return;
    }
    spawned.on("message", (message) => handleMessage(spawned, generation, message));
    spawned.once("error", (error) => {
      if (spawned !== child || generation !== childGeneration) return;
      publish("degraded", { pid: spawned.pid ?? null, error: serializableError(error) });
    });
    spawned.once("exit", (code, signal) => handleExit(spawned, generation, code, signal));
  }

  function start() {
    desiredRunning = true;
    shuttingDown = false;
    if (engineReady) return Promise.resolve(state);
    if (startup) return startup.promise;
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    startup = { promise, resolve, reject };
    spawnChild();
    return promise;
  }

  function invokeBrain(input, requestOptions = {}) {
    return request("invoke", input, requestOptions);
  }

  function addSubscription(method, input, listener) {
    if (typeof listener !== "function") throw new TypeError("A subscription listener is required.");
    const subscriptionId = `subscription-${process.pid}-${++nextSubscription}`;
    const exactInput = { ...input, subscriptionId };
    subscriptions.set(subscriptionId, {
      method,
      input: exactInput,
      listener,
      pendingSequences: new Set(),
    });
    if (engineReady) {
      void request(method, exactInput).catch((error) => {
        publish("degraded", { pid: child?.pid ?? null, error: serializableError(error) });
      });
    }
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      subscriptions.delete(subscriptionId);
      if (engineReady) {
        void request("unsubscribe", { subscriptionId }).catch(() => undefined);
      }
    };
  }

  function subscribeToVenture(ventureId, listener) {
    return addSubscription("subscribe-venture", { ventureId: String(ventureId || "") }, listener);
  }

  function subscribeToDriveStream(ventureId, driveId, listener) {
    return addSubscription("subscribe-drive", {
      ventureId: String(ventureId || ""),
      driveId: String(driveId || ""),
    }, listener);
  }

  function subscribeToWork(input = {}, listener) {
    return addSubscription("subscribe-work", {
      ventureId: String(input.ventureId || ""),
      ...(input.threadId ? { threadId: String(input.threadId) } : {}),
      ...(input.runId ? { runId: String(input.runId) } : {}),
      cursor: Number.isInteger(input.cursor) ? input.cursor : null,
      schemaVersion: Number.isInteger(input.schemaVersion) ? input.schemaVersion : null,
    }, listener);
  }

  function recoverDesktopWork() {
    return request("recover", {});
  }

  async function shutdownDesktopWork() {
    desiredRunning = false;
    shuttingDown = true;
    clearTimeout(restartTimer);
    restartTimer = null;
    for (const subscriptionId of subscriptions.keys()) {
      if (engineReady) {
        void request("unsubscribe", { subscriptionId }).catch(() => undefined);
      }
    }
    subscriptions.clear();
    if (!child) {
      publish("stopped", { pid: null, error: null });
      return { abortedDrives: 0 };
    }
    publish("shutting-down", { pid: child.pid ?? null, error: null });
    const target = child;
    let result;
    try {
      result = await request("shutdown", {}, { allowStarting: true });
    } catch (error) {
      if (error?.code !== "BRAIN_PROCESS_EXITED") throw error;
      result = { abortedDrives: 0 };
    }
    if (target.connected) target.disconnect?.();
    const force = setTimeout(() => killProcessGroup(target, "SIGKILL"), 1_500);
    force.unref?.();
    await new Promise((resolve) => {
      if (target.exitCode != null || target.signalCode != null) return resolve();
      target.once("exit", resolve);
      const settle = setTimeout(resolve, 1_600);
      settle.unref?.();
    });
    clearTimeout(force);
    if (child === target) {
      child = null;
      engineReady = false;
      syncHostAttachment?.close();
      syncHostAttachment = null;
    }
    publish("stopped", { pid: null, error: null });
    return result;
  }

  return Object.freeze({
    start,
    readiness,
    subscribeReadiness,
    invokeBrain,
    subscribeToVenture,
    subscribeToDriveStream,
    subscribeToWork,
    recoverDesktopWork,
    shutdownDesktopWork,
  });
}

module.exports = {
  createBrainSupervisor,
  PROTOCOL,
  PROTOCOL_VERSION,
};
