#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const HIGHEST_FOUNDER_APPROVED_MAJOR = 0;

export function versionPolicyIssues({
  packageVersion,
  lockVersion,
  lockRootVersion,
  approvedMajor = HIGHEST_FOUNDER_APPROVED_MAJOR,
} = {}) {
  const issues = [];
  const match = String(packageVersion ?? "").match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    issues.push("Croki's package version must use exact X.Y.Z semantic versioning.");
    return issues;
  }
  const major = Number(match[1]);
  if (major > approvedMajor) {
    issues.push(
      `Croki ${packageVersion} crosses the founder-gated 1.0 boundary. `
      + "Only an explicit founder decision may raise the approved major version.",
    );
  }
  if (lockVersion !== packageVersion || lockRootVersion !== packageVersion) {
    issues.push(
      `Croki's package and lockfile versions disagree `
      + `(package ${packageVersion}; lock ${lockVersion}; root ${lockRootVersion}).`,
    );
  }
  return issues;
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
  const issues = versionPolicyIssues({
    packageVersion: manifest.version,
    lockVersion: lock.version,
    lockRootVersion: lock.packages?.[""]?.version,
  });
  if (issues.length) {
    process.stderr.write(`${issues.map((issue) => `- ${issue}`).join("\n")}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `Croki ${manifest.version} version policy verified `
    + `(major versions above ${HIGHEST_FOUNDER_APPROVED_MAJOR} require a new founder decision).\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
