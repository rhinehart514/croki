// Shared persistence primitives for the file-backed domain stores. Eight stores previously
// re-implemented these byte-for-byte; centralizing them removes the boilerplate and gives every
// store one durable-write path to reason about. (The event log is the authoritative history; these
// snapshot stores are its working projection — see program-projection.mjs.)
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

// Durable write: serialize to a per-process temp file, then atomically rename into place so a
// crash mid-write can never leave a half-written store on disk. The team-sync mirror lives entirely in
// convex-backend.mjs now (the single seam); this primitive is a pure local atomic write and does not
// enqueue anything itself.
export function atomicWrite(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, file);
}
