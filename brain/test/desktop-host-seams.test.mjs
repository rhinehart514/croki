import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { credentialProtection, createEphemeralCredentialProtection } from "../src/credential-protection.mjs";
import {
  configureDesktopHostSeams,
  ELECTRON_CREDENTIAL_PROTECTION_ID,
  isSynchronousCredentialHostMethod,
} from "../src/desktop-host-seams.mjs";
import { invokePreview, resetPreviewBrokerForTest } from "../src/firm/preview-broker.mjs";

describe("desktop child host seams", () => {
  afterEach(() => {
    resetPreviewBrokerForTest();
  });

  it("keeps the existing Electron safeStorage scheme and uses only the synchronous credential call", () => {
    const backing = createEphemeralCredentialProtection();
    const calls = [];
    configureDesktopHostSeams({
      invokeHost: async () => {
        throw new Error("credentials must not use async IPC");
      },
      invokeHostSync(method, payload) {
        calls.push({ method, payload });
        if (method === "credentials.encrypt") return { value: backing.encrypt(payload.plaintext) };
        if (method === "credentials.decrypt") return { value: backing.decrypt(payload.ciphertext) };
        throw new Error("not allowed");
      },
    });

    const protection = credentialProtection();
    assert.equal(protection.id, ELECTRON_CREDENTIAL_PROTECTION_ID);
    const ciphertext = protection.encrypt("founder-secret");
    assert.notEqual(ciphertext, "founder-secret");
    assert.equal(protection.decrypt(ciphertext), "founder-secret");
    assert.deepEqual(calls.map(({ method }) => method), ["credentials.encrypt", "credentials.decrypt"]);
    assert.equal(isSynchronousCredentialHostMethod("credentials.encrypt"), true);
    assert.equal(isSynchronousCredentialHostMethod("preview.execute"), false);
  });

  it("routes preview execution over the asynchronous host call", async () => {
    const calls = [];
    configureDesktopHostSeams({
      invokeHost: async (method, payload) => {
        calls.push({ method, payload });
        return { open: false };
      },
      invokeHostSync() {
        throw new Error("preview must not use sync IPC");
      },
    });

    const result = await invokePreview({
      runId: "run-1",
      workspaceId: "workspace-1",
      operation: "status",
    });

    assert.deepEqual(result, { open: false });
    assert.equal(calls[0].method, "preview.execute");
    assert.equal(calls[0].payload.request.workspaceId, "workspace-1");
  });

  it("refuses malformed host results rather than treating them as secrets", () => {
    configureDesktopHostSeams({
      invokeHost: async () => ({}),
      invokeHostSync: () => ({ value: null }),
    });

    assert.throws(
      () => credentialProtection().decrypt("opaque"),
      /invalid decrypt credential result/,
    );
  });
});
