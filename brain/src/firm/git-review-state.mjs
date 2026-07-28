// Exact read-only source-control and GitHub state projected into one coding Review. This module
// never mutates a repository or remote; git-ship.mjs owns the founder-confirmed command path.

import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

function text(value) {
  return String(value ?? "").trim() || null;
}

function line(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function appendRunDirection(record, {
  runRef,
  originMessageRef = null,
  direction,
  at,
}) {
  const exactRunRef = text(runRef);
  if (!exactRunRef?.startsWith("run:")) throw new Error("Review attribution needs an exact Run.");
  const entry = {
    runRef: exactRunRef,
    originMessageRef: text(originMessageRef),
    direction: text(direction) ?? record.goal,
    at,
  };
  const directions = (record.reviewDirections ?? []).filter((candidate) => candidate.runRef !== exactRunRef);
  return {
    ...record,
    originMessageRef: record.originMessageRef ?? entry.originMessageRef,
    reviewDirections: [...directions, entry],
  };
}

export function directionForRun(record, runRef) {
  return (record.reviewDirections ?? []).find((entry) => entry.runRef === runRef)
    ?? {
      runRef,
      originMessageRef: record.originMessageRef ?? null,
      direction: record.goal,
      at: record.createdAt,
    };
}

export function attributeCheckpoint(record, checkpoint, runRef) {
  const direction = directionForRun(record, runRef);
  return {
    ...checkpoint,
    runRef,
    originMessageRef: direction.originMessageRef,
    direction: direction.direction,
  };
}

function changedLinesByPath(diff) {
  const paths = new Map();
  let currentPath = null;
  let newLine = 0;
  for (const raw of String(diff ?? "").split(/\r?\n/)) {
    const file = raw.match(/^diff --git\s+\S+\s+b\/(.+)$/);
    if (file) {
      currentPath = file[1];
      if (!paths.has(currentPath)) paths.set(currentPath, []);
      continue;
    }
    const next = raw.match(/^\+\+\+\s+(?:b\/)?(.+)$/);
    if (next && next[1] !== "/dev/null") {
      currentPath = next[1];
      if (!paths.has(currentPath)) paths.set(currentPath, []);
      continue;
    }
    const hunk = raw.match(/^@@\s+-\d+(?:,\d+)?\s+\+(\d+)/);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }
    if (!currentPath || raw.startsWith("---")) continue;
    if (raw.startsWith("+")) {
      paths.get(currentPath).push({ line: newLine, text: raw.slice(1) });
      newLine += 1;
    } else if (!raw.startsWith("-") && !raw.startsWith("\\")) {
      paths.get(currentPath).push({ line: newLine, text: raw.slice(1) });
      newLine += 1;
    }
  }
  return paths;
}

function remapComment(comment, diff, checkpointId, at) {
  const lines = changedLinesByPath(diff).get(comment.anchor.path) ?? [];
  const needle = text(comment.anchor.selectedText);
  if (!needle) {
    return {
      ...comment,
      mapping: "uncertain",
      mappingNote: "The selected text was not captured, so the original line remains exact but remapping is uncertain.",
    };
  }
  const match = lines.find((entry) => entry.text.trim() === needle);
  if (!match) {
    return {
      ...comment,
      mapping: "uncertain",
      mappingNote: "The exact selected text is absent from the new checkpoint; the original anchor is preserved.",
    };
  }
  const span = Math.max(0, comment.anchor.endLine - comment.anchor.startLine);
  return {
    ...comment,
    mapping: "remapped",
    currentAnchor: {
      checkpointId,
      path: comment.anchor.path,
      startLine: match.line,
      endLine: match.line + span,
      sourceRef: `diff:${comment.workspaceId}:${comment.anchor.path}#L${match.line}`,
    },
    remappedAt: at,
    mappingNote: null,
  };
}

export function reconcileReviewComments(record, { runRef, checkpointId, diff, at }) {
  const originMessageRef = directionForRun(record, runRef).originMessageRef;
  return (record.reviewComments ?? []).map((comment) => {
    const remapped = remapComment(comment, diff, checkpointId, at);
    return comment.messageRef && comment.messageRef === originMessageRef
      ? { ...remapped, addressedByRunRef: runRef, addressedAt: at, state: "addressed-awaiting-review" }
      : remapped;
  });
}

export function createReviewComment(record, input, at) {
  const exactPath = text(input.path);
  const startLine = line(input.startLine);
  const endLine = line(input.endLine) ?? startLine;
  const body = text(input.body);
  const checkpointId = text(input.checkpointId);
  if (!exactPath || !startLine || !endLine || endLine < startLine || !body || !checkpointId) {
    throw new Error("A review comment needs an exact checkpoint, file, line range, and readable correction.");
  }
  const messageRef = text(input.messageRef);
  if (messageRef && !messageRef.startsWith("conversation:")) {
    throw new Error("A review comment message must be an exact conversation reference.");
  }
  const stable = `${record.id}\0${checkpointId}\0${exactPath}\0${startLine}\0${endLine}\0${body}\0${messageRef ?? ""}`;
  const id = `comment-${crypto.createHash("sha256").update(stable).digest("hex").slice(0, 16)}`;
  const existing = (record.reviewComments ?? []).find((entry) => entry.id === id);
  if (existing) return existing;
  return {
    id,
    workspaceId: record.id,
    threadRef: record.threadRef,
    messageRef,
    body,
    state: "unresolved",
    mapping: "exact",
    anchor: {
      checkpointId,
      path: exactPath,
      startLine,
      endLine,
      selectedText: text(input.selectedText),
      sourceRef: text(input.sourceRef) ?? `diff:${record.id}:${exactPath}#L${startLine}`,
    },
    createdAt: at,
  };
}

export function reviewEvidenceState(record) {
  const latestRunRef = record.checkpoints?.at(-1)?.runRef ?? record.runRefs?.at(-1) ?? null;
  const allVerification = record.verification ?? [];
  const attributed = latestRunRef
    ? allVerification.filter((entry) => entry.runRef === latestRunRef)
    : allVerification;
  const verification = attributed.length || !latestRunRef
    ? attributed
    : allVerification.filter((entry) => !entry.runRef);
  const completed = verification.filter((entry) => entry.completedAt);
  const failed = completed.filter((entry) => entry.status === "failed");
  if (failed.length) return { state: "uncertain", note: `${failed.length} recorded verification check${failed.length === 1 ? "" : "s"} failed.` };
  const project = completed.filter((entry) => entry.kind === "host-project");
  const provider = completed.filter((entry) => entry.kind === "provider-command");
  const legacy = completed.filter((entry) => entry.kind !== "host" && entry.kind !== "host-project" && entry.kind !== "provider-command");
  const authoritative = project.length ? project : provider.length ? provider : legacy;
  if (!authoritative.some((entry) => entry.status === "passed")) {
    return { state: "unverified", note: "No successful verification is attributed to this exact checkpoint." };
  }
  return { state: "verified", note: "Captured verification is attributed to this exact checkpoint." };
}

function run(command, args, { cwd } = {}) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 16 * 1024 * 1024,
    timeout: 10_000,
  }).trim();
}

function tryGit(cwd, args) {
  try { return run("git", args, { cwd }); } catch { return null; }
}

function parseDirty(output) {
  if (!output) return [];
  return output.split("\0").filter(Boolean).map((entry) => ({
    status: entry.slice(0, 2).trim() || "??",
    path: entry.slice(3),
  })).filter((entry) => entry.path);
}

function parseCommits(cwd, range) {
  const output = tryGit(cwd, ["log", "--format=%H%x00%h%x00%an%x00%aI%x00%s%x1e", "-n", "25", range]);
  if (!output) return [];
  return output.split("\x1e").filter(Boolean).map((row) => {
    const [sha, shortSha, author, at, subject] = row.replace(/^\n/, "").split("\0");
    return { sha, shortSha, author, at, subject };
  }).filter((entry) => entry.sha);
}

function checkState(check) {
  return {
    name: String(check?.name ?? check?.context ?? "Check"),
    status: String(check?.status ?? "UNKNOWN").toLowerCase(),
    conclusion: check?.conclusion ? String(check.conclusion).toLowerCase() : null,
    url: check?.detailsUrl ?? check?.targetUrl ?? null,
  };
}

const githubCache = new Map();
const GITHUB_CACHE_MS = 30_000;

function defaultGh(cwd, args) {
  return run("gh", args, { cwd });
}

export function readGitHubPullRequest(cwd, branch, availability, ghExec = defaultGh, { fresh = false } = {}) {
  if (!availability?.available || !availability?.authenticated || !branch) {
    return { found: false, reason: availability?.reason ?? "No prepared GitHub branch is available.", pullRequest: null };
  }
  const key = `${cwd}\0${branch}`;
  const cached = githubCache.get(key);
  if (!fresh && ghExec === defaultGh && cached && Date.now() - cached.at < GITHUB_CACHE_MS) return cached.value;
  let value;
  try {
    const raw = ghExec(cwd, [
      "pr", "view", branch, "--json",
      "url,number,state,isDraft,mergeable,reviewDecision,reviewRequests,statusCheckRollup,headRefName,baseRefName",
    ]);
    const parsed = JSON.parse(raw);
    value = {
      found: true,
      reason: null,
      pullRequest: {
        url: parsed.url ?? null,
        number: Number(parsed.number) || null,
        state: String(parsed.state ?? "UNKNOWN").toLowerCase(),
        draft: parsed.isDraft === true,
        mergeable: String(parsed.mergeable ?? "UNKNOWN").toLowerCase(),
        reviewDecision: parsed.reviewDecision ? String(parsed.reviewDecision).toLowerCase() : null,
        reviewRequests: (parsed.reviewRequests ?? []).map((entry) => (
          entry?.login ?? entry?.name ?? entry?.slug ?? null
        )).filter(Boolean),
        checks: (parsed.statusCheckRollup ?? []).map(checkState),
        headBranch: parsed.headRefName ?? branch,
        baseBranch: parsed.baseRefName ?? null,
      },
    };
  } catch (error) {
    const detail = String(error?.stderr ?? error?.message ?? "").trim();
    value = {
      found: false,
      reason: /no pull request|no pull requests found/i.test(detail)
        ? "No GitHub pull request is attached to this prepared branch yet."
        : `GitHub pull request state could not be read${detail ? `: ${detail.slice(0, 240)}` : "."}`,
      pullRequest: null,
    };
  }
  if (ghExec === defaultGh) githubCache.set(key, { at: Date.now(), value });
  return value;
}

export function repositoryReviewState(record, {
  drift,
  baseBranch,
  drafts,
  gh,
  ghExec,
  freshGitHub = false,
} = {}) {
  const cwd = record.worktree;
  const currentBranch = tryGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]) ?? record.branch ?? null;
  const currentCommit = tryGit(cwd, ["rev-parse", "HEAD"]) ?? record.sourceHead ?? null;
  const baseRef = drift?.baseRef ?? (baseBranch ? `origin/${baseBranch}` : null);
  const baseCommit = baseRef ? tryGit(cwd, ["rev-parse", `${baseRef}^{commit}`]) : null;
  const remoteUrl = tryGit(cwd, ["remote", "get-url", "origin"]);
  const dirty = parseDirty(tryGit(cwd, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]));
  const anchor = record.sourceHead ?? currentCommit;
  const commitRange = baseRef && anchor ? `${baseRef}..${anchor}` : anchor;
  const commits = commitRange ? parseCommits(cwd, commitRange) : [];
  const commitCount = commitRange ? Number(tryGit(cwd, ["rev-list", "--count", commitRange]) ?? 0) : 0;
  const preparedBranch = record.ship?.attempt?.branch ?? drafts?.branch ?? null;
  const preparedBranchRef = preparedBranch ? `refs/remotes/origin/${preparedBranch}` : null;
  const preparedBranchCommit = preparedBranchRef
    ? tryGit(cwd, ["rev-parse", "--verify", "--quiet", `${preparedBranchRef}^{commit}`])
    : null;
  const github = readGitHubPullRequest(record.repository, preparedBranch, gh, ghExec, { fresh: freshGitHub });
  const facts = {
    baseBranch: baseBranch ?? null,
    baseRef,
    baseCommit,
    currentBranch,
    currentCommit,
    upstreamRef: drift?.upstreamRef ?? null,
    ahead: drift?.upstreamAheadCount ?? drift?.aheadOfDefaultCount ?? 0,
    behind: drift?.upstreamBehindCount ?? drift?.behindDefaultCount ?? 0,
    dirty: dirty.length > 0,
    dirtyCount: dirty.length,
    dirtyEntries: dirty.slice(0, 200),
    dirtyTruncated: dirty.length > 200,
    commitCount,
    commits,
    commitsTruncated: commitCount > commits.length,
    remote: { name: "origin", url: remoteUrl, preparedBranchRef, preparedBranchCommit },
    verification: (record.verification ?? []).map((entry) => ({
      command: entry.command,
      status: entry.status,
      exitCode: Number.isInteger(entry.exitCode) ? entry.exitCode : null,
    })),
    github,
  };
  const fingerprint = crypto.createHash("sha256").update(JSON.stringify({
    sourceHead: record.sourceHead,
    patchHash: record.patchHash,
    diff: crypto.createHash("sha256").update(record.diff ?? "").digest("hex"),
    baseRef,
    baseCommit,
    currentBranch,
    currentCommit,
    upstreamRef: facts.upstreamRef,
    ahead: facts.ahead,
    behind: facts.behind,
    dirty: dirty.map((entry) => [entry.status, entry.path]),
    remoteUrl,
    preparedBranchCommit,
    verification: facts.verification,
    drafts,
  })).digest("hex");
  return {
    ...facts,
    plan: {
      fingerprint,
      branch: drafts?.branch ?? null,
      commitMessage: drafts?.commitMessage ?? null,
      remote: remoteUrl,
      pullRequest: { base: baseBranch ?? null, head: drafts?.branch ?? null, title: drafts?.prTitle ?? null },
      phases: ["fetch", "branch", "commit", "push", "pr"],
    },
  };
}
