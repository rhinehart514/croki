"use strict";

// Electron-side allowlist for native operations requested by the Brain child. This module contains
// no transport and no logging: the supervisor may carry async preview calls over process IPC and
// synchronous credential calls over its private inherited pipe without ever forwarding payloads to
// the renderer or stderr.

const MAX_CREDENTIAL_PLAINTEXT_BYTES = 1024 * 1024;
const MAX_CREDENTIAL_CIPHERTEXT_BYTES = 2 * 1024 * 1024;
const PREVIEW_OPERATIONS = new Set([
  "status",
  "discover",
  "open",
  "navigate",
  "click",
  "type",
  "press",
  "scroll",
  "evaluate",
  "wait_for",
  "snapshot",
]);
const SYNC_HOST_PROTOCOL = "drover-brain-host-sync";
const SYNC_HOST_PROTOCOL_VERSION = 1;
const MAX_SYNC_HOST_FRAME_BYTES = 4 * 1024 * 1024;

function hostError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function requireEncryptedStorage(safeStorage) {
  if (!safeStorage?.isEncryptionAvailable?.()) {
    throw hostError("The operating system credential store is unavailable.", "CREDENTIAL_PROTECTION_UNAVAILABLE");
  }
  if (safeStorage.getSelectedStorageBackend?.() === "basic_text") {
    throw hostError(
      "The operating system did not provide encrypted credential storage.",
      "CREDENTIAL_PROTECTION_UNAVAILABLE",
    );
  }
}

function boundedString(value, name, maxBytes) {
  if (typeof value !== "string") throw hostError(`${name} must be a string.`, "INVALID_HOST_CALL");
  if (Buffer.byteLength(value, "utf8") > maxBytes) {
    throw hostError(`${name} is too large.`, "INVALID_HOST_CALL");
  }
  return value;
}

function validatePreviewRequest(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw hostError("Preview host calls need a request.", "INVALID_HOST_CALL");
  }
  const operation = String(request.operation ?? "");
  if (!PREVIEW_OPERATIONS.has(operation)) {
    throw hostError(`Unknown preview operation: ${operation}`, "INVALID_HOST_CALL");
  }
  const workspaceId = String(request.workspaceId ?? "").trim();
  if (!workspaceId || workspaceId.length > 256) {
    throw hostError("Preview host calls need a bounded workspace.", "INVALID_HOST_CALL");
  }
  return { ...request, operation, workspaceId };
}

/**
 * Create the only Electron-native methods callable by the Brain child.
 *
 * The credential methods are intentionally synchronous so the supervisor can service them on the
 * private credential pipe without an async migration of every current credential consumer.
 */
function createDesktopHostHandler({ safeStorage, previewSessions }) {
  if (!previewSessions || typeof previewSessions.execute !== "function") {
    throw new TypeError("previewSessions must provide execute(request).");
  }

  return function handleDesktopHostCall(method, payload = {}) {
    switch (method) {
      case "credentials.encrypt": {
        requireEncryptedStorage(safeStorage);
        const plaintext = boundedString(
          payload?.plaintext,
          "Credential plaintext",
          MAX_CREDENTIAL_PLAINTEXT_BYTES,
        );
        return { value: safeStorage.encryptString(plaintext).toString("base64") };
      }
      case "credentials.decrypt": {
        requireEncryptedStorage(safeStorage);
        const ciphertext = boundedString(
          payload?.ciphertext,
          "Credential ciphertext",
          MAX_CREDENTIAL_CIPHERTEXT_BYTES,
        );
        return { value: safeStorage.decryptString(Buffer.from(ciphertext, "base64")) };
      }
      case "preview.execute":
        return previewSessions.execute(validatePreviewRequest(payload?.request));
      default:
        throw hostError("That Electron host operation is not available.", "HOST_METHOD_NOT_ALLOWED");
    }
  };
}

function safeHostError(error) {
  return {
    message: error instanceof Error ? error.message : "Electron refused credential protection.",
    ...(error?.code ? { code: String(error.code) } : {}),
  };
}

/**
 * Service synchronous credential requests arriving on the supervisor's parent end of child fd 4.
 *
 * This listener accepts only the two credential methods even if its host handler later grows.
 * Responses contain no stack and the implementation never logs frames. Closing the returned
 * attachment removes listeners without destroying the supervisor-owned stream.
 */
function attachSyncDesktopHostPipe(
  stream,
  handleHostCall,
  { maxFrameBytes = MAX_SYNC_HOST_FRAME_BYTES } = {},
) {
  if (!stream || typeof stream.on !== "function" || typeof stream.write !== "function") {
    throw new TypeError("The synchronous host pipe must be a duplex stream.");
  }
  if (typeof handleHostCall !== "function") throw new TypeError("handleHostCall must be a function.");

  let pending = Buffer.alloc(0);
  let closed = false;

  function send(response) {
    if (closed || stream.destroyed) return;
    const frame = Buffer.from(`${JSON.stringify(response)}\n`);
    if (frame.length > maxFrameBytes) {
      stream.destroy(hostError("The credential host response exceeded its frame limit.", "HOST_FRAME_TOO_LARGE"));
      return;
    }
    stream.write(frame);
  }

  function respondTo(frame) {
    let request;
    try {
      request = JSON.parse(frame.toString("utf8"));
    } catch {
      send({
        protocol: SYNC_HOST_PROTOCOL,
        version: SYNC_HOST_PROTOCOL_VERSION,
        id: null,
        ok: false,
        error: { message: "The credential host request was invalid.", code: "INVALID_HOST_CALL" },
      });
      return;
    }
    const base = {
      protocol: SYNC_HOST_PROTOCOL,
      version: SYNC_HOST_PROTOCOL_VERSION,
      id: request?.id ?? null,
    };
    if (
      request?.protocol !== SYNC_HOST_PROTOCOL
      || request?.version !== SYNC_HOST_PROTOCOL_VERSION
      || typeof request?.id !== "string"
      || (request?.method !== "credentials.encrypt" && request?.method !== "credentials.decrypt")
    ) {
      send({
        ...base,
        ok: false,
        error: { message: "That synchronous host operation is not available.", code: "HOST_METHOD_NOT_ALLOWED" },
      });
      return;
    }
    try {
      const result = handleHostCall(request.method, request.input);
      if (result && typeof result.then === "function") {
        throw hostError("Credential protection must complete synchronously.", "INVALID_HOST_CALL");
      }
      send({ ...base, ok: true, result });
    } catch (error) {
      send({ ...base, ok: false, error: safeHostError(error) });
    }
  }

  function onData(chunk) {
    if (closed) return;
    pending = Buffer.concat([pending, Buffer.from(chunk)]);
    while (true) {
      const newline = pending.indexOf(0x0a);
      if (newline < 0) break;
      const frame = pending.subarray(0, newline);
      pending = pending.subarray(newline + 1);
      if (frame.length) respondTo(frame);
    }
    if (pending.length > maxFrameBytes) {
      stream.destroy(hostError("The credential host request exceeded its frame limit.", "HOST_FRAME_TOO_LARGE"));
    }
  }

  stream.on("data", onData);
  return {
    close() {
      if (closed) return;
      closed = true;
      pending = Buffer.alloc(0);
      stream.off("data", onData);
    },
  };
}

module.exports = {
  attachSyncDesktopHostPipe,
  createDesktopHostHandler,
  MAX_CREDENTIAL_PLAINTEXT_BYTES,
  MAX_CREDENTIAL_CIPHERTEXT_BYTES,
  MAX_SYNC_HOST_FRAME_BYTES,
  PREVIEW_OPERATIONS,
  SYNC_HOST_PROTOCOL,
  SYNC_HOST_PROTOCOL_VERSION,
};
