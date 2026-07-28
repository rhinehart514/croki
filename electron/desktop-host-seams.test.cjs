"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { fork } = require("node:child_process");
const { describe, it } = require("node:test");
const {
  attachSyncDesktopHostPipe,
  createDesktopHostHandler,
  MAX_CREDENTIAL_CIPHERTEXT_BYTES,
} = require("./desktop-host-seams.cjs");

function fixture(overrides = {}) {
  const calls = [];
  const safeStorage = {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => "keychain",
    encryptString(value) {
      calls.push(["encrypt", value]);
      return Buffer.from(`sealed:${value}`);
    },
    decryptString(value) {
      calls.push(["decrypt", value.toString("utf8")]);
      return value.toString("utf8").replace(/^sealed:/, "");
    },
    ...overrides,
  };
  const previewSessions = {
    async execute(request) {
      calls.push(["preview", request]);
      return { ok: true };
    },
  };
  return { calls, handle: createDesktopHostHandler({ safeStorage, previewSessions }) };
}

describe("Electron desktop host seams", () => {
  it("encrypts and decrypts in Electron without changing the durable protector", () => {
    const { calls, handle } = fixture();
    const encrypted = handle("credentials.encrypt", { plaintext: "founder-secret" });
    assert.equal(encrypted.value, Buffer.from("sealed:founder-secret").toString("base64"));
    assert.deepEqual(handle("credentials.decrypt", { ciphertext: encrypted.value }), { value: "founder-secret" });
    assert.deepEqual(calls, [
      ["encrypt", "founder-secret"],
      ["decrypt", "sealed:founder-secret"],
    ]);
  });

  it("fails closed when the OS backend is unavailable or basic text", () => {
    const unavailable = fixture({ isEncryptionAvailable: () => false }).handle;
    assert.throws(
      () => unavailable("credentials.encrypt", { plaintext: "secret" }),
      { code: "CREDENTIAL_PROTECTION_UNAVAILABLE" },
    );
    const basicText = fixture({ getSelectedStorageBackend: () => "basic_text" }).handle;
    assert.throws(
      () => basicText("credentials.decrypt", { ciphertext: "c2VjcmV0" }),
      { code: "CREDENTIAL_PROTECTION_UNAVAILABLE" },
    );
  });

  it("allowlists preview operations and rejects every unknown host method", async () => {
    const { calls, handle } = fixture();
    assert.deepEqual(
      await handle("preview.execute", {
        request: { operation: "status", workspaceId: "workspace-1", input: {} },
      }),
      { ok: true },
    );
    assert.equal(calls[0][0], "preview");
    await assert.rejects(
      Promise.resolve().then(() => handle("preview.execute", {
        request: { operation: "open-external", workspaceId: "workspace-1" },
      })),
      { code: "INVALID_HOST_CALL" },
    );
    assert.throws(
      () => handle("shell.execute", { command: "security dump-keychain" }),
      { code: "HOST_METHOD_NOT_ALLOWED" },
    );
  });

  it("bounds credential frames before they reach safeStorage", () => {
    const { handle } = fixture();
    assert.throws(
      () => handle("credentials.decrypt", { ciphertext: "x".repeat(MAX_CREDENTIAL_CIPHERTEXT_BYTES + 1) }),
      { code: "INVALID_HOST_CALL" },
    );
  });

  it("services the child credential store synchronously over inherited fd 4", async () => {
    const { handle } = fixture();
    const child = fork(path.join(__dirname, "fixtures", "sync-host-child.mjs"), [], {
      stdio: ["ignore", "ignore", "ignore", "ipc", "pipe"],
    });
    const attachment = attachSyncDesktopHostPipe(child.stdio[4], handle);
    try {
      const message = await new Promise((resolve, reject) => {
        child.once("message", resolve);
        child.once("error", reject);
        child.once("exit", (code) => {
          if (code) reject(new Error(`fixture exited ${code}`));
        });
      });
      assert.notEqual(message.encrypted, "child-secret");
      assert.equal(message.decrypted, "child-secret");
    } finally {
      attachment.close();
      child.kill();
    }
  });
});
