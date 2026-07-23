// The founder's @-file reach in the Work composer, read straight from the venture repository. The
// coding agent already reads whatever file the founder names in prose; this only lets the founder name
// it exactly — tracked and untracked-but-not-ignored paths, repo-relative — so an @-mention inserts a
// real path instead of a guess. It grants nothing: it is a read of what git already sees.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { openVenture } from "./venture-store.mjs";

// Enough to cover any real product tree the founder would scope against, bounded so a monorepo cannot
// stream an unbounded list into the composer. The UI filters this set as the founder types.
const MAX_FILES = 4000;

function repositoryRoot(ventureId, options) {
  const repository = openVenture(ventureId, options)?.repository;
  if (!repository) return null;
  try {
    return fs.realpathSync(path.resolve(String(repository)));
  } catch {
    return null;
  }
}

/**
 * Repo-relative paths git tracks or would track (untracked, not ignored), sorted and capped. Fail-open:
 * a blind or non-git venture yields an empty list, never an error the composer feels.
 */
export function listRepositoryFiles(ventureId, options = {}) {
  const root = repositoryRoot(ventureId, options);
  if (!root) return [];
  let out;
  try {
    out = execFileSync(
      "git",
      ["-C", root, "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] },
    );
  } catch {
    return [];
  }
  const files = out.split("\0").map((entry) => entry.trim()).filter(Boolean);
  return [...new Set(files)].sort((left, right) => left.localeCompare(right)).slice(0, MAX_FILES);
}
