import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  applyRevision,
  createRevision,
  inspectApplyReadiness,
  reviewRevision,
  revertRevision,
} from "../src/revision.mjs";
import {
  addDecision,
  addRevision,
  getWorkspace,
  listWorkspaces,
  openWorkspace,
  rescanWorkspace,
  updateRevision,
} from "../src/workspace.mjs";

describe("durable GTM workspace", () => {
  let parent;
  let repo;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-workspace-"));
    repo = path.join(parent, "repo");
    options = { root: path.join(parent, "state") };
    fs.mkdirSync(path.join(repo, "app"), { recursive: true });
    fs.mkdirSync(path.join(repo, "services"), { recursive: true });
    fs.writeFileSync(path.join(repo, "app/join.tsx"), `const ref = searchParams.get("ref");\n`);
    fs.writeFileSync(
      path.join(repo, "services/project.ts"),
      `recordDiscoveryEvent("project_created", {\n  projectId,\n});\n`,
    );
    execFileSync("git", ["init", "-q", repo]);
    execFileSync("git", ["-C", repo, "config", "user.email", "gtm-ide@example.test"]);
    execFileSync("git", ["-C", repo, "config", "user.name", "GTM IDE Test"]);
    execFileSync("git", ["-C", repo, "add", "."]);
    execFileSync("git", ["-C", repo, "commit", "-qm", "fixture"]);
    // openWorkspace canonicalizes the repo path via realpathSync (symlink hardening); on macOS the
    // system temp dir is a symlink (/var → /private/var), so match the canonical form for comparison.
    repo = fs.realpathSync(repo);
  });

  afterEach(() => {
    fs.rmSync(parent, { recursive: true, force: true });
  });

  it("opens, lists, reloads, and verifies a repository-backed workspace", () => {
    const opened = openWorkspace(repo, "project_created", options);
    assert.equal(opened.report.gaps[0].id, "attribution-not-carried");
    assert.equal(opened.workflow[0].status, "complete");
    assert.equal(opened.workflow[2].status, "ready");

    const listed = listWorkspaces(options);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].id, opened.id);

    const loaded = getWorkspace(opened.id, options);
    assert.equal(loaded.repo, repo);
    assert.equal(loaded.runs.length, 1);

    const verified = rescanWorkspace(opened.id, options);
    assert.equal(verified.runs.length, 2);
    assert.equal(verified.runs.at(-1).type, "verification");
  });

  it("preserves proposal, review, decision, apply, and revert history", async () => {
    let workspace = openWorkspace(repo, "project_created", options);
    const revision = await createRevision(workspace, {
      worktreeRoot: path.join(parent, "worktrees"),
      runner: async ({ worktree, summaryFile }) => {
        fs.appendFileSync(path.join(worktree, "services/project.ts"), "// carry ref\n");
        fs.writeFileSync(summaryFile, "Carried the source into the event.");
        return { stdout: "" };
      },
    });
    assert.equal(revision.status, "proposed");
    workspace = addRevision(workspace.id, revision, options);

    workspace = updateRevision(
      workspace.id,
      revision.id,
      (current) => reviewRevision(current, "approve", "The diff is narrow."),
      options,
    );
    workspace = addDecision(workspace.id, {
      type: "revision_review",
      decision: "approve",
      revisionId: revision.id,
      summary: "Approved the narrow patch.",
    }, options);

    const approved = workspace.revisions.find((item) => item.id === revision.id);
    assert.equal(approved.status, "approved");
    assert.equal(workspace.decisions.length, 1);
    assert.equal(inspectApplyReadiness(workspace, approved).ready, true);

    const applied = applyRevision(workspace, approved, true);
    assert.equal(applied.status, "applied");
    assert.match(fs.readFileSync(path.join(repo, "services/project.ts"), "utf8"), /carry ref/);

    const reverted = revertRevision(workspace, applied, true);
    assert.equal(reverted.status, "reverted");
    assert.doesNotMatch(fs.readFileSync(path.join(repo, "services/project.ts"), "utf8"), /carry ref/);

    execFileSync("git", ["-C", repo, "worktree", "remove", "--force", revision.worktree]);
    execFileSync("git", ["-C", repo, "branch", "-D", revision.branch]);
  });

  it("blocks direct apply when the source repository is dirty", async () => {
    let workspace = openWorkspace(repo, "project_created", options);
    const revision = await createRevision(workspace, {
      worktreeRoot: path.join(parent, "worktrees"),
      runner: async ({ worktree, summaryFile }) => {
        fs.appendFileSync(path.join(worktree, "services/project.ts"), "// patch\n");
        fs.writeFileSync(summaryFile, "Made a patch.");
        return { stdout: "" };
      },
    });
    workspace = addRevision(workspace.id, reviewRevision(revision, "approve"), options);
    fs.appendFileSync(path.join(repo, "app/join.tsx"), "// user change\n");

    const readiness = inspectApplyReadiness(workspace, workspace.revisions[0]);
    assert.equal(readiness.ready, false);
    assert.match(readiness.reasons.join(" "), /uncommitted changes/i);

    execFileSync("git", ["-C", repo, "worktree", "remove", "--force", revision.worktree]);
    execFileSync("git", ["-C", repo, "branch", "-D", revision.branch]);
  });
});
