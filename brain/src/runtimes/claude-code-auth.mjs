import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function findClaudeBinary(env = process.env) {
  const override = env.GTM_IDE_CLAUDE_CODE_PATH;
  if (override) {
    return fs.existsSync(override)
      ? { ok: true, path: override }
      : { ok: false, reason: `GTM_IDE_CLAUDE_CODE_PATH does not exist: ${override}` };
  }
  const lookup = process.platform === "win32" ? "where" : "which";
  const found = spawnSync(lookup, ["claude"], { encoding: "utf8" });
  const resolved = found.status === 0 ? found.stdout.split("\n")[0].trim() : "";
  return resolved
    ? { ok: true, path: resolved }
    : { ok: false, reason: "The `claude` CLI was not found on PATH." };
}

export function hasStoredClaudeLogin(env = process.env) {
  if (process.platform === "darwin") {
    const found = spawnSync(
      "security",
      ["find-generic-password", "-s", "Claude Code-credentials"],
      { encoding: "utf8" },
    );
    if (found.status === 0) return true;
  }
  const home = env.HOME || os.homedir();
  return Boolean(home && fs.existsSync(path.join(home, ".claude", ".credentials.json")));
}

export function detectClaudeAuth(env = process.env, probe = hasStoredClaudeLogin) {
  if (env.CLAUDE_CODE_OAUTH_TOKEN) return { mode: "oauth-token" };
  if (probe(env)) return { mode: "oauth-login" };
  if (env.ANTHROPIC_API_KEY) return { mode: "api-key" };
  return { mode: "none" };
}

export function authModeLabel(mode) {
  switch (mode) {
    case "oauth-token": return "Claude subscription (OAuth token)";
    case "oauth-login": return "Claude subscription";
    case "api-key": return "Anthropic API key";
    default: return null;
  }
}
