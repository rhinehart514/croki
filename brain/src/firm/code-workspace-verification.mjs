import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

export const PROJECT_CHECK_TIMEOUT_MS = 15 * 60_000;
const FORCE_KILL_DELAY_MS = 2_000;
const OUTPUT_LIMIT = 16_000;

function completedAt() {
  return new Date().toISOString();
}

function appendTail(current, chunk) {
  return `${current}${String(chunk ?? "")}`.slice(-OUTPUT_LIMIT);
}

export function hostProjectCheck(worktree, {
  spawnProcess = spawn,
  timeoutMs = PROJECT_CHECK_TIMEOUT_MS,
  forceKillDelayMs = FORCE_KILL_DELAY_MS,
} = {}) {
  const packagePath = path.join(worktree, "package.json");
  if (!fs.existsSync(packagePath)) return Promise.resolve(null);
  const manifest = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  if (!manifest?.scripts?.test) return Promise.resolve(null);

  const startedAt = completedAt();
  const env = { ...process.env };
  for (const key of Object.keys(env).filter((entry) => entry.startsWith("GIT_CONFIG_"))) delete env[key];

  return new Promise((resolve) => {
    let output = "";
    let settled = false;
    let timedOut = false;
    let forceKillTimer = null;
    const child = spawnProcess("npm", ["test"], {
      cwd: worktree,
      env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const finish = ({ code = 1, error = null, signal = null } = {}) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      if (timedOut) output = appendTail(output, `\nProject verification timed out after ${timeoutMs}ms.`);
      if (signal) output = appendTail(output, `\nProcess ended with ${signal}.`);
      if (error) output = appendTail(output, `\n${error.message ?? String(error)}`);
      resolve({
        command: "npm test",
        kind: "host-project",
        status: !timedOut && !error && code === 0 ? "passed" : "failed",
        exitCode: Number.isInteger(code) ? code : 1,
        startedAt,
        completedAt: completedAt(),
        output: output.trim(),
      });
    };

    child.stdout?.on("data", (chunk) => { output = appendTail(output, chunk); });
    child.stderr?.on("data", (chunk) => { output = appendTail(output, chunk); });
    child.once("error", (error) => finish({ error }));
    child.once("close", (code, signal) => finish({ code, signal }));

    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      forceKillTimer = setTimeout(() => child.kill("SIGKILL"), forceKillDelayMs);
      forceKillTimer.unref?.();
    }, timeoutMs);
    timeoutTimer.unref?.();
  });
}
