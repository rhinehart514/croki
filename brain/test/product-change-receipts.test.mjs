import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { reportFriction, updateFrictionItem } from "../src/friction.mjs";
import { applyProductChange, discardProductChange, inspectProductChangeReadiness, listProductChangeReceipts, reviewProductChange, stageProductChangeProposal } from "../src/product-change-receipts.mjs";
import { createProject, groundProjectInWorkspace } from "../src/project-store.mjs";
import { getWorkspace, openWorkspace } from "../src/workspace.mjs";
import { inspectApplyReadiness } from "../src/revision.mjs";

function git(cwd, args) { return execFileSync("git", args, { cwd, encoding: "utf8" }).trim(); }
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "change-receipts-"));
  const repo = path.join(root, "repo");
  const queueDir = path.join(root, "queue");
  fs.mkdirSync(repo);
  git(repo, ["init", "-q"]); git(repo, ["config", "user.email", "test@example.com"]); git(repo, ["config", "user.name", "Test"]);
  fs.writeFileSync(path.join(repo, "a.txt"), "before\n"); git(repo, ["add", "."]); git(repo, ["commit", "-qm", "base"]);
  const worktree = path.join(repo, ".dogfood-worktrees", "change");
  git(repo, ["worktree", "add", "-qb", "dogfood/change", worktree, "HEAD"]);
  fs.writeFileSync(path.join(worktree, "a.txt"), "after\n");
  const item = reportFriction({ report: "Change the product", kind: "feature" }, { queueDir, gitSha: "host", now: "2026-07-11T12:00:00Z" });
  updateFrictionItem(item.file, { fields: { status: "ready-for-review", project_id: "p1", provider: "codex", model: "gpt-test", repository: repo, worktree, workspace: worktree, branch: "dogfood/change", base_commit: git(repo, ["rev-parse", "HEAD"]), commits: 0 } });
  return { root, repo, queueDir, worktree, file: path.basename(item.file) };
}

test("projects see only their own product-change receipts with the live uncommitted difference", () => {
  const f = fixture();
  const changes = listProductChangeReceipts("p1", { queueDir: f.queueDir });
  assert.equal(changes.length, 1); assert.equal(changes[0].provider, "codex"); assert.match(changes[0].diff, /-before/); assert.match(changes[0].diff, /\+after/);
  assert.equal(listProductChangeReceipts("other", { queueDir: f.queueDir }).length, 0);
  git(f.repo, ["worktree", "remove", "--force", f.worktree]); fs.rmSync(f.root, { recursive: true, force: true });
});

test("discard requires founder confirmation and removes only the namespaced isolated work", () => {
  const f = fixture();
  assert.throws(() => discardProductChange("p1", f.file, {}, { queueDir: f.queueDir }), /explicit confirmation/);
  assert.throws(() => discardProductChange("other", f.file, { confirm: true }, { queueDir: f.queueDir }), /not found in this project/);
  const result = discardProductChange("p1", f.file, { confirm: true }, { queueDir: f.queueDir });
  assert.equal(result.status, "discarded"); assert.equal(fs.existsSync(f.worktree), false); assert.equal(listProductChangeReceipts("p1", { queueDir: f.queueDir }).length, 0);
  fs.rmSync(f.root, { recursive: true, force: true });
});

test("stage copies the exact retained diff into the existing inert founder revision review", () => {
  const f = fixture();
  const stateRoot = path.join(f.root, "state");
  const options = { root: stateRoot, projectId: "p1", queueDir: f.queueDir };
  createProject({ id: "p1", name: "Product one" }, options);
  const workspace = openWorkspace(f.repo, "project_created", options);
  groundProjectInWorkspace(workspace, options);
  const staged = stageProductChangeProposal("p1", f.file, options);
  assert.equal(staged.revision.status, "proposed"); assert.match(staged.revision.diff, /\+after/); assert.match(staged.revision.safety, /No files were applied/);
  assert.equal(fs.readFileSync(path.join(f.repo, "a.txt"), "utf8"), "before\n", "source repo is untouched");
  assert.equal(getWorkspace(workspace.id, options).revisions.at(-1).sourceReceiptId, f.file);
  assert.equal(stageProductChangeProposal("p1", f.file, options).deduped, true, "staging is idempotent");
  git(f.repo, ["worktree", "remove", "--force", f.worktree]); fs.rmSync(f.root, { recursive: true, force: true });
});

test("the exact review patch includes untracked text and binary files", () => {
  const f = fixture();
  fs.writeFileSync(path.join(f.worktree, "new-file.txt"), "new product surface\n");
  fs.writeFileSync(path.join(f.worktree, "pixel.bin"), Buffer.from(Array.from({ length: 512 }, (_, index) => index % 256)));
  const stateRoot = path.join(f.root, "state");
  const options = { root: stateRoot, projectId: "p1", queueDir: f.queueDir };
  createProject({ id: "p1", name: "Product one" }, options);
  const workspace = openWorkspace(f.repo, "project_created", options);
  groundProjectInWorkspace(workspace, options);

  const visible = listProductChangeReceipts("p1", options)[0];
  assert.match(visible.diff, /new file mode/);
  assert.match(visible.diff, /new-file\.txt/);
  assert.match(visible.diff, /pixel\.bin/);
  assert.ok(visible.patchHash);
  const staged = stageProductChangeProposal("p1", f.file, options);
  assert.match(staged.revision.diff, /new-file\.txt/);
  assert.match(staged.revision.diff, /pixel\.bin/);
  assert.equal(staged.revision.patchHash, visible.patchHash);

  git(f.repo, ["worktree", "remove", "--force", f.worktree]); fs.rmSync(f.root, { recursive: true, force: true });
});

test("a changed retained worktree creates a new frozen review and invalidates the old snapshot", () => {
  const f = fixture();
  const stateRoot = path.join(f.root, "state");
  const options = { root: stateRoot, projectId: "p1", queueDir: f.queueDir };
  createProject({ id: "p1", name: "Product one" }, options);
  const workspace = openWorkspace(f.repo, "project_created", options);
  groundProjectInWorkspace(workspace, options);
  const first = stageProductChangeProposal("p1", f.file, options);
  fs.writeFileSync(path.join(f.worktree, "a.txt"), "different after staging\n");
  const second = stageProductChangeProposal("p1", f.file, options);

  assert.notEqual(second.revision.id, first.revision.id);
  assert.notEqual(second.revision.patchHash, first.revision.patchHash);
  const staleReadiness = inspectApplyReadiness(getWorkspace(workspace.id, options), { ...first.revision, status: "approved" });
  assert.equal(staleReadiness.ready, false);
  assert.equal(staleReadiness.retainedSnapshotMatches, false);
  assert.match(staleReadiness.reasons.join(" "), /moved after founder review/i);

  git(f.repo, ["worktree", "remove", "--force", f.worktree]); fs.rmSync(f.root, { recursive: true, force: true });
});

test("discard refuses a receipt whose retained branch identity no longer matches", () => {
  const f = fixture();
  git(f.worktree, ["checkout", "-qb", "dogfood/other"]);
  assert.throws(() => discardProductChange("p1", f.file, { confirm: true }, { queueDir: f.queueDir }), /branch no longer matches/i);
  assert.equal(fs.existsSync(f.worktree), true);
  git(f.repo, ["worktree", "remove", "--force", f.worktree]); fs.rmSync(f.root, { recursive: true, force: true });
});

test("project-scoped founder review and explicit apply cannot cross into another project", () => {
  const f = fixture();
  const stateRoot = path.join(f.root, "state");
  const options = { root: stateRoot, projectId: "p1", queueDir: f.queueDir };
  createProject({ id: "p1", name: "Product one" }, options);
  const workspace = openWorkspace(f.repo, "project_created", options);
  groundProjectInWorkspace(workspace, options);
  stageProductChangeProposal("p1", f.file, options);

  assert.throws(() => reviewProductChange("other", f.file, { decision: "approve" }, options), /not found in this project/i);
  const reviewed = reviewProductChange("p1", f.file, { decision: "approve" }, options);
  assert.equal(reviewed.status, "approved");
  const readiness = inspectProductChangeReadiness("p1", f.file, options);
  assert.equal(readiness.ready, true, JSON.stringify(readiness));
  assert.throws(() => applyProductChange("p1", f.file, {}, options), /explicit confirmation/i);
  const applied = applyProductChange("p1", f.file, { confirm: true }, options);
  assert.equal(applied.status, "applied");
  assert.equal(fs.readFileSync(path.join(f.repo, "a.txt"), "utf8"), "after\n");

  git(f.repo, ["worktree", "remove", "--force", f.worktree]); fs.rmSync(f.root, { recursive: true, force: true });
});
