"use strict";

const path = require("node:path");
const { execFileSync } = require("node:child_process");

function gitText(execFile, root, args) {
  return String(execFile("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 4 * 1024 * 1024,
  }) ?? "").trim();
}

function buildIdentity({
  version = "0.0.0",
  packaged = false,
  root = path.join(__dirname, ".."),
  execFile = execFileSync,
} = {}) {
  if (packaged) {
    return Object.freeze({
      channel: "production",
      version,
      revision: null,
      modified: false,
      label: `Croki ${version}`,
    });
  }
  let revision = null;
  let modified = false;
  try {
    revision = gitText(execFile, root, ["rev-parse", "--short=8", "HEAD"]) || null;
    modified = Boolean(gitText(execFile, root, ["status", "--porcelain=v1", "--untracked-files=normal"]));
  } catch {
    // A source archive may not carry Git metadata; the development channel and version remain honest.
  }
  const detail = [revision, modified ? "modified" : null].filter(Boolean);
  return Object.freeze({
    channel: "development",
    version,
    revision,
    modified,
    label: `Development Build · ${version}${detail.length ? ` · ${detail.join(" · ")}` : ""}`,
  });
}

module.exports = { buildIdentity };
