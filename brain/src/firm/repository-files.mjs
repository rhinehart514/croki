// The founder's @-file reach in the Work composer, read straight from the venture repository. The
// coding agent already reads whatever file the founder names in prose; this only lets the founder name
// it exactly — tracked and untracked-but-not-ignored paths, repo-relative — so an @-mention inserts a
// real path instead of a guess. It grants nothing: it is a read of what git already sees.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { patchDigest } from "../git-patch.mjs";
import { diffCheckpoints, restoreCheckpoint } from "../native-code/t3-checkpoint-store.mjs";
import { CODE_WORKSPACE_COLLECTION, assertCodingWorkspaceIdentity } from "./code-workspace.mjs";
import { emitFirmEvent } from "./firm-events.mjs";
import { createReviewComment, reviewEvidenceState } from "./git-review-state.mjs";
import { recordCheckpointRestored } from "./work-journal-runtime.mjs";
import { getVentureDoc, now, openVenture, setVentureDoc } from "./venture-store.mjs";

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

export function readVentureRepositoryFile(ventureId, input = {}, options = {}) {
  const root = repositoryRoot(ventureId, options);
  if (!root) {
    browseFail("The venture repository is unavailable.", "repository_workspace_unavailable", 404);
  }
  const relative = safeRelative(input.file);
  let visible = "";
  try {
    visible = execFileSync("git", ["-C", root, "ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", relative], { encoding: "utf8", timeout: 3_000, stdio: ["ignore", "pipe", "ignore"] });
  } catch { /* A non-git or unreadable repository exposes no source. */ }
  if (!visible.split("\0").includes(relative)) browseFail("Repository source must be tracked or unignored.", "repository_path_unavailable", 404);
  return readWorkspaceRepositoryFile(root, { ...input, file: relative });
}

// The founder's repository browser uses the same git-visible path authority as @-file scoping, but
// against an already-validated isolated coding worktree. These limits keep tree/search pages
// virtualizable and prevent an unchanged file from becoming an unbounded renderer payload.
const MAX_INDEXED_PATHS = 100_000;
const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 100;
const MAX_TEXT_BYTES = 2_000_000;
const MAX_IMAGE_BYTES = 8_000_000;
const MAX_READ_LINES = 1_000;
const DEFAULT_READ_LINES = 400;
const FORBIDDEN_PARTS = new Set([".git", "node_modules"]);
const MARKDOWN_EXTENSIONS = new Set([".md", ".mdx", ".markdown", ".mdown"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico", ".avif"]);
const WEB_EXTENSIONS = new Set([".html", ".htm", ".css", ".svg"]);
const BINARY_EXTENSIONS = new Set([
  ".pdf", ".zip", ".gz", ".tgz", ".7z", ".rar", ".wasm", ".exe", ".dll", ".so", ".dylib",
  ".class", ".jar", ".woff", ".woff2", ".ttf", ".otf", ".mp3", ".mp4", ".mov", ".wav",
]);

function browseFail(message, code = "repository_path_invalid", status = 400) {
  throw Object.assign(new Error(message), { code, status });
}

function safeRelative(value, { allowRoot = false } = {}) {
  const relative = String(value ?? "").trim().replaceAll("\\", "/").replace(/^\.\/+/, "");
  if (allowRoot && !relative) return "";
  const parts = relative.split("/");
  if (
    !relative
    || path.posix.isAbsolute(relative)
    || parts.some((part) => !part || part === "." || part === "..")
    || parts.some((part) => FORBIDDEN_PARTS.has(part) || part.startsWith(".env"))
  ) {
    browseFail("Repository browsing needs a safe worktree-relative path outside git metadata and secret-bearing files.");
  }
  return parts.join("/");
}

function exactRoot(inputRoot) {
  let root;
  try {
    root = fs.realpathSync(path.resolve(String(inputRoot ?? "")));
  } catch {
    browseFail("The isolated repository workspace is unavailable.", "repository_workspace_unavailable", 404);
  }
  if (!fs.statSync(root).isDirectory()) {
    browseFail("The isolated repository workspace is unavailable.", "repository_workspace_unavailable", 404);
  }
  return root;
}

function indexedWorkspacePaths(inputRoot) {
  const root = exactRoot(inputRoot);
  let output;
  try {
    output = execFileSync(
      "git",
      ["-C", root, "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      {
        encoding: "utf8",
        timeout: 3_000,
        maxBuffer: 64 * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
  } catch {
    browseFail("The isolated repository index could not be read.", "repository_index_unavailable", 409);
  }
  const seen = new Set();
  const paths = [];
  let truncated = false;
  for (const raw of output.split("\0")) {
    if (!raw) continue;
    let relative;
    try { relative = safeRelative(raw); } catch { continue; }
    if (seen.has(relative)) continue;
    if (paths.length >= MAX_INDEXED_PATHS) {
      truncated = true;
      break;
    }
    seen.add(relative);
    paths.push(relative);
  }
  paths.sort((left, right) => left.localeCompare(right));
  return { root, paths, truncated };
}

function page(items, { cursor = 0, limit = DEFAULT_PAGE_SIZE } = {}) {
  const offset = Number(cursor ?? 0);
  const size = Number(limit ?? DEFAULT_PAGE_SIZE);
  if (!Number.isSafeInteger(offset) || offset < 0) {
    browseFail("Repository pagination cursor must be a non-negative integer.", "repository_cursor_invalid");
  }
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_PAGE_SIZE) {
    browseFail(`Repository pagination limit must be between 1 and ${MAX_PAGE_SIZE}.`, "repository_limit_invalid");
  }
  const entries = items.slice(offset, offset + size);
  const next = offset + entries.length;
  return {
    entries,
    cursor: offset,
    nextCursor: next < items.length ? next : null,
    limit: size,
    total: items.length,
  };
}

function presentationFor(relative, binary = false) {
  if (binary) return "binary";
  const extension = path.posix.extname(relative).toLowerCase();
  if (MARKDOWN_EXTENSIONS.has(extension)) return "markdown";
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (WEB_EXTENSIONS.has(extension)) return "web";
  if (BINARY_EXTENSIONS.has(extension)) return "binary";
  return "text";
}

function exactPath(root, requestedPath) {
  const relative = safeRelative(requestedPath);
  let current = root;
  for (const part of relative.split("/")) {
    current = path.join(current, part);
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
        return { relative, absolute: current, state: "removed", stat: null };
      }
      throw error;
    }
    if (stat.isSymbolicLink()) {
      browseFail("Repository reads refuse symlinks, including links whose target stays inside the worktree.", "repository_symlink_forbidden", 403);
    }
  }
  const real = fs.realpathSync(current);
  const inside = real === root || real.startsWith(`${root}${path.sep}`);
  if (!inside) browseFail("Repository path escapes the isolated worktree.", "repository_path_escape", 403);
  const stat = fs.statSync(real);
  if (!stat.isFile()) browseFail("Repository file reads require a file.", "repository_file_invalid");
  return { relative, absolute: real, state: "present", stat };
}

function likelyBinary(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 16_384));
  if (sample.includes(0)) return true;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(sample);
    return false;
  } catch {
    return true;
  }
}

function exactReference(relative, startLine, endLine, digest) {
  return `repository:${relative}#L${startLine}-L${endLine}:${digest.slice(0, 12)}`;
}

export function listWorkspaceRepositoryTree(inputRoot, {
  directory = "",
  cursor = 0,
  limit = DEFAULT_PAGE_SIZE,
} = {}) {
  const requestedDirectory = safeRelative(directory, { allowRoot: true });
  const { paths, truncated } = indexedWorkspacePaths(inputRoot);
  const prefix = requestedDirectory ? `${requestedDirectory}/` : "";
  const children = new Map();
  for (const relative of paths) {
    if (!relative.startsWith(prefix)) continue;
    const remainder = relative.slice(prefix.length);
    if (!remainder) continue;
    const [name, ...tail] = remainder.split("/");
    const childPath = prefix + name;
    const kind = tail.length ? "directory" : "file";
    const known = children.get(childPath);
    if (!known || known.kind !== "directory") {
      children.set(childPath, {
        path: childPath,
        name,
        kind,
        presentation: kind === "file" ? presentationFor(childPath) : null,
      });
    }
  }
  const ordered = [...children.values()].sort((left, right) => (
    left.kind === right.kind
      ? left.name.localeCompare(right.name)
      : left.kind === "directory" ? -1 : 1
  ));
  return {
    workspacePath: requestedDirectory,
    ...page(ordered, { cursor, limit }),
    truncated,
  };
}

export function searchWorkspaceRepositoryPaths(inputRoot, {
  query,
  cursor = 0,
  limit = DEFAULT_PAGE_SIZE,
} = {}) {
  const needle = String(query ?? "").trim().toLocaleLowerCase();
  if (!needle || needle.length > 200) {
    browseFail("Repository path search needs a query between 1 and 200 characters.", "repository_search_invalid");
  }
  const { paths, truncated } = indexedWorkspacePaths(inputRoot);
  const matches = paths
    .filter((relative) => relative.toLocaleLowerCase().includes(needle))
    .sort((left, right) => {
      const leftName = path.posix.basename(left).toLocaleLowerCase();
      const rightName = path.posix.basename(right).toLocaleLowerCase();
      const leftRank = leftName === needle ? 0 : leftName.startsWith(needle) ? 1 : left.toLocaleLowerCase().startsWith(needle) ? 2 : 3;
      const rightRank = rightName === needle ? 0 : rightName.startsWith(needle) ? 1 : right.toLocaleLowerCase().startsWith(needle) ? 2 : 3;
      return leftRank - rightRank || left.localeCompare(right);
    })
    .map((relative) => ({
      path: relative,
      name: path.posix.basename(relative),
      presentation: presentationFor(relative),
    }));
  return { query: String(query).trim(), ...page(matches, { cursor, limit }), truncated };
}

export function readWorkspaceRepositoryFile(inputRoot, {
  file,
  startLine = 1,
  endLine = null,
} = {}) {
  const root = exactRoot(inputRoot);
  const exact = exactPath(root, file);
  if (exact.state === "removed") {
    return {
      state: "removed",
      path: exact.relative,
      presentation: presentationFor(exact.relative),
      size: null,
      lineCount: null,
      message: "This file no longer exists in the isolated workspace.",
    };
  }
  const presentation = presentationFor(exact.relative);
  const byteLimit = presentation === "image" ? MAX_IMAGE_BYTES : MAX_TEXT_BYTES;
  if (exact.stat.size > byteLimit) {
    return {
      state: "oversized",
      path: exact.relative,
      presentation,
      size: exact.stat.size,
      limit: byteLimit,
      lineCount: null,
      message: `This ${exact.stat.size}-byte file exceeds the ${byteLimit}-byte review limit.`,
    };
  }

  const descriptor = fs.openSync(
    exact.absolute,
    fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
  );
  let bytes;
  try {
    bytes = fs.readFileSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  const digest = crypto.createHash("sha256").update(bytes).digest("hex");
  if (presentation === "image") {
    return {
      state: "ready",
      path: exact.relative,
      presentation,
      size: bytes.length,
      digest,
      encoding: "base64",
      content: bytes.toString("base64"),
      lineCount: null,
    };
  }
  if (presentation === "binary" || likelyBinary(bytes)) {
    return {
      state: "binary",
      path: exact.relative,
      presentation: "binary",
      size: bytes.length,
      digest,
      lineCount: null,
      message: "This file is binary and cannot be shown as source text.",
    };
  }

  const text = bytes.toString("utf8");
  const lines = text.split(/\r?\n/);
  const from = Number(startLine ?? 1);
  const requestedEnd = endLine == null ? from + DEFAULT_READ_LINES - 1 : Number(endLine);
  if (
    !Number.isSafeInteger(from)
    || !Number.isSafeInteger(requestedEnd)
    || from < 1
    || requestedEnd < from
    || requestedEnd - from + 1 > MAX_READ_LINES
  ) {
    browseFail(`Repository file reads need a valid range of at most ${MAX_READ_LINES} lines.`, "repository_range_invalid");
  }
  if (from > lines.length) {
    browseFail(`Repository file read begins beyond ${exact.relative}'s ${lines.length} lines.`, "repository_range_invalid");
  }
  const to = Math.min(requestedEnd, lines.length);
  const content = lines.slice(from - 1, to).join("\n");
  const rangeDigest = crypto.createHash("sha256").update(content).digest("hex");
  return {
    state: "ready",
    path: exact.relative,
    presentation,
    size: bytes.length,
    digest,
    lineCount: lines.length,
    startLine: from,
    endLine: to,
    hasMoreBefore: from > 1,
    hasMoreAfter: to < lines.length,
    ref: exactReference(exact.relative, from, to, rangeDigest),
    content,
  };
}

function reviewGit(cwd, args) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 32 * 1024 * 1024,
    }).trim();
  } catch (error) {
    throw new Error(error?.stderr?.toString?.().trim() || `git ${args.join(" ")} failed.`);
  }
}

function exactReview(ventureId, id, options) {
  const record = getVentureDoc(ventureId, CODE_WORKSPACE_COLLECTION, id, options);
  if (!record) throw new Error(`No such coding workspace: ${id}`);
  return record;
}

function saveReview(record, options) {
  const updated = { ...record, updatedAt: now() };
  setVentureDoc(updated.ventureId, CODE_WORKSPACE_COLLECTION, updated.id, updated, options);
  emitFirmEvent(updated.ventureId, "timeline", { threadRef: updated.threadRef });
  return updated;
}

function reviewChangedFiles(worktree, fromRef, toRef) {
  const output = reviewGit(worktree, ["diff", "--name-status", fromRef, toRef, "--"]);
  return output ? output.split("\n").map((entry) => {
    const [status, ...parts] = entry.split("\t");
    return { status, path: parts.at(-1) };
  }) : [];
}

export function addCodingReviewComment(ventureId, id, input, options = {}) {
  const record = exactReview(ventureId, id, options);
  const comment = createReviewComment(record, input, now());
  const reviewComments = [...(record.reviewComments ?? []).filter((entry) => entry.id !== comment.id), comment];
  return { workspace: saveReview({ ...record, reviewComments }, options), comment };
}

export function compareCodingWorkspaceCheckpoints(ventureId, id, fromId, toId, options = {}) {
  const record = exactReview(ventureId, id, options);
  const from = record.checkpoints?.find((entry) => entry.id === fromId);
  const to = record.checkpoints?.find((entry) => entry.id === toId);
  if (!from || !to) throw new Error("Checkpoint comparison needs two exact checkpoints from this Review.");
  const { worktree } = assertCodingWorkspaceIdentity(record);
  return {
    from: { id: from.id, runRef: from.runRef ?? null, originMessageRef: from.originMessageRef ?? null, direction: from.direction ?? null },
    to: { id: to.id, runRef: to.runRef ?? null, originMessageRef: to.originMessageRef ?? null, direction: to.direction ?? null },
    diff: diffCheckpoints({ worktree, fromRef: from.ref, toRef: to.ref }),
    changedFiles: reviewChangedFiles(worktree, from.ref, to.ref),
    evidence: reviewEvidenceState(record),
  };
}

export function restoreCodingWorkspaceCheckpoint(ventureId, id, checkpointId, options = {}) {
  const record = exactReview(ventureId, id, options);
  const checkpoint = record.checkpoints?.find((entry) => entry.id === checkpointId);
  if (!checkpoint) throw new Error(`No such checkpoint on this coding workspace: ${checkpointId}`);
  const { worktree } = assertCodingWorkspaceIdentity(record);
  restoreCheckpoint({ worktree, ref: checkpoint.ref });
  const baseline = record.checkpoints.find((entry) => entry.id === "baseline");
  const diff = diffCheckpoints({ worktree, fromRef: baseline.ref, toRef: checkpoint.ref });
  const restoredAt = now();
  const restorationId = `restore-${record.checkpoints.filter((entry) => entry.id.startsWith("restore-")).length + 1}`;
  const receipt = {
    ...checkpoint,
    id: restorationId,
    runRef: null,
    sourceRunRef: checkpoint.runRef ?? null,
    restoredFrom: checkpointId,
    restoredBy: "founder",
    capturedAt: restoredAt,
  };
  const restored = saveReview({
    ...record,
    status: diff ? "needs-verification" : "no-change",
    checkpoints: [...record.checkpoints, receipt],
    changedFiles: reviewChangedFiles(worktree, baseline.ref, checkpoint.ref),
    diff,
    diffStat: reviewGit(worktree, ["diff", "--stat", baseline.ref, checkpoint.ref, "--"]),
    patchHash: patchDigest(diff),
    verification: [],
    decisions: record.consequence ? [...(record.decisions ?? []), record.consequence] : record.decisions ?? [],
    consequence: null,
    interruption: null,
    restoration: {
      checkpointId,
      restoredAt,
      receiptId: restorationId,
      note: "The exact repository snapshot was restored by an appended receipt. Verification and founder review are required again.",
    },
  }, options);
  recordCheckpointRestored(ventureId, restored, checkpoint.runRef ?? record.runRefs?.at(-1), receipt, options);
  return restored;
}

export const repositoryBrowserLimits = Object.freeze({
  maxIndexedPaths: MAX_INDEXED_PATHS,
  maxPageSize: MAX_PAGE_SIZE,
  maxTextBytes: MAX_TEXT_BYTES,
  maxImageBytes: MAX_IMAGE_BYTES,
  maxReadLines: MAX_READ_LINES,
});
