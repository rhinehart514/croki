import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

function gitRaw(cwd, args, { allowDifference = false } = {}) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (error) {
    if (allowDifference && error?.status === 1 && typeof error.stdout === "string") return error.stdout;
    const stderr = error?.stderr?.toString?.().trim();
    throw new Error(stderr || `git ${args.join(" ")} failed.`);
  }
}

// A normal `git diff` silently omits new files. Product-change review cannot do that: the founder must
// approve the exact applyable patch, including untracked text/binary files. Keep the bytes Git emits
// intact (no trim), then append one --no-index patch per untracked path. The result is accepted by
// `git apply` and remains stable enough to hash as the review snapshot identity.
export function completeUncommittedPatch(worktree) {
  const parts = [gitRaw(worktree, ["diff", "--binary", "--no-ext-diff", "--no-color", "HEAD", "--"])]
    .filter(Boolean);
  const untracked = gitRaw(worktree, ["ls-files", "--others", "--exclude-standard", "-z"])
    .split("\0")
    .filter(Boolean)
    .sort();
  for (const file of untracked) {
    parts.push(gitRaw(worktree, [
      "diff", "--binary", "--no-ext-diff", "--no-color", "--no-index", "--", "/dev/null", file,
    ], { allowDifference: true }));
  }
  return parts.filter(Boolean).map((part) => part.endsWith("\n") ? part : `${part}\n`).join("");
}

export function patchDigest(patch) {
  return crypto.createHash("sha256").update(String(patch ?? ""), "utf8").digest("hex");
}
