// Live-renderer launch: start the Vite dev server, wait until it answers, then run the desktop
// shell against it through the loopback development hatch. UI edits hot-reload inside the real
// Electron window; Brain and electron/*.cjs changes still need a relaunch. Packaged builds never
// use this path.

const { spawn } = require("node:child_process");
const path = require("node:path");

const DEV_SERVER_URL = "http://127.0.0.1:5173/";
const repoRoot = path.join(__dirname, "..");

// Some coding-agent and Electron test environments set this globally so the Electron executable
// behaves like Node. That mode cannot start a desktop app, so keep it out of Croki's real launch.
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

let electron = null;
let shuttingDown = false;

// Vite binds only IPv6 ::1 by default; pin the IPv4 loopback so it matches DEV_SERVER_URL exactly.
const vite = spawn("npm", ["run", "dev", "--workspace", "ui", "--", "--host", "127.0.0.1", "--port", "5173", "--strictPort"], {
  cwd: repoRoot,
  env,
  stdio: "inherit",
});

function stop(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  process.exitCode = code;
  if (electron && electron.exitCode === null && !electron.killed) electron.kill("SIGTERM");
  if (vite.exitCode === null && !vite.killed) vite.kill("SIGTERM");
}

vite.on("error", (error) => {
  console.error(`Could not start the Vite dev server: ${error.message}`);
  stop(1);
});
vite.on("exit", (code) => {
  if (shuttingDown) return;
  console.error("The Vite dev server exited; closing the live desktop session.");
  stop(code ?? 1);
});

async function waitForDevServer(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && !shuttingDown) {
    try {
      const response = await fetch(DEV_SERVER_URL, { redirect: "manual" });
      if (response.status < 500) return true;
    } catch {
      // Not listening yet; keep polling.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function main() {
  const ready = await waitForDevServer();
  if (shuttingDown) return;
  if (!ready) {
    console.error(`The Vite dev server never answered at ${DEV_SERVER_URL} (is port 5173 free?).`);
    stop(1);
    return;
  }
  electron = spawn(require("electron"), [repoRoot], {
    env: { ...env, DROVER_DEV_SERVER: DEV_SERVER_URL },
    stdio: "inherit",
  });
  electron.on("error", (error) => {
    console.error(`Could not launch Croki: ${error.message}`);
    stop(1);
  });
  electron.on("exit", (code, signal) => {
    stop(signal ? 1 : (code ?? 1));
  });
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => stop(0));
}

void main();
