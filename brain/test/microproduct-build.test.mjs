import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  assertLocalBuildCommand,
  buildMicroproduct,
  writeArtifactFiles,
} from "../src/build.mjs";

describe("buildMicroproduct — local build leg, never deploys", () => {
  let parent;
  let worktreeRoot;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-microbuild-"));
    worktreeRoot = path.join(parent, "builds");
  });

  afterEach(() => {
    fs.rmSync(parent, { recursive: true, force: true });
  });

  it("writes producer files into an isolated dir and captures a preview (no repo, no build cmd)", async () => {
    const result = await buildMicroproduct(
      {
        name: "Pilot Landing Page",
        files: [
          { path: "index.html", contents: "<h1>Pilot</h1>" },
          { path: "assets/app.css", contents: "h1{color:#000}" },
        ],
      },
      { worktreeRoot },
    );

    assert.equal(result.ok, true);
    assert.equal(result.deployed, false);
    assert.equal(result.staged, true);
    assert.deepEqual(result.files.sort(), ["assets/app.css", "index.html"]);
    // Files actually exist on disk in the local build dir.
    assert.equal(fs.readFileSync(path.join(result.worktree, "index.html"), "utf8"), "<h1>Pilot</h1>");
    // Preview points at the static output and finds the entry file.
    assert.equal(result.preview.exists, true);
    assert.equal(result.preview.entry, "index.html");
    assert.ok(result.preview.files.includes("assets/app.css"));
  });

  it("runs install then build via an injectable runner (no network) and captures the built dir", async () => {
    const calls = [];
    const result = await buildMicroproduct(
      {
        name: "Demo App",
        files: [{ path: "src/main.js", contents: "console.log('hi')" }],
        install: "npm install",
        build: "npm run build",
        previewDir: "dist",
      },
      {
        worktreeRoot,
        runCommand: async ({ worktree, command, label }) => {
          calls.push(label);
          if (label === "build") {
            // Simulate the build emitting a static output dir.
            fs.mkdirSync(path.join(worktree, "dist"), { recursive: true });
            fs.writeFileSync(path.join(worktree, "dist/index.html"), "<main>built</main>");
          }
          return { ok: true, status: 0, stdout: `${command} ok`, stderr: "" };
        },
      },
    );

    assert.deepEqual(calls, ["install", "build"]);
    assert.equal(result.ok, true);
    assert.equal(result.deployed, false);
    assert.equal(result.buildSteps.length, 2);
    assert.equal(result.preview.dir, path.join(result.worktree, "dist"));
    assert.equal(result.preview.entry, "index.html");
    assert.equal(
      fs.readFileSync(path.join(result.preview.dir, "index.html"), "utf8"),
      "<main>built</main>",
    );
  });

  it("reports a failed build step without deploying", async () => {
    const result = await buildMicroproduct(
      {
        name: "Broken",
        files: [{ path: "index.html", contents: "<h1>x</h1>" }],
        build: "npm run build",
      },
      {
        worktreeRoot,
        runCommand: async () => ({ ok: false, status: 1, stdout: "", stderr: "boom" }),
      },
    );

    assert.equal(result.ok, false);
    assert.equal(result.deployed, false);
    assert.equal(result.staged, false);
    assert.equal(result.preview, null);
    assert.match(result.error, /build step "build" failed/i);
  });

  it("builds inside an isolated git worktree off a product repo, never committing", async () => {
    const repo = path.join(parent, "repo");
    fs.mkdirSync(repo, { recursive: true });
    fs.writeFileSync(path.join(repo, "README.md"), "product\n");
    execFileSync("git", ["init", "-q", repo]);
    execFileSync("git", ["-C", repo, "config", "user.email", "t@example.test"]);
    execFileSync("git", ["-C", repo, "config", "user.name", "Test"]);
    execFileSync("git", ["-C", repo, "add", "."]);
    execFileSync("git", ["-C", repo, "commit", "-qm", "init"]);
    const head = execFileSync("git", ["-C", repo, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();

    const result = await buildMicroproduct(
      {
        name: "Repo Microproduct",
        repo,
        files: [{ path: "landing/index.html", contents: "<h1>cut</h1>" }],
      },
      { worktreeRoot },
    );

    assert.equal(result.ok, true);
    assert.equal(result.baseCommit, head);
    assert.match(result.branch, /codex\/gtm-build-/);
    assert.notEqual(path.resolve(result.worktree), path.resolve(repo));
    // The product repo's HEAD did not move — building does not commit/push.
    const afterHead = execFileSync("git", ["-C", repo, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    assert.equal(afterHead, head);
    // The file lives in the isolated worktree, not in the source repo.
    assert.ok(fs.existsSync(path.join(result.worktree, "landing/index.html")));
    assert.equal(fs.existsSync(path.join(repo, "landing/index.html")), false);

    execFileSync("git", ["-C", repo, "worktree", "remove", "--force", result.worktree]);
    execFileSync("git", ["-C", repo, "branch", "-D", result.branch]);
  });

  it("rejects a deploy-like build command so the build leg cannot smuggle a ship", async () => {
    let ran = false;
    const result = await buildMicroproduct(
      {
        name: "Sneaky",
        files: [{ path: "index.html", contents: "x" }],
        build: "vercel deploy --prod",
      },
      {
        worktreeRoot,
        runCommand: async () => {
          ran = true;
          return { ok: true, status: 0 };
        },
      },
    );

    assert.equal(ran, false, "a deploy-like command must never be executed");
    assert.equal(result.ok, false);
    assert.equal(result.deployed, false);
    assert.match(result.error, /local-only|deploy/i);
    assert.throws(() => assertLocalBuildCommand("git push origin main"), /local-only/i);
  });

  it("refuses producer paths that escape the build dir", async () => {
    const dir = fs.mkdtempSync(path.join(parent, "wt-"));
    assert.throws(
      () => writeArtifactFiles(dir, [{ path: "../escape.html", contents: "x" }]),
      /escapes the worktree/i,
    );
    assert.throws(
      () => writeArtifactFiles(dir, [{ path: "/etc/passwd", contents: "x" }]),
      /must be relative/i,
    );
  });

  it("returns an honest error when there are no files to build", async () => {
    const result = await buildMicroproduct({ name: "Empty", files: [] }, { worktreeRoot });
    assert.equal(result.ok, false);
    assert.equal(result.deployed, false);
    assert.match(result.error, /no artifact files/i);
  });
});
