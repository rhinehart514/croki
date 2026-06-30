import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

function git(repo, args) {
  const result = spawnSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed.`);
  }
  return result.stdout.trim();
}

function slug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 42) || "tracking-gap";
}

export function compactAgentError(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const usage = text.match(/You've hit your usage limit\.[^\n]*/i);
  if (usage) return usage[0];
  const errorLines = text.split("\n").filter((line) => /\bERROR\b/i.test(line));
  if (errorLines.length) return errorLines.slice(-3).join("\n").slice(0, 2_000);
  return text.split("\n").slice(-12).join("\n").slice(0, 2_000);
}

export function buildPrompt(report) {
  const gap = report.gaps?.[0];
  if (!gap) throw new Error("This report does not contain a tracking gap to repair.");

  const evidence = gap.citations
    .map((item) => `- ${item.file}:${item.line} — ${item.text}`)
    .join("\n");

  return `Repair one proven GTM tracking gap in this repository.

Win event: ${report.winEvent.name}
Finding: ${gap.summary}
Required outcome: ${gap.recommendation}

Grounding evidence:
${evidence}

Work narrowly:
- Trace the captured attribution value through the actual creation path.
- Persist or pass it only where needed.
- Include it on the "${report.winEvent.name}" event.
- Add or update focused tests that prove attribution survives to the win event.
- Run the smallest relevant test suite.
- Do not commit, push, deploy, open a pull request, or modify unrelated code.
- Keep every conclusion grounded in the repository; if the suggested repair is unsafe or false, explain why and leave the worktree unchanged.

At the end, summarize the files changed, tests run, and any remaining uncertainty.`;
}

function defaultRunner({ worktree, prompt, summaryFile, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "codex",
      [
        "exec",
        "--cd", worktree,
        "--sandbox", "workspace-write",
        "--ephemeral",
        "--ignore-user-config",
        "--color", "never",
        "--output-last-message", summaryFile,
        prompt,
      ],
      {
        cwd: worktree,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
      },
    );

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let forceKill = null;
    const terminate = (signal) => {
      try {
        process.kill(-child.pid, signal);
      } catch {
        child.kill(signal);
      }
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      terminate("SIGTERM");
      forceKill = setTimeout(() => terminate("SIGKILL"), 5_000);
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout = `${stdout}${chunk}`.slice(-40_000);
    });
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-40_000);
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      if (forceKill) clearTimeout(forceKill);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (forceKill) clearTimeout(forceKill);
      if (timedOut) {
        const detail = compactAgentError(stderr);
        reject(new Error(
          `Codex did not finish within ${Math.round(timeoutMs / 1000)} seconds.`
          + (detail ? `\n${detail}` : ""),
        ));
      }
      else if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(
        compactAgentError(stderr)
        || compactAgentError(stdout)
        || `Codex exited with ${code}.`,
      ));
    });
  });
}

// ---------------------------------------------------------------------------
// Build mode — generalize the worktree from repair-only to BUILD.
//
// Given the artifact files a producer staged (path + contents — the same
// `artifactFiles` the `connectors/execute/artifact.mjs` microproduct connector
// captures), write them into an isolated git worktree, optionally run the
// project's install/build, and capture a local preview (the built static output
// dir + entry file). It STOPS before commit, push, or deploy — exactly like the
// repair path. Building a microproduct is local; SHIPPING it is a separate,
// founder-gated leg (`authorizeGateRelease` + the revision confirmation
// pattern). This file has no deploy/push/publish code path by construction, and
// it actively rejects an install/build command that looks like a deploy, so the
// build leg can never smuggle an artifact past the wall.

// A build/install command is local-only. These verbs touch the outside world
// and belong behind the founder gate, never inside a local build step.
const DEPLOY_LIKE_COMMAND =
  /\b(deploy|publish|push|release|go[-_]?live|vercel|netlify|surge|gh-pages|firebase|rsync|scp|curl|wget|s3|cloudfront|now)\b/i;

export function assertLocalBuildCommand(command) {
  const text = (Array.isArray(command) ? command.join(" ") : String(command || "")).trim();
  if (!text) throw new Error("Build command is empty.");
  if (DEPLOY_LIKE_COMMAND.test(text)) {
    throw new Error(
      `Build commands are local-only. "${text}" looks like a deploy/publish/push and is rejected — `
      + "shipping a microproduct is a separate founder-gated leg, never part of a build.",
    );
  }
  return text;
}

// Write producer-supplied files into the worktree, refusing any path that would
// escape it (the contents are model/producer output, so the path is untrusted).
export function writeArtifactFiles(worktree, files) {
  const root = path.resolve(worktree);
  const written = [];
  for (const file of files) {
    const rel = String(file?.path || "").trim();
    if (!rel) throw new Error("Each artifact file needs a path.");
    if (path.isAbsolute(rel)) throw new Error(`Artifact file path must be relative: ${rel}`);
    const dest = path.resolve(root, rel);
    if (dest !== root && !dest.startsWith(root + path.sep)) {
      throw new Error(`Artifact file path escapes the worktree: ${rel}`);
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, String(file?.contents ?? ""));
    written.push(rel);
  }
  return written;
}

function defaultCommandRunner({ worktree, command }) {
  const parts = Array.isArray(command) ? command : String(command).split(/\s+/).filter(Boolean);
  const [cmd, ...args] = parts;
  const result = spawnSync(cmd, args, {
    cwd: worktree,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: (result.stdout || "").slice(-40_000),
    stderr: (result.stderr || "").slice(-40_000),
  };
}

// Read the preview the build produced: the static output dir's file list and an
// entry file. With no build step, the written files ARE the preview (a landing
// page is already static), so the worktree itself is the preview root.
function capturePreview(worktree, previewDir) {
  const dir = previewDir ? path.resolve(worktree, previewDir) : worktree;
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    return { dir, exists: false, files: [], entry: null };
  }
  const files = [];
  const walk = (current, prefix) => {
    for (const name of fs.readdirSync(current).sort()) {
      const abs = path.join(current, name);
      const relName = prefix ? `${prefix}/${name}` : name;
      const stat = fs.statSync(abs);
      if (stat.isDirectory()) {
        if (name === ".git" || name === "node_modules") continue;
        walk(abs, relName);
      } else {
        files.push(relName);
      }
    }
  };
  walk(dir, "");
  const entry = files.find((f) => /(^|\/)index\.html?$/i.test(f))
    || files.find((f) => /\.html?$/i.test(f))
    || files[0]
    || null;
  return { dir, exists: true, files, entry };
}

// Build a staged microproduct locally. Never commits, pushes, or deploys.
export async function buildMicroproduct(spec = {}, options = {}) {
  const files = Array.isArray(spec.files) ? spec.files : [];
  const name = spec.name || "microproduct";

  if (!files.length) {
    return {
      ok: false,
      mode: "microproduct",
      worktree: null,
      files: [],
      buildSteps: [],
      preview: null,
      staged: false,
      deployed: false,
      error: "No artifact files to build.",
    };
  }

  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "");
  const worktreeRoot = options.worktreeRoot || path.join(os.homedir(), ".gtm-ide", "builds");
  fs.mkdirSync(worktreeRoot, { recursive: true });

  // With a product repo, cut an isolated git worktree from it (the microproduct
  // is cut from the real product). Without one, build in a standalone dir.
  let worktree;
  let baseCommit = null;
  let branch = null;
  if (spec.repo) {
    const repo = path.resolve(spec.repo);
    git(repo, ["rev-parse", "--show-toplevel"]);
    baseCommit = git(repo, ["rev-parse", "HEAD"]);
    branch = `codex/gtm-build-${slug(name)}-${timestamp}`;
    worktree = path.join(worktreeRoot, `${path.basename(repo)}-build-${timestamp}`);
    git(repo, ["worktree", "add", "-b", branch, worktree, "HEAD"]);
  } else {
    worktree = path.join(worktreeRoot, `${slug(name)}-${timestamp}`);
    fs.mkdirSync(worktree, { recursive: true });
  }

  const runCommand = options.runCommand || defaultCommandRunner;
  const buildSteps = [];
  let error = null;

  try {
    const written = writeArtifactFiles(worktree, files);

    // install, then build — each optional, each local-only.
    const commands = [
      spec.install ? { label: "install", command: spec.install } : null,
      spec.build || spec.buildCommand
        ? { label: "build", command: spec.build || spec.buildCommand }
        : null,
    ].filter(Boolean);

    for (const step of commands) {
      assertLocalBuildCommand(step.command);
      const result = await runCommand({ worktree, command: step.command, label: step.label });
      buildSteps.push({
        label: step.label,
        command: Array.isArray(step.command) ? step.command.join(" ") : String(step.command),
        ok: result?.ok !== false,
        status: result?.status ?? null,
        stdout: (result?.stdout || "").slice(-8_000),
        stderr: (result?.stderr || "").slice(-8_000),
      });
      if (result?.ok === false) {
        error = `Build step "${step.label}" failed`
          + (result.status != null ? ` (exit ${result.status})` : "")
          + ".";
        break;
      }
    }

    const preview = error ? null : capturePreview(worktree, spec.previewDir);

    return {
      ok: !error,
      mode: "microproduct",
      name,
      baseCommit,
      branch,
      worktree,
      files: written,
      buildSteps,
      preview,
      // The wall, made explicit on the result of a build leg: prepared locally,
      // never live. Deploying is a separate founder-gated leg.
      staged: !error,
      deployed: false,
      error,
    };
  } catch (caught) {
    return {
      ok: false,
      mode: "microproduct",
      name,
      baseCommit,
      branch,
      worktree,
      files: [],
      buildSteps,
      preview: null,
      staged: false,
      deployed: false,
      error: caught instanceof Error ? caught.message : String(caught),
    };
  }
}

export async function buildTrackingFix(report, options = {}) {
  const repo = path.resolve(report.repo);
  git(repo, ["rev-parse", "--show-toplevel"]);
  const baseCommit = git(repo, ["rev-parse", "HEAD"]);

  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "");
  const branch = `codex/gtm-fix-${slug(report.winEvent.name)}-${timestamp}`;
  const worktreeRoot = options.worktreeRoot || path.join(os.homedir(), ".gtm-ide", "worktrees");
  const worktree = path.join(worktreeRoot, `${path.basename(repo)}-${timestamp}`);
  const summaryFile = path.join(worktree, ".gtm-ide-summary.txt");
  fs.mkdirSync(worktreeRoot, { recursive: true });

  git(repo, ["worktree", "add", "-b", branch, worktree, "HEAD"]);

  const runner = options.runner || defaultRunner;
  let agentOutput = "";
  let agentError = null;
  try {
    const result = await runner({
      worktree,
      prompt: buildPrompt(report),
      summaryFile,
      timeoutMs: options.timeoutMs
        || Number(process.env.GTM_IDE_CODEX_TIMEOUT_MS)
        || 240_000,
    });
    agentOutput = result?.stdout || "";
  } catch (error) {
    agentError = error instanceof Error ? error.message : String(error);
  }

  const status = git(worktree, ["status", "--short"]);
  const diffStat = git(worktree, ["diff", "--stat"]);
  const diff = git(worktree, ["diff", "--no-ext-diff", "--unified=2"]);
  const summary = fs.existsSync(summaryFile)
    ? fs.readFileSync(summaryFile, "utf8").trim()
    : agentOutput.trim();

  const noChangeError = !agentError && !status
    ? "Codex finished without producing a reviewable change."
    : null;

  return {
    ok: !agentError && Boolean(status),
    baseCommit,
    branch,
    worktree,
    status,
    diffStat,
    diff: diff.slice(0, 80_000),
    summary: summary || (status ? "A local tracking fix was created." : "No changes were produced."),
    error: agentError || noChangeError,
  };
}
