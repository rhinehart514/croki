import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createElectronSafeStorageProtection,
  createEphemeralCredentialProtection,
} from "../src/credential-protection.mjs";

describe("credential protection host adapters", () => {
  it("adapts Electron safeStorage without exposing its binary payload", () => {
    const safeStorage = {
      isEncryptionAvailable: () => true,
      encryptString: (plaintext) => Buffer.from(`os:${plaintext}`, "utf8"),
      decryptString: (payload) => payload.toString("utf8").slice(3),
    };
    const protection = createElectronSafeStorageProtection(safeStorage);
    const ciphertext = protection.encrypt("founder-secret");
    assert.equal(ciphertext, Buffer.from("os:founder-secret").toString("base64"));
    assert.equal(protection.decrypt(ciphertext), "founder-secret");
    assert.equal(protection.durable, true);
  });

  it("refuses Electron's Linux basic_text backend", () => {
    const protection = createElectronSafeStorageProtection({
      isEncryptionAvailable: () => true,
      getSelectedStorageBackend: () => "basic_text",
      encryptString: () => Buffer.from("not encrypted"),
      decryptString: () => "not encrypted",
    });
    assert.throws(() => protection.encrypt("secret"), /did not provide encrypted/);
    assert.throws(() => protection.decrypt("c2VjcmV0"), /did not provide encrypted/);
  });

  it("refuses use when safeStorage reports encryption unavailable", () => {
    const protection = createElectronSafeStorageProtection({ isEncryptionAvailable: () => false });
    assert.throws(() => protection.encrypt("secret"), /unavailable/);
  });

  it("authenticates test envelopes and rejects tampering", () => {
    const protection = createEphemeralCredentialProtection();
    const ciphertext = protection.encrypt("secret");
    const payload = Buffer.from(ciphertext, "base64");
    payload[payload.length - 1] ^= 1;
    assert.throws(() => protection.decrypt(payload.toString("base64")), /cannot be decrypted/);
  });
});
