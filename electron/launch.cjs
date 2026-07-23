const { spawn } = require("node:child_process");
const path = require("node:path");

// Some coding-agent and Electron test environments set this globally so the Electron executable
// behaves like Node. That mode cannot start a desktop app, so keep it out of Croki's real launch.
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(require("electron"), [path.join(__dirname, "..")], {
  env,
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(`Could not launch Croki: ${error.message}`);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    if (!child.killed) child.kill(signal);
  });
}
