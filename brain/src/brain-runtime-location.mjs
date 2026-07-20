import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { storeRoot } from "./persistence.mjs";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

export function brainRuntimeFile(options = {}) {
  return path.join(storeRoot(options), ".runtime", "brain.json");
}

function normalizeEndpoint(raw) {
  const url = new URL(raw);
  if (url.protocol !== "http:" || !LOOPBACK_HOSTS.has(url.hostname) || url.username || url.password || url.pathname !== "/") {
    throw new Error("Drover Brain must use an uncredentialed loopback HTTP origin.");
  }
  return url.origin;
}

function normalizeRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const port = Number(value.port);
  const instanceId = String(value.instanceId ?? "").trim();
  const pid = Number(value.pid);
  const startedAt = String(value.startedAt ?? "").trim();
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !instanceId || !Number.isInteger(pid) || pid < 1 || !Number.isFinite(Date.parse(startedAt))) return null;
  return { port, instanceId, pid, startedAt };
}

export function publishBrainRuntime(record, options = {}) {
  const normalized = normalizeRecord(record);
  if (!normalized) throw new Error("A Brain runtime location needs a valid port, instance, process, and start time.");
  const file = brainRuntimeFile(options);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(normalized, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temp, file);
  return normalized;
}

export function readBrainRuntime(options = {}) {
  try {
    return normalizeRecord(JSON.parse(fs.readFileSync(brainRuntimeFile(options), "utf8")));
  } catch (error) {
    if (error?.code === "ENOENT" || error instanceof SyntaxError) return null;
    throw error;
  }
}

export function clearBrainRuntime(instanceId, options = {}) {
  const current = readBrainRuntime(options);
  if (!current || current.instanceId !== instanceId) return false;
  fs.rmSync(brainRuntimeFile(options), { force: true });
  return true;
}

export function resolveBrainEndpoint(options = {}) {
  const explicit = String(options.url ?? process.env.DROVER_BRAIN_URL ?? "").trim();
  if (explicit) return { baseUrl: normalizeEndpoint(explicit), instanceId: null, source: "explicit" };
  const runtime = readBrainRuntime(options);
  if (runtime) return { baseUrl: `http://127.0.0.1:${runtime.port}`, instanceId: runtime.instanceId, source: "desktop" };
  return { baseUrl: "http://127.0.0.1:4317", instanceId: null, source: "development" };
}
