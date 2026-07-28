"use strict";

const { execFileSync } = require("node:child_process");

function packagedCrokiProcesses({
  platform = process.platform,
  listProcesses = () => execFileSync("/bin/ps", ["-axo", "pid=,command="], { encoding: "utf8" }),
} = {}) {
  if (platform !== "darwin") return [];
  return String(listProcesses() ?? "")
    .split(/\r?\n/)
    .flatMap((line) => {
      const match = line.trim().match(/^(\d+)\s+(.+)$/);
      if (!match || !/\/Croki\.app\/Contents\/MacOS\/Croki(?:\s|$)/.test(match[2])) return [];
      return [{ pid: Number(match[1]), command: match[2] }];
    });
}

function assertSourceLaunchAvailable(options = {}) {
  const running = packagedCrokiProcesses(options);
  if (!running.length) return;
  const error = new Error(
    "The updated Croki source build did not start because a packaged Croki is already running. "
    + "Quit Croki, then run the source command again. Nothing was deleted or replaced.",
  );
  error.code = "CROKI_PACKAGED_RUNNING";
  error.pids = running.map((entry) => entry.pid);
  throw error;
}

module.exports = { assertSourceLaunchAvailable, packagedCrokiProcesses };
