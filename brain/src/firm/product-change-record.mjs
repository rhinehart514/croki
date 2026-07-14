// Shared venture/bet identity and retained-worktree safety for product-change receipts.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { listFrictionQueue, DEFAULT_QUEUE_DIR } from "../friction.mjs";

export function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 2 * 1024 * 1024 }).trim();
}

// A retained worktree is safe to touch only if it still exists and still resolves inside its own
// repository's .dogfood-worktrees namespace — the same check feature-builder.mjs's own sandbox
// relies on, applied again here since a queue record is just text a founder could hand-edit.
export function safeWorkspace(record) {
  if (!record.worktree || !record.repository || !fs.existsSync(record.worktree) || !fs.existsSync(record.repository)) return null;
  const repo = fs.realpathSync(record.repository);
  const worktree = fs.realpathSync(record.worktree);
  const root = path.join(repo, ".dogfood-worktrees");
  const rel = path.relative(root, worktree);
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel) ? { repo, worktree } : null;
}

export function assertRetainedIdentity(record, safe) {
  const top = fs.realpathSync(git(safe.worktree, ["rev-parse", "--show-toplevel"]));
  if (top !== safe.worktree) throw new Error("The retained product-change worktree identity no longer matches its receipt.");
  const branch = git(safe.worktree, ["symbolic-ref", "--short", "HEAD"]);
  if (!record.branch || branch !== record.branch) throw new Error("The retained product-change branch no longer matches its receipt.");
  const head = git(safe.worktree, ["rev-parse", "HEAD"]);
  if (!record.baseCommit || head !== record.baseCommit) throw new Error("The retained product-change base moved after the isolated build.");
}

// The frontmatter forkProductBet() stamps that friction.mjs's own listFrictionQueue() does not
// surface (it only maps a fixed field allowlist). Reads the same head slice shape reportFriction/
// listFrictionQueue already parse, so a bet's queue items are found without touching friction.mjs.
export function readBetIdentity(queueDir, file) {
  const text = fs.readFileSync(path.join(queueDir, file), "utf8");
  const head = text.match(/^---\n([\s\S]*?)\n---/);
  const front = head?.[1] ?? "";
  const ventureId = front.match(/^venture_id:\s*(.*)$/m)?.[1]?.trim() ?? null;
  const betId = front.match(/^bet_id:\s*(.*)$/m)?.[1]?.trim() ?? null;
  return { ventureId, betId };
}

// The one feature-kind queue record on the given file that is stamped for this exact
// (ventureId, betId) — fails closed (same error either way) rather than distinguishing "wrong bet"
// from "no such receipt", so a caller cannot probe for another bet's receipt names.
export function betQueueRecord(ventureId, betId, file, options = {}) {
  const queueDir = options.queueDir ?? DEFAULT_QUEUE_DIR;
  const record = listFrictionQueue({ queueDir }).reports.find((item) => item.file === file && item.kind === "feature");
  if (!record) throw new Error("Product change receipt not found on this bet.");
  const identity = readBetIdentity(queueDir, file);
  if (identity.ventureId !== ventureId || identity.betId !== betId) {
    throw new Error("Product change receipt not found on this bet.");
  }
  return { record, queueDir };
}
