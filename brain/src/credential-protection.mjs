import crypto from "node:crypto";

let hostProtection = null;
let testProtection = null;

function validateProtection(protection) {
  if (!protection || typeof protection !== "object") {
    throw new TypeError("Credential protection must be a host adapter.");
  }
  if (!String(protection.id || "").trim()) {
    throw new TypeError("Credential protection must name its protection scheme.");
  }
  if (typeof protection.encrypt !== "function" || typeof protection.decrypt !== "function") {
    throw new TypeError("Credential protection must provide encrypt and decrypt functions.");
  }
  return protection;
}

// Electron configures this once, below the renderer boundary, after app.whenReady(). Tests can pass
// an adapter per call instead and never need to mutate process-global state.
export function configureCredentialProtection(protection) {
  hostProtection = validateProtection(protection);
}

export function createUnavailableCredentialProtection(reason = "OS-backed credential protection is unavailable.") {
  const unavailable = () => {
    const error = new Error(reason);
    error.code = "CREDENTIAL_PROTECTION_UNAVAILABLE";
    throw error;
  };
  return { id: "unavailable", available: false, durable: false, encrypt: unavailable, decrypt: unavailable };
}

export function createElectronSafeStorageProtection(safeStorage) {
  function requireEncryptedStorage() {
    if (!safeStorage?.isEncryptionAvailable?.()) {
      throw new Error("The operating system credential store is unavailable.");
    }
    if (safeStorage.getSelectedStorageBackend?.() === "basic_text") {
      throw new Error("The operating system did not provide encrypted credential storage.");
    }
  }
  return {
    id: "electron-safe-storage-v1",
    available: true,
    durable: true,
    encrypt(plaintext) {
      requireEncryptedStorage();
      return safeStorage.encryptString(String(plaintext)).toString("base64");
    },
    decrypt(ciphertext) {
      requireEncryptedStorage();
      return safeStorage.decryptString(Buffer.from(String(ciphertext), "base64"));
    },
  };
}

// Node's test runner has no OS keychain. Its process-local AES-GCM key keeps fixture JSON opaque and
// deliberately cannot decrypt after the test process exits. It is never selected by a dev server.
export function createEphemeralCredentialProtection() {
  const key = crypto.randomBytes(32);
  return {
    id: "test-ephemeral-aes-256-gcm-v1",
    available: true,
    durable: false,
    encrypt(plaintext) {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
      const encrypted = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
    },
    decrypt(ciphertext) {
      try {
        const payload = Buffer.from(String(ciphertext), "base64");
        if (payload.length < 29) throw new Error("truncated envelope");
        const decipher = crypto.createDecipheriv("aes-256-gcm", key, payload.subarray(0, 12));
        decipher.setAuthTag(payload.subarray(12, 28));
        return Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString("utf8");
      } catch (cause) {
        const error = new Error("This test credential envelope cannot be decrypted by the current process.", { cause });
        error.code = "CREDENTIAL_DECRYPT_FAILED";
        throw error;
      }
    },
  };
}

export function credentialProtection(options = {}) {
  if (options.secretProtection) return validateProtection(options.secretProtection);
  if (hostProtection) return hostProtection;
  if (process.env.NODE_TEST_CONTEXT) {
    testProtection ||= createEphemeralCredentialProtection();
    return testProtection;
  }
  return createUnavailableCredentialProtection(
    "Saving or reading founder credentials requires Croki desktop OS-backed protection.",
  );
}
