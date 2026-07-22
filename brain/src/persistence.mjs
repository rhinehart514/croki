// One readable local-file persistence seam. A document is addressed by (collection, key) and stored
// atomically at <root>/<collection>/<key>.json. Ventures scope this seam to their own directories.

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const LOCK_WAIT = new Int32Array(new SharedArrayBuffer(4));

export function storeRoot(options = {}) {
  return options.root || process.env.GTM_IDE_HOME || path.join(os.homedir(), ".gtm-ide");
}

export class PersistenceConflictError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "PersistenceConflictError";
    this.code = "PERSISTENCE_CONFLICT";
    Object.assign(this, details);
  }
}

function documentFile(root, collection, key) {
  return path.join(root, collection, `${key}.json`);
}

function read(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function write(file, value) {
  const directory = path.dirname(file);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
  const temp = `${file}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temp, file);
  fs.chmodSync(file, 0o600);
  return structuredClone(value);
}

function withLock(root, collection, key, operation) {
  const digest = crypto.createHash("sha256").update(`${collection}\u0000${key}`).digest("hex");
  const lock = path.join(root, ".locks", `${digest}.lock`);
  fs.mkdirSync(path.dirname(lock), { recursive: true, mode: 0o700 });
  fs.chmodSync(path.dirname(lock), 0o700);
  const deadline = Date.now() + 5_000;
  while (true) {
    try {
      fs.mkdirSync(lock, { mode: 0o700 });
      break;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      try {
        if (Date.now() - fs.statSync(lock).mtimeMs > 30_000) {
          fs.rmSync(lock, { recursive: true, force: true });
          continue;
        }
      } catch (statError) {
        if (statError?.code === "ENOENT") continue;
        throw statError;
      }
      if (Date.now() >= deadline) throw new Error(`Timed out acquiring persistence lock for ${collection}/${key}.`);
      Atomics.wait(LOCK_WAIT, 0, 0, 10);
    }
  }
  try {
    return operation();
  } finally {
    fs.rmSync(lock, { recursive: true, force: true });
  }
}

function revisionOf(value, absent = 0) {
  if (value == null) return absent;
  if (!Number.isInteger(value.revision) || value.revision < 0) {
    throw new Error("CAS documents must carry a non-negative integer revision.");
  }
  return value.revision;
}

function createFileStore(root) {
  return {
    name: "json",
    root,
    get(collection, key) {
      const value = read(documentFile(root, collection, key));
      return value == null ? null : structuredClone(value);
    },
    getFresh(collection, key) {
      return this.get(collection, key);
    },
    set(collection, key, value) {
      return withLock(root, collection, key, () => write(documentFile(root, collection, key), value));
    },
    compareAndSet(collection, key, expectedRevision, value) {
      if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
        throw new Error("expectedRevision must be a non-negative integer.");
      }
      if (revisionOf(value) !== expectedRevision + 1) {
        throw new Error(`CAS document revision must advance from ${expectedRevision} to ${expectedRevision + 1}.`);
      }
      return withLock(root, collection, key, () => {
        const current = read(documentFile(root, collection, key));
        const actualRevision = revisionOf(current);
        if (actualRevision !== expectedRevision) {
          throw new PersistenceConflictError(
            `Stale ${collection}/${key} document revision: expected ${expectedRevision}, current ${actualRevision}.`,
            { collection, key, expectedRevision, actualRevision, nextRevision: expectedRevision + 1 },
          );
        }
        return write(documentFile(root, collection, key), value);
      });
    },
    setIfAbsent(collection, key, value) {
      return withLock(root, collection, key, () => {
        const file = documentFile(root, collection, key);
        const current = read(file);
        if (current != null) return { inserted: false, value: structuredClone(current) };
        return { inserted: true, value: write(file, value) };
      });
    },
    list(collection) {
      const directory = path.join(root, collection);
      try {
        return fs.readdirSync(directory)
          .filter((name) => name.endsWith(".json"))
          .sort()
          .map((name) => read(path.join(directory, name)))
          .filter((value) => value != null);
      } catch (error) {
        if (error?.code === "ENOENT") return [];
        throw error;
      }
    },
    delete(collection, key) {
      return withLock(root, collection, key, () => {
        try {
          fs.unlinkSync(documentFile(root, collection, key));
          return true;
        } catch (error) {
          if (error?.code === "ENOENT") return false;
          throw error;
        }
      });
    },
  };
}

export function persistence(options = {}) {
  if (options.backend && options.backend !== "json") {
    throw new Error(`Unsupported persistence backend: ${options.backend}. Firm persistence is local JSON.`);
  }
  return createFileStore(storeRoot(options));
}

export function closePersistence() {}
