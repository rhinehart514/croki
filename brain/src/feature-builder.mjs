// The dogfood feature builder — "the house fixes itself when you complain about it."
//
// The founder, working in ANY codebase, requests a GTM IDE feature through the product's own
// MCP server. This module is the deterministic spine that services the request:
//
//   1. the request lands in dogfood/queue/ as a normal queue item (kind: feature)
//   2. an isolated git worktree is cut from the product repo's HEAD on a dogfood/* branch —
//      the founder's live working tree is NEVER touched
//   3. a builder agent runs headless in that worktree on the founder's Claude subscription
//      (rented intelligence, file tools only — no shell, git, web, or MCP)
//   4. the host records the dirty worktree as ready for founder review. It never commits,
//      pushes, merges, deploys, or removes reviewable work.
//
// The wall, applied to the build loop: the uncommitted change WAITS. Nothing here commits,
// merges, pushes, or deploys; review is the founder's alone. Builds run one at a time, so two
// requests can't fight over branches or CPU.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { reportFriction, updateFrictionItem, listFrictionQueue, DEFAULT_QUEUE_DIR } from "./friction.mjs";
import { runtimeForModel, selectRuntime } from "./runtimes/index.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// Write-capable but bounded: inert file operations only. Bash would let a rented model commit,
// push, deploy, or execute generated code before the founder saw the difference, so it is not
// present on this door. Verification is a later founder-authorized review action.
const BUILDER_TOOLS = ["Read", "Glob", "Grep", "Edit", "Write"];
const BUILDER_TOOL_SET = new Set(BUILDER_TOOLS);

function inside(root, candidate) {
  const rel = path.relative(root, candidate);
  return rel === "" || (!rel.startsWith(`..${path.sep}`) && rel !== ".." && !path.isAbsolute(rel));
}

function resolvedThroughExisting(candidate) {
  let current = candidate;
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return current;
    current = parent;
  }
  return path.resolve(fs.realpathSync(current), path.relative(current, candidate));
}

// Claude file tools are useful only with a real filesystem boundary. Deny absolute/path-traversal,
// symlink escapes, and git metadata. Codex gets the equivalent write boundary from its workspace
// sandbox with shell disabled. Read/Glob/Grep are confined too: project isolation is not write-only.
export function createBuilderPathPolicy(worktree) {
  // The real builder creates this directory before installing the policy. Keeping the lexical
  // fallback makes injected git/model contract tests possible without weakening live behavior.
  const root = fs.existsSync(worktree) ? fs.realpathSync(worktree) : path.resolve(worktree);
  return async (toolName, input = {}) => {
    if (!BUILDER_TOOL_SET.has(toolName)) {
      return { behavior: "deny", message: `${toolName} is not available through the isolated product-change door.` };
    }
    if (toolName === "Glob") {
      const pattern = String(input.pattern ?? "");
      // A glob can traverse a symlink without putting that symlink in `input.path`. Resolve the
      // literal prefix before the first metacharacter as well as the explicit search root.
      const literalPrefix = pattern.split(/[*?{[]/, 1)[0].replace(/[\\/]+$/, "");
      let escapedThroughPrefix = false;
      try {
        if (literalPrefix) {
          const prefix = resolvedThroughExisting(path.resolve(root, literalPrefix));
          escapedThroughPrefix = !inside(root, prefix);
        }
      } catch {
        escapedThroughPrefix = true;
      }
      if (path.isAbsolute(pattern) || pattern.includes("..") || escapedThroughPrefix) {
        return { behavior: "deny", message: "Glob is confined to the isolated product-change worktree." };
      }
    }
    const raw = input.file_path ?? input.path;
    if (raw == null || raw === "") {
      return { behavior: "allow", updatedInput: ["Glob", "Grep"].includes(toolName) ? { ...input, path: root } : input };
    }
    let lexicalCandidate;
    let candidate;
    try {
      lexicalCandidate = path.resolve(root, String(raw));
      candidate = fs.existsSync(root) ? resolvedThroughExisting(lexicalCandidate) : lexicalCandidate;
    } catch {
      return { behavior: "deny", message: `${toolName} received an invalid path outside the isolated product-change contract.` };
    }
    const rel = path.relative(root, candidate);
    const touchesGit = rel === ".git" || rel.startsWith(`.git${path.sep}`);
    if (!inside(root, candidate) || touchesGit) {
      return { behavior: "deny", message: `${toolName} is confined to the isolated product-change worktree and cannot access git metadata.` };
    }
    return { behavior: "allow", updatedInput: { ...input, ...(input.file_path != null ? { file_path: candidate } : { path: candidate }) } };
  };
}

export function resolveProductChangeRuntime({ provider, model, runtime, env = process.env } = {}) {
  const requested = typeof provider === "string" ? provider.trim().toLowerCase() : provider;
  const forced = requested === "claude" ? "claude-code" : requested;
  const modelRuntime = runtimeForModel(model);
  if (forced && modelRuntime && forced !== modelRuntime) {
    throw new Error(`Model ${model} belongs to the ${modelRuntime} runtime, not ${forced}.`);
  }
  const selected = selectRuntime({ runtime, forced, model, env });
  if (!selected.adapter) throw new Error(selected.reason || "No model runtime is available for product changes.");
  if (typeof selected.adapter.runProductChange !== "function") {
    throw new Error(`${selected.adapter.label} cannot create isolated product changes.`);
  }
  return selected.adapter;
}

function realGit(args, cwd = REPO_ROOT) {
  return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
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
    "- You have file tools only. Do not claim commands or tests ran; name the verification the founder should run during review.",
    "- NEVER commit, stage, push, merge, deploy, publish, switch branches, or touch another worktree. Leave the exact difference uncommitted for founder review.",
    "- If the request is too vague or unbuildable as stated, change nothing and say exactly what decision or detail is missing.",
    "",
    "Your final message is recorded for the founder's review: state what you built, how you verified it, and anything they must decide when reviewing.",
  ].filter((line) => line !== "").join("\n");
}

// One build, end to end. Everything with side effects is injectable so the spine is testable:
// git ops, the agent query, the clock, the queue directory.
export async function buildFeatureRequest(input = {}, options = {}) {
  const git = options.git ?? realGit;
  const requestedRepoRoot = options.repoRoot ?? REPO_ROOT;
  const repoRoot = options.git || !fs.existsSync(requestedRepoRoot)
    ? requestedRepoRoot
    : fs.realpathSync(requestedRepoRoot);
  const now = options.now ? new Date(options.now) : new Date();
  const maxTurns = options.maxTurns ?? 100;

  const report = String(input.report ?? "").trim();

  // 1. The request is a queue item from the first second — visible, honest, status: building.
  const item = options.existingItem ?? reportFriction(
    { ...input, report, kind: "feature", source: input.source ?? "feature-request" },
    { queueDir: options.queueDir, now, gitSha: options.gitSha },
  );
  // The queue allocator adds `-2`, `-3`, … for same-second duplicate requests. Reuse its unique,
  // already-sanitized key so two identical requests can never target the same branch/worktree.
  const requestKey = path.basename(item.file, path.extname(item.file));
  const branch = `dogfood/${requestKey}`;
  const worktree = path.join(repoRoot, ".dogfood-worktrees", requestKey);
  updateFrictionItem(item.file, { fields: { status: "building", branch } });

  let baseSha = null;
  let gitLink = null;
  let worktreeCreated = false;
  try {
    // 2. Isolated worktree from HEAD — the founder's dirty working tree stays untouched.
    if (!options.git) {
      const worktreeRoot = path.dirname(worktree);
      fs.mkdirSync(worktreeRoot, { recursive: true });
      const realWorktreeRoot = fs.realpathSync(worktreeRoot);
      if (!inside(repoRoot, realWorktreeRoot)) {
        throw new Error("The product-change worktree root resolves outside the Drover repository.");
      }
    }
    baseSha = git(["rev-parse", "HEAD"], repoRoot);
    git(["worktree", "add", "-b", branch, worktree, "HEAD"], repoRoot);
    worktreeCreated = true;
    try { gitLink = fs.readFileSync(path.join(worktree, ".git"), "utf8"); } catch { /* injected git */ }
    updateFrictionItem(item.file, {
      fields: {
        base_commit: baseSha,
        workspace: worktree,
        repository: repoRoot,
        project_id: input.projectId ?? input.snapshot?.project?.id ?? "drover",
      },
    });

    // 3. Rent the intelligence for the fuzzy part only.
    const runtime = options.runQuery ? null : resolveProductChangeRuntime({
      provider: input.provider ?? options.provider,
      model: input.model ?? options.model,
      runtime: options.runtime,
      env: options.env,
    });
    const runQuery = options.runQuery ?? ((request) => runtime.runProductChange(request));
    const { text, error } = await runQuery({
      prompt: builderPrompt({ report, context: input.context, snapshot: input.snapshot, branch }),
      cwd: worktree,
      model: input.model ?? options.model,
      maxTurns,
      allowedTools: BUILDER_TOOLS,
      canUseTool: createBuilderPathPolicy(worktree),
      env: options.env,
    });
    if (error) throw new Error(error.message ?? String(error.kind ?? error));
    if (gitLink != null) {
      let currentGitLink = null;
      try { currentGitLink = fs.readFileSync(path.join(worktree, ".git"), "utf8"); } catch { /* handled below */ }
      if (currentGitLink !== gitLink) {
        fs.writeFileSync(path.join(worktree, ".git"), gitLink);
        throw new Error("The builder attempted to alter protected git worktree metadata.");
      }
    }

    // 4. Enforce stop-before-commit even if an injected/future runner violated the tool boundary.
    // A mixed reset preserves every file change while returning commit authority to the founder.
    let commits = Number(git(["rev-list", "--count", `${baseSha}..${branch}`], worktree) || "0");
    if (commits > 0) {
      git(["reset", "--mixed", baseSha], worktree);
      commits = Number(git(["rev-list", "--count", `${baseSha}..${branch}`], worktree) || "0");
      if (commits > 0) throw new Error("Drover could not return the product change to an uncommitted review state.");
    }
    const dirty = git(["status", "--porcelain"], worktree);

    if (!dirty) {
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
      fields: { status: "ready-for-review", branch, worktree, commits: "0", provider: runtime?.id ?? options.provider ?? "injected", model: input.model ?? options.model ?? "default" },
      appendSection: `## Build result\n\nAn uncommitted change is waiting in \`${worktree}\` for founder review. Nothing was committed, pushed, merged, or deployed. Verification has not run through this restricted builder door.\n\n\`\`\`\n${dirty}\n\`\`\`\n\n${text || ""}`,
    });
    return { file: item.file, status: "ready-for-review", branch, worktree, commits: 0, provider: runtime?.id ?? options.provider ?? "injected", summary: text };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    let dirty = "";
    let commits = 0;
    let inspectionError = null;
    if (worktreeCreated) {
      try {
        commits = Number(git(["rev-list", "--count", `${baseSha}..${branch}`], worktree) || "0");
        if (commits > 0) {
          git(["reset", "--mixed", baseSha], worktree);
          commits = Number(git(["rev-list", "--count", `${baseSha}..${branch}`], worktree) || "0");
        }
        dirty = git(["status", "--porcelain"], worktree);
      } catch (failure) {
        inspectionError = failure instanceof Error ? failure.message : String(failure);
      }
    }
    // Uncertainty preserves work. Cleanup is allowed only after the host has positively proved that
    // the isolated checkout contains neither a commit nor a dirty file.
    const preserve = worktreeCreated && (Boolean(dirty) || commits > 0 || Boolean(inspectionError));
    if (!preserve && worktreeCreated) {
      try { git(["worktree", "remove", "--force", worktree], repoRoot); } catch { /* never created or already gone */ }
      try { git(["branch", "-D", branch], repoRoot); } catch { /* branch may never have been created */ }
    }
    updateFrictionItem(item.file, {
      fields: { status: "failed", ...(preserve ? { branch, worktree, commits: String(commits) } : { branch: "none" }) },
      appendSection: `## Build result\n\nThe build failed${preserve ? `, and its isolated worktree remains in \`${worktree}\` because it contains reviewable work or could not be safely inspected` : " before producing reviewable work"}. Nothing was pushed, merged, deployed, or released.${commits > 0 ? ` ${commits} local commit${commits === 1 ? " remains" : "s remain"}; Drover did not claim an uncommitted state.` : ""}\n\n\`\`\`\n${message}${inspectionError ? `\nSafety inspection: ${inspectionError}` : ""}\n\`\`\``,
    });
    return { file: item.file, status: "failed", branch: preserve ? branch : null, worktree: preserve ? worktree : null, commits: preserve ? commits : 0, error: message };
  }
}

// Crash recovery, run at brain boot. No build survives a restart (the serial chain is
// in-memory), so anything still marked queued/building is honestly dead. Dirty worktrees remain
// uncommitted and available for review; clean worktrees are removed. The queue item becomes
// `interrupted` so the founder sees the truth instead of a
// forever-spinner. Deterministic spine work — no model involved.
export function recoverStaleBuilds(options = {}) {
  const git = options.git ?? realGit;
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const queueDir = options.queueDir ?? DEFAULT_QUEUE_DIR;
  const recovered = [];
  const { reports } = listFrictionQueue({ queueDir });

  const wtRoot = path.join(repoRoot, ".dogfood-worktrees");
  let realWtRoot = null;
  let dirs = [];
  try {
    realWtRoot = fs.realpathSync(wtRoot);
    dirs = fs.readdirSync(realWtRoot);
  } catch { /* none — nothing was interrupted */ }
  for (const dir of dirs) {
    const lexicalWt = path.join(realWtRoot, dir);
    try {
      const stat = fs.lstatSync(lexicalWt);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new Error("Refusing to recover a product-change entry that is not a real directory.");
      }
      const wt = fs.realpathSync(lexicalWt);
      if (!inside(realWtRoot, wt)) throw new Error("Refusing to recover a product-change worktree outside its isolated root.");
      for (const rel of ["node_modules", path.join("brain", "node_modules"), path.join("ui", "node_modules")]) {
        try { const p = path.join(wt, rel); if (fs.lstatSync(p).isSymbolicLink()) fs.unlinkSync(p); } catch { /* not ours */ }
      }
      const receipt = reports.find((report) => {
        const recorded = report.worktree ?? report.workspace;
        if (!recorded) return false;
        try { return fs.realpathSync(recorded) === wt; } catch { return path.resolve(recorded) === path.resolve(wt); }
      });
      let commits = 0;
      if (receipt?.baseCommit) {
        commits = Number(git(["rev-list", "--count", `${receipt.baseCommit}..HEAD`], wt) || "0");
        if (commits > 0) {
          git(["reset", "--mixed", receipt.baseCommit], wt);
          commits = Number(git(["rev-list", "--count", `${receipt.baseCommit}..HEAD`], wt) || "0");
          if (commits > 0) throw new Error("Interrupted product change could not be returned to an uncommitted state.");
        }
      }
      const dirty = git(["status", "--porcelain"], wt);
      if (!dirty) git(["worktree", "remove", "--force", wt], repoRoot);
      recovered.push({ worktree: dir, preserved: Boolean(dirty), commits });
    } catch (err) {
      recovered.push({ worktree: dir, error: err instanceof Error ? err.message : String(err) });
    }
  }

  for (const report of reports) {
    if (report.status !== "building" && report.status !== "queued") continue;
    updateFrictionItem(path.join(queueDir, report.file), {
      fields: { status: "interrupted" },
      appendSection: `## Build result\n\nThe brain restarted while this was ${report.status}; no build survives a restart. Any dirty worktree remains uncommitted for founder review. Re-run the request or inspect the recorded worktree.`,
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
