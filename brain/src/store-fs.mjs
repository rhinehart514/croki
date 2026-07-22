// Shared local-file primitives for Firm state.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// The on-disk home for all durable state. A test passes `{ root }`; otherwise GTM_IDE_HOME or ~/.gtm-ide.
export function storeRoot(options = {}) {
  return options.root || process.env.GTM_IDE_HOME || path.join(os.homedir(), ".gtm-ide");
}

export function now() {
  return new Date().toISOString();
}

// A filesystem-safe id segment. `fallback` is the value used when the input is empty.
export function safeId(value, fallback = "default") {
  return String(value || fallback)
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90) || fallback;
}

// Serialize to a per-process temp file, then atomically rename into place.
export function atomicWrite(file, value) {
  const directory = path.dirname(file);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
  fs.chmodSync(file, 0o600);
}
