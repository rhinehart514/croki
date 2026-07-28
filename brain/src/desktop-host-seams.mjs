// Brain-side adapters for native capabilities that deliberately remain owned by Electron.
//
// Credential storage is synchronous today: credential-store.mjs is used by synchronous route and
// execution paths all the way down to message-send.mjs. The child supervisor therefore supplies a
// synchronous, private host call backed by its inherited credential pipe. Preview operations are
// already asynchronous and use the ordinary supervised-process request channel.

import fs from "node:fs";
import { configureCredentialProtection } from "./credential-protection.mjs";
import { registerPreviewHost } from "./firm/preview-broker.mjs";

export const ELECTRON_CREDENTIAL_PROTECTION_ID = "electron-safe-storage-v1";
export const SYNC_HOST_PROTOCOL = "drover-brain-host-sync";
export const SYNC_HOST_PROTOCOL_VERSION = 1;
export const MAX_SYNC_HOST_FRAME_BYTES = 4 * 1024 * 1024;

const CREDENTIAL_METHODS = new Set(["credentials.encrypt", "credentials.decrypt"]);

function requireFunction(value, name) {
  if (typeof value !== "function") throw new TypeError(`${name} must be a function.`);
  return value;
}

function credentialResult(response, method) {
  const value = response?.value;
  if (typeof value !== "string") {
    throw new Error(`Electron returned an invalid ${method} credential result.`);
  }
  return value;
}

/**
 * Configure the child Brain's two Electron-owned host capabilities.
 *
 * `invokeHostSync(method, payload)` must never use the renderer transport. It is reserved for the
 * inherited credential pipe because blocking the Brain child is safe while blocking Electron is
 * not. `invokeHost(method, payload)` may use the supervisor's ordered async IPC.
 */
export function configureDesktopHostSeams({ invokeHost, invokeHostSync }) {
  const callHost = requireFunction(invokeHost, "invokeHost");
  const callHostSync = requireFunction(invokeHostSync, "invokeHostSync");

  configureCredentialProtection({
    id: ELECTRON_CREDENTIAL_PROTECTION_ID,
    available: true,
    durable: true,
    encrypt(plaintext) {
      return credentialResult(
        callHostSync("credentials.encrypt", { plaintext: String(plaintext) }),
        "encrypt",
      );
    },
    decrypt(ciphertext) {
      return credentialResult(
        callHostSync("credentials.decrypt", { ciphertext: String(ciphertext) }),
        "decrypt",
      );
    },
  });

  const unregisterPreview = registerPreviewHost((request) => (
    callHost("preview.execute", { request })
  ));

  return () => {
    unregisterPreview();
  };
}

// Exported for transport validation without widening the callable host surface.
export function isSynchronousCredentialHostMethod(method) {
  return CREDENTIAL_METHODS.has(method);
}

function writeAllSync(fd, buffer) {
  let offset = 0;
  while (offset < buffer.length) {
    const written = fs.writeSync(fd, buffer, offset, buffer.length - offset);
    if (written <= 0) throw new Error("The Electron credential pipe closed while writing.");
    offset += written;
  }
}

/**
 * Build the child's synchronous call function over one inherited duplex pipe (fd 4 by default).
 *
 * A newline is a safe frame boundary because JSON escapes newlines in plaintext. The retained read
 * buffer also ensures two coalesced responses cannot consume one another. No frame is ever printed.
 */
export function createSyncDesktopHostClient({ fd = 4, maxFrameBytes = MAX_SYNC_HOST_FRAME_BYTES } = {}) {
  if (!Number.isInteger(fd) || fd < 3) throw new TypeError("The credential host pipe needs an inherited fd.");
  let sequence = 0;
  let pending = Buffer.alloc(0);

  function readFrame() {
    while (true) {
      const newline = pending.indexOf(0x0a);
      if (newline >= 0) {
        const frame = pending.subarray(0, newline);
        pending = pending.subarray(newline + 1);
        return frame;
      }
      if (pending.length >= maxFrameBytes) {
        throw new Error("The Electron credential response exceeded its frame limit.");
      }
      const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, maxFrameBytes - pending.length));
      const read = fs.readSync(fd, chunk, 0, chunk.length);
      if (read === 0) throw new Error("The Electron credential pipe closed before it replied.");
      pending = Buffer.concat([pending, chunk.subarray(0, read)]);
    }
  }

  return function invokeHostSync(method, input = {}) {
    if (!isSynchronousCredentialHostMethod(method)) {
      throw new Error("Only credential protection may use the synchronous Electron host pipe.");
    }
    const id = `credential-${process.pid}-${++sequence}`;
    const request = Buffer.from(`${JSON.stringify({
      protocol: SYNC_HOST_PROTOCOL,
      version: SYNC_HOST_PROTOCOL_VERSION,
      id,
      method,
      input,
    })}\n`);
    if (request.length > maxFrameBytes) throw new Error("The credential host request exceeded its frame limit.");
    writeAllSync(fd, request);

    let response;
    try {
      response = JSON.parse(readFrame().toString("utf8"));
    } catch (cause) {
      throw new Error("Electron returned an invalid credential host response.", { cause });
    }
    if (
      response?.protocol !== SYNC_HOST_PROTOCOL
      || response?.version !== SYNC_HOST_PROTOCOL_VERSION
      || response?.id !== id
    ) {
      throw new Error("Electron returned a mismatched credential host response.");
    }
    if (!response.ok) {
      const error = new Error(String(response.error?.message || "Electron refused credential protection."));
      if (response.error?.code) error.code = String(response.error.code);
      throw error;
    }
    return response.result;
  };
}
