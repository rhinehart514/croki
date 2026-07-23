import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";

import { listRepositoryFiles } from "../../src/firm/repository-files.mjs";
import { createVenture } from "../../src/firm/venture-store.mjs";

function git(cwd, args) { return execFileSync("git", args, { cwd, encoding: "utf8" }).trim(); }

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "drover-repo-files-home-"));
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "drover-repo-files-repo-"));
  git(repo, ["init", "-q"]);
  git(repo, ["config", "user.email", "test@example.com"]);
  git(repo, ["config", "user.name", "Test"]);
  fs.writeFileSync(path.join(repo, ".gitignore"), "ignored.txt\nnode_modules/\n");
  fs.mkdirSync(path.join(repo, "src"), { recursive: true });
  fs.writeFileSync(path.join(repo, "src", "app.mjs"), "export const app = 1;\n");
  fs.writeFileSync(path.join(repo, "README.md"), "# repo\n");
  git(repo, ["add", "."]); git(repo, ["commit", "-qm", "base"]);
  const options = { root, seedFoundingCrew: false };
  const venture = createVenture({ name: "Files", repository: repo }, options);
  return { root, repo, options, venture, cleanup: () => { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(repo, { recursive: true, force: true }); } };
}

describe("repository file listing for @-scoping", () => {
  it("returns tracked and untracked-but-not-ignored paths, sorted, ignoring .gitignore", () => {
    const { repo, options, venture, cleanup } = fixture();
    // An untracked, not-ignored file the founder should still be able to name.
    fs.writeFileSync(path.join(repo, "src", "new.mjs"), "export const next = 2;\n");
    // An ignored file that must never be offered.
    fs.writeFileSync(path.join(repo, "ignored.txt"), "secret\n");

    const files = listRepositoryFiles(venture.id, options);

    assert.deepEqual(files, [".gitignore", "README.md", "src/app.mjs", "src/new.mjs"]);
    assert.ok(!files.includes("ignored.txt"), "an ignored file is never offered");
    cleanup();
  });

  it("fails open to an empty list when the venture repository is not a git repo", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "drover-repo-files-blind-home-"));
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), "drover-repo-files-plain-"));
    fs.writeFileSync(path.join(plain, "loose.txt"), "not tracked by any repo\n");
    const options = { root, seedFoundingCrew: false };
    const venture = createVenture({ name: "Blind", repository: plain }, options);
    assert.deepEqual(listRepositoryFiles(venture.id, options), []);
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(plain, { recursive: true, force: true });
  });

  it("returns an empty list for an unknown venture rather than throwing", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "drover-repo-files-none-"));
    assert.deepEqual(listRepositoryFiles("venture-that-was-never-created", { root }), []);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
