import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { buildPrompt, buildTrackingFix, compactAgentError } from "../src/build.mjs";
import { scanRepo } from "../src/scan.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_REPO = path.resolve(here, "../../samples/acme-saas");

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

test("ignores leftover agent worktrees under .claude", () => {
  const winEventSource = `
    posthog.capture("project_created", {
      projectId,
      sourceId,
    });
  `;
  const root = fixture({
    "app/join.tsx": `const sourceId = searchParams.get("utm_source");`,
    "services/project.ts": winEventSource,
    // A leftover agent git worktree: a full copy of the repo. None of these
    // files are the product's real source and they must never be scanned.
    ".claude/worktrees/agent-a70259b2416edafe8/services/project.ts": winEventSource,
    ".claude/worktrees/agent-af70964acc54044ec/services/project.ts": winEventSource,
  });

  const report = scanRepo(root, { winEvent: "project_created" });

  const citedFiles = [
    ...report.analytics.citations,
    ...report.attribution.citations,
    ...report.winEvent.citations,
  ].map((c) => c.file);

  for (const file of citedFiles) {
    assert.ok(
      !file.includes(".claude"),
      `scan output must not cite a copy under .claude, got: ${file}`,
    );
  }
  // The real source is still scanned.
  assert.ok(citedFiles.some((file) => file === "services/project.ts"));
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

test("bundled sample product proves the attribution gap from real citations", () => {
  // The first-run "Try it on a sample product" path scans this repo. Guard that it stays honest input
  // the real scanner genuinely lights up on — the win event proven, attribution captured, and the
  // captured source provably missing from the win event — with real file:line evidence, never canned.
  const report = scanRepo(SAMPLE_REPO, { winEvent: "signup_completed" });

  assert.equal(report.winEvent.found, true);
  assert.equal(report.attribution.captured, true);
  assert.equal(report.analytics.wired, true);
  assert.deepEqual(report.winEvent.attributionProperties, []);
  assert.match(report.headline, /Tracking gap proven/i);

  const gap = report.gaps.find((g) => g.id === "attribution-not-carried");
  assert.ok(gap, "expected the attribution-not-carried gap");
  assert.equal(gap.status, "proven");
  // Every cited line is real code in the sample, with a concrete file:line.
  for (const cite of gap.citations) {
    assert.ok(cite.file && cite.line > 0, "gap citation must carry file:line");
    const source = fs.readFileSync(path.join(SAMPLE_REPO, cite.file), "utf8").split("\n");
    assert.ok(source[cite.line - 1] !== undefined, `${cite.file}:${cite.line} must exist`);
  }
  // The win event is cited in the signup action; the capture in the attribution lib.
  assert.ok(report.winEvent.citations.some((c) => c.file === "src/app/signup/actions.ts"));
  assert.ok(report.attribution.citations.some((c) => c.file === "src/lib/attribution.ts"));
});

test("reads product context (README prose, manifest, sample data) without a data parser", () => {
  const root = fixture({
    "README.md": "# Acme\n\n[![build](x)](y)\n\nAcme turns raw invoices into a reconciled ledger for small shops.\n\nMore details here.",
    "package.json": JSON.stringify({ name: "acme", description: "invoice reconciler", keywords: ["fintech", "invoices"] }),
    "data/leads.csv": "name,email\na,b\n",
    "services/project.ts": `await recordDiscoveryEvent("project_created", { builderId });`,
  });
  const report = scanRepo(root, { winEvent: "project_created" });

  assert.ok(report.productContext, "product context is populated");
  assert.equal(
    report.productContext.readme,
    "Acme turns raw invoices into a reconciled ledger for small shops.",
    "the first real prose paragraph is picked, skipping the title and badge lines",
  );
  assert.equal(report.productContext.pkg.name, "acme");
  assert.equal(report.productContext.pkg.description, "invoice reconciler");
  assert.deepEqual(report.productContext.pkg.keywords, ["fintech", "invoices"]);
  assert.ok(report.productContext.sampleDataFiles.some((f) => f.file === "data/leads.csv"));
  // The scan's own gap headline is unchanged — product context is additive, not a rewrite of the verdict.
  assert.equal(typeof report.headline, "string");
});

test("product context is null when a repo carries no README, manifest, or sample data", () => {
  const root = fixture({
    "services/project.ts": `await recordDiscoveryEvent("project_created", { builderId });`,
  });
  const report = scanRepo(root, { winEvent: "project_created" });
  assert.equal(report.productContext, null, "no invented product facts when the repo has none");
});
