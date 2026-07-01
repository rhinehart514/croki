// The dogfood feature builder — "the house fixes itself when you complain about it."
//
// The founder, working in ANY codebase, requests a GTM IDE feature through the product's own
// MCP server. This module is the deterministic spine that services the request:
//
//   1. the request lands in dogfood/queue/ as a normal queue item (kind: feature)
//   2. an isolated git worktree is cut from the product repo's HEAD on a dogfood/* branch —
//      the founder's live working tree is NEVER touched
//   3. a builder agent runs headless in that worktree on the founder's Claude subscription
//      (rented intelligence, same invoker as every other agent step — write tools, no MCP)
//   4. code — not the model — verifies what happened: commits left uncommitted work, records
//      the diffstat, flips the queue item to ready-for-review or failed, removes the worktree
//
// The wall, applied to the build loop: the branch WAITS. Nothing here merges, pushes, or
// deploys; review is the founder's alone. Builds run one at a time (a serial chain), so two
// requests can't fight over branches or CPU.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { reportFriction, updateFrictionItem, listFrictionQueue, DEFAULT_QUEUE_DIR } from "./friction.mjs";
import { runClaudeQuery } from "./agent-bridge.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// Write-capable but bounded: file tools plus Bash (tests, git commit). No web, no MCP —
// a feature build reads the repo it lives in and nothing else.
const BUILDER_TOOLS = ["Read", "Glob", "Grep", "Edit", "Write", "Bash"];

function realGit(args, cwd = REPO_ROOT) {
  return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
}

function slugify(text) {
  const slug = String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/g, "");
  return slug || "request";
}

export function builderPrompt({ report, context, snapshot, branch }) {
  return [
    `You are the dogfood feature builder for GTM IDE, working headless in an ISOLATED git worktree on branch ${branch}. The founder requested, mid-flow:`,
    "",
    `"${report}"`,
    context ? `\nWhat was happening: ${context}` : "",
    snapshot && Object.keys(snapshot).length ? `\nProduct state at request time:\n${JSON.stringify(snapshot, null, 2)}` : "",
    "",
    "Build the smallest scoped change that honestly delivers this. Rules:",
    "- Read AGENTS.md first and respect its invariants — the founder gate wall, health derived from real signals (never seeded), read-only scanning, no re-caging.",
    "- Verify your work: brain changes → `npm --prefix brain test` (or the targeted `node --test test/<file>` from brain/); UI changes → `npm run lint` and `npm run build`.",
    "- Commit on this branch with a clear message. NEVER push, never merge, never switch or touch other branches.",
    "- If the request is too vague or unbuildable as stated, change nothing and say exactly what decision or detail is missing.",
    "",
    "Your final message is recorded for the founder's review: state what you built, how you verified it, and anything they must decide when reviewing.",
  ].filter((line) => line !== "").join("\n");
}

// One build, end to end. Everything with side effects is injectable so the spine is testable:
// git ops, the agent query, the clock, the queue directory.
export async function buildFeatureRequest(input = {}, options = {}) {
  const git = options.git ?? realGit;
  const runQuery = options.runQuery ?? runClaudeQuery;
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const now = options.now ? new Date(options.now) : new Date();
  const maxTurns = options.maxTurns ?? 100;

  const report = String(input.report ?? "").trim();
  const stamp = now.toISOString().replace(/\.\d+Z$/, "").replace(/[:]/g, "").replace("T", "-");
  const branch = `dogfood/${stamp}-${slugify(report)}`;
  const worktree = path.join(repoRoot, ".dogfood-worktrees", `${stamp}-${slugify(report)}`);

  // 1. The request is a queue item from the first second — visible, honest, status: building.
  const item = options.existingItem ?? reportFriction(
    { ...input, report, kind: "feature", source: input.source ?? "feature-request" },
    { queueDir: options.queueDir, now, gitSha: options.gitSha },
  );
  updateFrictionItem(item.file, { fields: { status: "building", branch } });

  let baseSha = null;
  try {
    // 2. Isolated worktree from HEAD — the founder's dirty working tree stays untouched.
    baseSha = git(["rev-parse", "HEAD"], repoRoot);
    git(["worktree", "add", "-b", branch, worktree, "HEAD"], repoRoot);

    // A fresh worktree has no node_modules; the builder must be able to run the tests it's told
    // to run. Symlink the host's installed deps in (same machine, same platform — safe), so a
    // build never spends ten minutes reinstalling native modules. Tracked so they can be removed
    // before the commit check — gitignore's `node_modules/` pattern matches directories, NOT
    // symlinks, so a leftover symlink would otherwise be swept into the auto-commit.
    const symlinked = [];
    for (const rel of ["node_modules", path.join("brain", "node_modules"), path.join("ui", "node_modules")]) {
      try {
        const src = path.join(repoRoot, rel);
        const dest = path.join(worktree, rel);
        if (fs.existsSync(src) && !fs.existsSync(dest)) { fs.symlinkSync(src, dest, "dir"); symlinked.push(dest); }
      } catch { /* deps unavailable — the builder will discover and report it */ }
    }

    // 3. Rent the intelligence for the fuzzy part only.
    const { text, error } = await runQuery({
      prompt: builderPrompt({ report, context: input.context, snapshot: input.snapshot, branch }),
      cwd: worktree,
      maxTurns,
      allowedTools: BUILDER_TOOLS,
    });
    if (error) throw new Error(error.message ?? String(error.kind ?? error));

    // 4. Code verifies. Uncommitted work is real work — commit it rather than lose it.
    for (const dest of symlinked) {
      try { if (fs.lstatSync(dest).isSymbolicLink()) fs.unlinkSync(dest); } catch { /* already gone */ }
    }
    if (git(["status", "--porcelain"], worktree)) {
      git(["add", "-A"], worktree);
      git(["-c", "user.name=dogfood-builder", "-c", "user.email=dogfood@gtm-ide.local", "commit", "-m", `dogfood: ${report.slice(0, 72)}`], worktree);
    }
    const commits = Number(git(["rev-list", "--count", `${baseSha}..${branch}`], worktree) || "0");
    const diffstat = commits > 0 ? git(["diff", "--stat", `${baseSha}..${branch}`], worktree) : "";

    if (commits === 0) {
      // The builder declined (too vague / unbuildable) — that's a finding, not a failure.
      updateFrictionItem(item.file, {
        fields: { status: "declined", branch: "none" },
        appendSection: `## Build result\n\nThe builder made no changes.\n\n${text || "(no explanation returned)"}`,
      });
      git(["worktree", "remove", "--force", worktree], repoRoot);
      git(["branch", "-D", branch], repoRoot);
      return { file: item.file, status: "declined", branch: null, summary: text };
    }

    updateFrictionItem(item.file, {
      fields: { status: "ready-for-review", branch, commits: String(commits) },
      appendSection: `## Build result\n\nBranch \`${branch}\` (${commits} commit${commits === 1 ? "" : "s"}) is waiting for founder review. Nothing merges without you.\n\n\`\`\`\n${diffstat}\n\`\`\`\n\n${text || ""}`,
    });
    git(["worktree", "remove", "--force", worktree], repoRoot); // branch survives; the checkout doesn't
    return { file: item.file, status: "ready-for-review", branch, commits, summary: text };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try { git(["worktree", "remove", "--force", worktree], repoRoot); } catch { /* never created or already gone */ }
    try { if (!Number(git(["rev-list", "--count", `${baseSha}..${branch}`], repoRoot))) git(["branch", "-D", branch], repoRoot); } catch { /* keep any real work */ }
    updateFrictionItem(item.file, {
      fields: { status: "failed" },
      appendSection: `## Build result\n\nThe build failed before producing reviewable work:\n\n\`\`\`\n${message}\n\`\`\``,
    });
    return { file: item.file, status: "failed", branch: null, error: message };
  }
}

// Crash recovery, run at brain boot. No build survives a restart (the serial chain is
// in-memory), so anything still marked queued/building is honestly dead: salvage-commit any
// real work sitting in an orphaned worktree to its dogfood/* branch, remove the worktree,
// and flip the queue item to `interrupted` so the founder sees the truth instead of a
// forever-spinner. Deterministic spine work — no model involved.
export function recoverStaleBuilds(options = {}) {
  const git = options.git ?? realGit;
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const queueDir = options.queueDir ?? DEFAULT_QUEUE_DIR;
  const recovered = [];

  const wtRoot = path.join(repoRoot, ".dogfood-worktrees");
  let dirs = [];
  try { dirs = fs.readdirSync(wtRoot); } catch { /* none — nothing was interrupted */ }
  for (const dir of dirs) {
    const wt = path.join(wtRoot, dir);
    try {
      for (const rel of ["node_modules", path.join("brain", "node_modules"), path.join("ui", "node_modules")]) {
        try { const p = path.join(wt, rel); if (fs.lstatSync(p).isSymbolicLink()) fs.unlinkSync(p); } catch { /* not ours */ }
      }
      const dirty = git(["status", "--porcelain"], wt);
      if (dirty) {
        git(["add", "-A"], wt);
        git(["-c", "user.name=dogfood-builder", "-c", "user.email=dogfood@gtm-ide.local", "commit", "-m", `dogfood: salvaged from interrupted build (${dir})`], wt);
      }
      git(["worktree", "remove", "--force", wt], repoRoot);
      recovered.push({ worktree: dir, salvaged: Boolean(dirty) });
    } catch (err) {
      recovered.push({ worktree: dir, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const { reports } = listFrictionQueue({ queueDir });
  for (const report of reports) {
    if (report.status !== "building" && report.status !== "queued") continue;
    updateFrictionItem(path.join(queueDir, report.file), {
      fields: { status: "interrupted" },
      appendSection: `## Build result\n\nThe brain restarted while this was ${report.status}; no build survives a restart. Any work-in-progress was salvage-committed to its dogfood/* branch. Re-run the request or review the branch.`,
    });
    recovered.push({ item: report.file, was: report.status });
  }
  return recovered;
}

// Serialized front door: the queue item is created SYNCHRONOUSLY (the receipt the caller gets
// back at once), then builds run strictly one at a time in the background. An unexpected crash
// in one build never blocks the chain.
let chain = Promise.resolve();
export function enqueueFeatureRequest(input, options = {}) {
  const report = String(input.report ?? "").trim();
  const item = reportFriction(
    { ...input, report, kind: "feature", source: input.source ?? "feature-request" },
    { queueDir: options.queueDir, now: options.now, gitSha: options.gitSha },
  );
  updateFrictionItem(item.file, { fields: { status: "queued" } });
  const started = chain.then(() => buildFeatureRequest(input, { ...options, existingItem: item }));
  chain = started.catch(() => {});
  if (options.onDone) started.then(options.onDone, options.onDone);
  return { file: item.file, status: "queued", capturedAt: item.capturedAt, build: started };
}
