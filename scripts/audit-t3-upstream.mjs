#!/usr/bin/env node

// Read-only upstream radar for MIT-licensed T3 Code. It intentionally works from a disposable
// filtered clone: Croki never gains an upstream branch that can be merged wholesale by accident.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ledgerPath = path.join(root, "docs", "upstream", "t3code-adoptions.json");
const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
const since = process.argv.includes("--since")
  ? process.argv[process.argv.indexOf("--since") + 1]
  : ledger.lastReviewedCommit;
const upstream = ledger.upstream;
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "croki-t3-audit-"));
const repository = path.join(temporaryRoot, "t3code");

const categories = [
  ["continuity", /thread|snapshot|reconnect|resume|settled|snooz|archive|draft/i],
  ["provider-runtime", /claude|codex|opencode|cursor|grok|model|approval|permission|skill/i],
  ["review", /diff|review|pull request|\\bpr\\b|branch|worktree|checkpoint|git/i],
  ["preview-terminal", /preview|browser|terminal|localhost|port/i],
  ["composer", /composer|mention|attachment|upload|prompt/i],
  ["project-shell", /project|sidebar|picker|workspace|config/i],
  ["hosted-mobile", /mobile|ios|android|expo|clerk|remote|web:/i],
];

function git(args, options = {}) {
  return execFileSync("git", args, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 32 * 1024 * 1024,
  }).trim();
}

function categoryFor(subject) {
  return categories.find(([, pattern]) => pattern.test(subject))?.[0] ?? "other";
}

try {
  git(["clone", "--filter=blob:none", "--no-checkout", upstream, repository]);
  git(["rev-parse", "--verify", `${since}^{commit}`], { cwd: repository });
  const head = git(["rev-parse", "HEAD"], { cwd: repository });
  const lines = git([
    "log",
    "--date=short",
    "--pretty=format:%H%x09%ad%x09%s",
    `${since}..${head}`,
  ], { cwd: repository });
  const commits = lines
    ? lines.split("\n").map((line) => {
      const [commit, date, ...subjectParts] = line.split("\t");
      const subject = subjectParts.join("\t");
      return { commit, date, subject, category: categoryFor(subject) };
    })
    : [];

  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify({ upstream, since, head, commits }, null, 2)}\n`);
  } else {
    console.log(`# T3 Code upstream audit`);
    console.log(``);
    console.log(`Compared ${since.slice(0, 10)}..${head.slice(0, 10)} · ${commits.length} commits`);
    if (!commits.length) {
      console.log(``);
      console.log(`No new upstream commits.`);
    }
    for (const [category] of [...categories, ["other", null]]) {
      const matches = commits.filter((commit) => commit.category === category);
      if (!matches.length) continue;
      console.log(``);
      console.log(`## ${category}`);
      for (const commit of matches) {
        console.log(`- ${commit.commit.slice(0, 10)} · ${commit.date} · ${commit.subject}`);
      }
    }
    console.log(``);
    console.log(`Review against docs/upstream/T3-CODE.md, then update the ledger only after a Croki-native decision.`);
  }
} catch (error) {
  const detail = error?.stderr?.toString?.().trim() || error?.message || String(error);
  console.error(`T3 upstream audit failed: ${detail}`);
  process.exitCode = 1;
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
