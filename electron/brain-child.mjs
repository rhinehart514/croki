// The supervised desktop Brain entrypoint. Electron retains native authority while this process
// owns provider execution, persistence, repository work, verification, and recovery.

import {
  configureDesktopHostSeams,
  createSyncDesktopHostClient,
} from "../brain/src/desktop-host-seams.mjs";

export const PROTOCOL = "drover-brain-ipc";
export const PROTOCOL_VERSION = 1;

const hostPending = new Map();
const subscriptions = new Map();
const cancelledRequests = new Set();
let nextHostRequest = 0;
let shuttingDown = false;

function envelope(type, fields = {}) {
  return { protocol: PROTOCOL, version: PROTOCOL_VERSION, type, ...fields };
}

function send(message, callback) {
  if (!process.connected || typeof process.send !== "function") return false;
  return process.send(message, callback);
}

function safeError(error) {
  return {
    name: String(error?.name || "Error"),
    message: String(error?.message || error || "The Brain request failed."),
    ...(error?.code != null ? { code: String(error.code) } : {}),
    ...(Number.isInteger(error?.status) ? { status: error.status } : {}),
  };
}

function reviveError(value) {
  const error = new Error(String(value?.message || "The Electron host call failed."));
  error.name = String(value?.name || "Error");
  if (value?.code != null) error.code = String(value.code);
  if (Number.isInteger(value?.status)) error.status = value.status;
  return error;
}

function invokeHost(method, input) {
  if (shuttingDown || !process.connected) {
    return Promise.reject(Object.assign(new Error("The Electron host is unavailable."), {
      code: "DESKTOP_HOST_UNAVAILABLE",
    }));
  }
  const id = `host-${process.pid}-${++nextHostRequest}`;
  return new Promise((resolve, reject) => {
    hostPending.set(id, { resolve, reject });
    if (!send(envelope("host-request", { id, method, input }))) {
      hostPending.delete(id);
      reject(Object.assign(new Error("The Electron host is unavailable."), {
        code: "DESKTOP_HOST_UNAVAILABLE",
      }));
    }
  });
}

configureDesktopHostSeams({
  invokeHost,
  invokeHostSync: createSyncDesktopHostClient({ fd: 4 }),
});

// Load the runtime only after its native seams are installed. No request can observe an
// unconfigured credential protector or preview broker.
const runtime = await import("../brain/src/desktop-runtime.mjs");

function unsubscribe(subscriptionId) {
  const stop = subscriptions.get(subscriptionId);
  subscriptions.delete(subscriptionId);
  stop?.();
}

async function dispatch(method, input = {}) {
  switch (method) {
    case "invoke":
      return runtime.invokeBrain(input);
    case "recover":
      return runtime.recoverDesktopWork();
    case "shutdown": {
      shuttingDown = true;
      for (const id of [...subscriptions.keys()]) unsubscribe(id);
      return runtime.shutdownDesktopWork();
    }
    case "subscribe-venture": {
      const subscriptionId = String(input.subscriptionId || "");
      if (!subscriptionId) throw new Error("A venture subscription id is required.");
      unsubscribe(subscriptionId);
      const stop = runtime.subscribeToVenture(String(input.ventureId || ""), (event) => {
        send(envelope("event", { subscriptionId, event }));
      });
      subscriptions.set(subscriptionId, stop);
      return { subscribed: true, subscriptionId };
    }
    case "subscribe-drive": {
      const subscriptionId = String(input.subscriptionId || "");
      if (!subscriptionId) throw new Error("A drive subscription id is required.");
      unsubscribe(subscriptionId);
      const stop = runtime.subscribeToDriveStream(
        String(input.ventureId || ""),
        String(input.driveId || ""),
        (event) => send(envelope("event", { subscriptionId, event })),
      );
      subscriptions.set(subscriptionId, stop);
      return { subscribed: true, subscriptionId };
    }
    case "subscribe-work": {
      const subscriptionId = String(input.subscriptionId || "");
      if (!subscriptionId) throw new Error("A Work subscription id is required.");
      unsubscribe(subscriptionId);
      const stop = runtime.subscribeToWork({
        ventureId: String(input.ventureId || ""),
        ...(input.threadId ? { threadId: String(input.threadId) } : {}),
        ...(input.runId ? { runId: String(input.runId) } : {}),
        cursor: Number.isInteger(input.cursor) ? input.cursor : null,
        schemaVersion: Number.isInteger(input.schemaVersion) ? input.schemaVersion : null,
      }, (event) => send(envelope("event", { subscriptionId, event })));
      subscriptions.set(subscriptionId, stop);
      return { subscribed: true, subscriptionId };
    }
    case "unsubscribe":
      unsubscribe(String(input.subscriptionId || ""));
      return { subscribed: false };
    case "cancel":
      cancelledRequests.add(String(input.requestId || ""));
      return { cancelled: true };
    default:
      throw Object.assign(new Error(`Unknown Brain child method: ${method}`), {
        code: "UNKNOWN_BRAIN_METHOD",
      });
  }
}

function finishRequest(message) {
  const id = String(message.id || "");
  Promise.resolve()
    .then(() => dispatch(String(message.method || ""), message.input))
    .then(
      (value) => {
        const cancelled = cancelledRequests.delete(id);
        if (cancelled) return;
        send(envelope("response", { id, ok: true, value }), () => {
          if (message.method === "shutdown") process.disconnect?.();
        });
      },
      (error) => {
        const cancelled = cancelledRequests.delete(id);
        if (cancelled) return;
        send(envelope("response", { id, ok: false, error: safeError(error) }), () => {
          if (message.method === "shutdown") process.disconnect?.();
        });
      },
    );
}

process.on("message", (message) => {
  if (message?.protocol !== PROTOCOL || message?.version !== PROTOCOL_VERSION) return;
  if (message.type === "request" && typeof message.id === "string") {
    finishRequest(message);
    return;
  }
  if (message.type === "host-response" && typeof message.id === "string") {
    const pending = hostPending.get(message.id);
    if (!pending) return;
    hostPending.delete(message.id);
    if (message.ok) pending.resolve(message.value);
    else pending.reject(reviveError(message.error));
  }
});

process.on("disconnect", () => {
  shuttingDown = true;
  for (const { reject } of hostPending.values()) {
    reject(Object.assign(new Error("The Electron host disconnected."), {
      code: "DESKTOP_HOST_UNAVAILABLE",
    }));
  }
  hostPending.clear();
  for (const id of [...subscriptions.keys()]) unsubscribe(id);
});

send(envelope("ready", {
  pid: process.pid,
  capabilities: {
    requests: true,
    subscriptions: true,
    cancellation: true,
    asyncHostCalls: true,
    syncCredentialHost: true,
  },
}));
