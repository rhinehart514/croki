import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { buildPrompt, buildTrackingFix, compactAgentError } from "../src/build.mjs";
import { scanRepo } from "../src/scan.mjs";

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-ide-"));
  for (const [name, contents] of Object.entries(files)) {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  }
  return root;
}

test("proves an attribution gap without matching comments or prose", () => {
  const root = fixture({
    "app/join.tsx": `
      // posthog.capture("fake") and source_id should not count.
      const refParam = searchParams.get("ref");
      await fetch("/api/projects", { body: JSON.stringify({ title }) });
    `,
    "services/project.ts": `
      await recordDiscoveryEvent("project_created", {
        builderId,
        projectId,
        privacy,
      });
    `,
    "copy.ts": `const sentence = "Plausible analytics and segmented controls";`,
  });

  const report = scanRepo(root, { winEvent: "project_created" });
  assert.equal(report.winEvent.found, true);
  assert.equal(report.attribution.captured, true);
  assert.equal(report.analytics.wired, false);
  assert.equal(report.gaps[0].id, "attribution-not-carried");
  assert.deepEqual(report.winEvent.properties, ["builderId", "projectId", "privacy"]);
});

test("reports an instrumented win when source is carried", () => {
  const root = fixture({
    "app/join.tsx": `const sourceId = searchParams.get("utm_source");`,
    "services/project.ts": `
      posthog.capture("project_created", {
        projectId,
        sourceId,
      });
    `,
  });

  const report = scanRepo(root, { winEvent: "project_created" });
  assert.equal(report.analytics.wired, true);
  assert.deepEqual(report.winEvent.attributionProperties, ["sourceId"]);
  assert.equal(report.gaps.length, 0);
  assert.match(report.headline, /^Instrumented:/);
});

test("stays blind when the requested win event does not exist", () => {
  const root = fixture({
    "app/join.tsx": `const ref = searchParams.get("ref");`,
  });

  const report = scanRepo(root, { winEvent: "activated" });
  assert.equal(report.winEvent.found, false);
  assert.equal(report.gaps[0].id, "win-event-not-found");
  assert.match(report.headline, /^Blind:/);
});

test("build prompt stays narrow and includes the grounded evidence", () => {
  const root = fixture({
    "app/join.tsx": `const ref = searchParams.get("ref");`,
    "services/project.ts": `
      await recordDiscoveryEvent("project_created", {
        projectId,
      });
    `,
  });
  const report = scanRepo(root, { winEvent: "project_created" });
  const prompt = buildPrompt(report);
  assert.match(prompt, /app\/join\.tsx:1/);
  assert.match(prompt, /services\/project\.ts:2/);
  assert.match(prompt, /Do not commit, push, deploy, open a pull request/);
});

test("agent errors prefer a concise actionable cause", () => {
  const message = compactAgentError(`
    WARN unrelated startup noise
    ERROR: You've hit your usage limit. Try again at 2:11 AM.
    WARN shutdown noise
  `);
  assert.equal(message, "You've hit your usage limit. Try again at 2:11 AM.");
});

test("build action creates an isolated reviewable worktree", async () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-ide-build-"));
  const root = path.join(parent, "repo");
  fs.mkdirSync(path.join(root, "app"), { recursive: true });
  fs.mkdirSync(path.join(root, "services"), { recursive: true });
  fs.writeFileSync(path.join(root, "app/join.tsx"), `const ref = searchParams.get("ref");\n`);
  fs.writeFileSync(
    path.join(root, "services/project.ts"),
    `await recordDiscoveryEvent("project_created", {\n  projectId,\n});\n`,
  );
  execFileSync("git", ["init", "-q", root]);
  execFileSync("git", ["-C", root, "config", "user.email", "gtm-ide@example.test"]);
  execFileSync("git", ["-C", root, "config", "user.name", "GTM IDE Test"]);
  execFileSync("git", ["-C", root, "add", "."]);
  execFileSync("git", ["-C", root, "commit", "-qm", "fixture"]);

  const report = scanRepo(root, { winEvent: "project_created" });
  const result = await buildTrackingFix(report, {
    worktreeRoot: path.join(parent, "worktrees"),
    runner: async ({ worktree, summaryFile }) => {
      fs.appendFileSync(path.join(worktree, "services/project.ts"), "// source carried\n");
      fs.writeFileSync(summaryFile, "Carried the source into the win event.");
      return { stdout: "" };
    },
  });

  assert.equal(result.ok, true);
  assert.match(result.status, /M services\/project\.ts/);
  assert.match(result.summary, /Carried the source/);
  assert.match(result.branch, /^codex\/gtm-fix-project-created-/);

  execFileSync("git", ["-C", root, "worktree", "remove", "--force", result.worktree]);
  execFileSync("git", ["-C", root, "branch", "-D", result.branch]);
  fs.rmSync(parent, { recursive: true, force: true });
});

test("build action reports when the agent produces no reviewable change", async () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-ide-empty-build-"));
  const root = path.join(parent, "repo");
  fs.mkdirSync(path.join(root, "app"), { recursive: true });
  fs.writeFileSync(path.join(root, "app/join.tsx"), `const ref = searchParams.get("ref");\n`);
  fs.writeFileSync(
    path.join(root, "event.ts"),
    `recordDiscoveryEvent("project_created", { projectId });\n`,
  );
  execFileSync("git", ["init", "-q", root]);
  execFileSync("git", ["-C", root, "config", "user.email", "gtm-ide@example.test"]);
  execFileSync("git", ["-C", root, "config", "user.name", "GTM IDE Test"]);
  execFileSync("git", ["-C", root, "add", "."]);
  execFileSync("git", ["-C", root, "commit", "-qm", "fixture"]);

  const report = scanRepo(root, { winEvent: "project_created" });
  const result = await buildTrackingFix(report, {
    worktreeRoot: path.join(parent, "worktrees"),
    runner: async () => ({ stdout: "" }),
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /without producing a reviewable change/i);

  execFileSync("git", ["-C", root, "worktree", "remove", "--force", result.worktree]);
  execFileSync("git", ["-C", root, "branch", "-D", result.branch]);
  fs.rmSync(parent, { recursive: true, force: true });
});
