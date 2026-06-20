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
