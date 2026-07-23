// This boundary adapts the temporary-index checkpoint technique from T3 Code's
// CheckpointStore.ts (https://github.com/pingdotgg/t3code), used under the MIT
// license preserved at licenses/t3code-MIT.txt. Croki owns the records and
// refs; this module only supplies isolated Git snapshot mechanics.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

function git(cwd, args, { env = process.env, input } = {}) {
  try {
    return execFileSync("git", args, {
      cwd,
      env,
      input,
      encoding: "utf8",
      stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
      maxBuffer: 32 * 1024 * 1024,
    }).trim();
  } catch (error) {
    const detail = error?.stderr?.toString?.().trim();
    throw new Error(detail || `git ${args.join(" ")} failed.`);
  }
}

function safeRef(value) {
  const ref = String(value ?? "").trim();
  if (!/^refs\/drover\/checkpoints\/[a-zA-Z0-9._/-]+$/.test(ref) || ref.includes("..")) {
    throw new Error("A Croki checkpoint needs a safe refs/drover/checkpoints/* ref.");
  }
  return ref;
}

export function captureCheckpoint({ worktree, ref, message }) {
  const checkpointRef = safeRef(ref);
  const commonDirRaw = git(worktree, ["rev-parse", "--git-common-dir"]);
  const commonDir = path.resolve(worktree, commonDirRaw);
  const tempIndex = path.join(commonDir, `drover-checkpoint-${process.pid}-${crypto.randomUUID()}.index`);
  const env = { ...process.env, GIT_INDEX_FILE: tempIndex };
  try {
    git(worktree, ["read-tree", "HEAD"], { env });
    git(worktree, ["add", "-A", "--", "."], { env });
    const tree = git(worktree, ["write-tree"], { env });
    const parent = git(worktree, ["rev-parse", "HEAD"]);
    const commit = git(worktree, ["commit-tree", tree, "-p", parent, "-m", String(message || "Croki checkpoint")], { env });
    git(worktree, ["update-ref", checkpointRef, commit]);
    return { ref: checkpointRef, commit, tree, capturedAt: new Date().toISOString() };
  } finally {
    try { fs.unlinkSync(tempIndex); } catch { /* the temporary index may never have been created */ }
  }
}

export function snapshotTree(worktree) {
  const commonDirRaw = git(worktree, ["rev-parse", "--git-common-dir"]);
  const commonDir = path.resolve(worktree, commonDirRaw);
  const tempIndex = path.join(commonDir, `drover-tree-${process.pid}-${crypto.randomUUID()}.index`);
  const env = { ...process.env, GIT_INDEX_FILE: tempIndex };
  try {
    git(worktree, ["read-tree", "HEAD"], { env });
    git(worktree, ["add", "-A", "--", "."], { env });
    return git(worktree, ["write-tree"], { env });
  } finally {
    try { fs.unlinkSync(tempIndex); } catch { /* the temporary index may never have been created */ }
  }
}

export function diffCheckpoints({ worktree, fromRef, toRef }) {
  return git(worktree, [
    "diff", "--patch", "--binary", "--no-color", "--no-ext-diff", "--no-textconv",
    safeRef(fromRef), safeRef(toRef), "--",
  ]);
}

export function restoreCheckpoint({ worktree, ref }) {
  const checkpointRef = safeRef(ref);
  git(worktree, ["restore", "--source", checkpointRef, "--worktree", "--staged", "--", "."]);
  git(worktree, ["clean", "-fd", "--", "."]);
  return { ref: checkpointRef, restoredAt: new Date().toISOString() };
}
