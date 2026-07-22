import { spawnSync } from "node:child_process";
import fs from "node:fs";

export function findCodexBinary(env = process.env) {
  const override = env.GTM_IDE_CODEX_PATH;
  if (override) {
    return fs.existsSync(override)
      ? { ok: true, path: override }
      : { ok: false, reason: `GTM_IDE_CODEX_PATH does not exist: ${override}` };
  }
  const lookup = process.platform === "win32" ? "where" : "which";
  const found = spawnSync(lookup, ["codex"], { encoding: "utf8" });
  const resolved = found.status === 0 ? found.stdout.split("\n")[0].trim() : "";
  return resolved
    ? { ok: true, path: resolved }
    : { ok: false, reason: "The `codex` CLI was not found on PATH." };
}

// `codex login status` is the authoritative, redacted readiness probe.
export function hasCodexLogin(env = process.env, probe) {
  if (typeof probe === "function") return probe(env);
  const binary = findCodexBinary(env);
  if (!binary.ok) return false;
  const result = spawnSync(binary.path, ["login", "status"], {
    encoding: "utf8",
    env,
    timeout: 5_000,
  });
  return result.status === 0;
}

export function detectCodexAuth(env = process.env, probe) {
  return hasCodexLogin(env, probe) ? { mode: "chatgpt-login" } : { mode: "none" };
}

export function codexAuthModeLabel(mode) {
  return mode === "chatgpt-login" ? "ChatGPT subscription" : null;
}
