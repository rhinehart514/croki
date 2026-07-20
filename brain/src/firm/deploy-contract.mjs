import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { openVenture } from "./venture-store.mjs";

const SCRIPT_NAME = /^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,127}$/;
const HOST_FIELDS = ["deployContract", "deployUnavailableReason"];

function text(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function contractDigest(contract) {
  return crypto.createHash("sha256").update(JSON.stringify({
    runner: contract.runner,
    script: contract.script,
    definition: contract.definition,
    destination: contract.destination,
  })).digest("hex");
}

function unavailable(effect, reason) {
  return { ...effect, deployUnavailableReason: reason };
}

export function stampDeployContract(ventureId, input, options = {}) {
  const effect = { ...(input ?? {}) };
  for (const field of HOST_FIELDS) delete effect[field];
  if (String(effect.kind ?? "").trim().toLowerCase() !== "deploy") return effect;

  const venture = openVenture(ventureId, options);
  if (!venture) return unavailable(effect, "The venture repository is unavailable, so this deploy cannot run.");
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(venture.repository, "package.json"), "utf8"));
  } catch {
    return unavailable(effect, "The bound repository has no readable package.json deploy contract.");
  }
  const scripts = manifest?.scripts && typeof manifest.scripts === "object" ? manifest.scripts : {};
  const requested = text(effect.deployScript ?? effect.script) ?? (typeof scripts.deploy === "string" ? "deploy" : null);
  if (!requested) return unavailable(effect, "Name an existing package.json deploy script before authorizing this deploy.");
  if (!SCRIPT_NAME.test(requested) || typeof scripts[requested] !== "string" || !scripts[requested].trim()) {
    return unavailable(effect, `The package.json script “${requested}” is unavailable for this venture.`);
  }
  const destination = text(effect.destination ?? effect.environment ?? effect.target ?? effect.url);
  if (!destination) return unavailable(effect, "Name the exact deployment destination before authorizing this deploy.");
  const contract = {
    runner: "npm",
    script: requested,
    command: `npm run ${requested}`,
    definition: scripts[requested].trim(),
    destination,
  };
  return { ...effect, deployContract: { ...contract, digest: contractDigest(contract) } };
}

export function verifyDeployContract(ventureId, effect, options = {}) {
  const recorded = effect?.deployContract;
  if (!recorded || typeof recorded !== "object") {
    return { ok: false, error: text(effect?.deployUnavailableReason) ?? "This deploy has no verified repository command." };
  }
  const current = stampDeployContract(ventureId, { ...effect, deployScript: recorded.script }, options);
  if (!current.deployContract || current.deployContract.digest !== recorded.digest) {
    return { ok: false, error: "The repository deploy command or destination changed after review. Prepare and authorize a new deploy." };
  }
  return { ok: true, venture: openVenture(ventureId, options), contract: current.deployContract };
}
