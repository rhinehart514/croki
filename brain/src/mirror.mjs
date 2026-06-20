#!/usr/bin/env node
// GTM IDE repository mirror.
// Usage: node src/mirror.mjs <repo-path> [--win project_created]

import { scanRepo } from "./scan.mjs";

function parseArgs(argv) {
  const args = [...argv];
  let repoPath = ".";
  let winEvent = "project_created";

  while (args.length) {
    const value = args.shift();
    if (value === "--win") winEvent = args.shift() || winEvent;
    else repoPath = value;
  }
  return { repoPath, winEvent };
}

try {
  const { repoPath, winEvent } = parseArgs(process.argv.slice(2));
  const report = scanRepo(repoPath, { winEvent });
  console.log(JSON.stringify(report, null, 2));
  console.error(`\n${report.headline}\n`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
