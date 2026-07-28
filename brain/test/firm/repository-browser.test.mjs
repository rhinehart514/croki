import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { after, before, describe, it } from "node:test";

const persistenceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "croki-repository-browser-home-"));
process.env.GTM_IDE_HOME = persistenceRoot;
process.env.GTM_IDE_PERSISTENCE = "json";

const {
  listWorkspaceRepositoryTree,
  readVentureRepositoryFile,
  readWorkspaceRepositoryFile,
  repositoryBrowserLimits,
  searchWorkspaceRepositoryPaths,
} = await import("../../src/firm/repository-files.mjs");
const { openCodingWorkspace } = await import("../../src/firm/code-workspace.mjs");
const { createVenture } = await import("../../src/firm/venture-store.mjs");
const { dispatchRequest } = await import("../../src/request-dispatcher.mjs");

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function responseReceipt() {
  let resolve;
  const done = new Promise((settle) => { resolve = settle; });
  const response = {
    statusCode: 200,
    headers: {},
    chunks: [],
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = String(value); },
    writeHead(status, headers = {}) {
      this.statusCode = status;
      for (const [name, value] of Object.entries(headers)) this.setHeader(name, value);
      return this;
    },
    write(chunk = "") { this.chunks.push(Buffer.from(String(chunk))); return true; },
    end(chunk = "") {
      if (chunk) this.write(chunk);
      resolve({
        status: this.statusCode,
        body: JSON.parse(Buffer.concat(this.chunks).toString("utf8") || "{}"),
      });
      return this;
    },
  };
  return { response, done };
}

async function get(url) {
  const { response, done } = responseReceipt();
  await dispatchRequest({
    method: "GET",
    url,
    headers: {},
    socket: { remoteAddress: "127.0.0.1" },
  }, response);
  return done;
}

describe("active-worktree repository browser", () => {
  let repo;
  let outside;
  let venture;
  let otherVenture;
  let workspace;

  before(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), "croki-repository-browser-repo-"));
    outside = fs.mkdtempSync(path.join(os.tmpdir(), "croki-repository-browser-outside-"));
    git(repo, ["init", "-q"]);
    git(repo, ["config", "user.email", "test@example.com"]);
    git(repo, ["config", "user.name", "Test"]);
    write(path.join(repo, ".gitignore"), ".drover-worktrees/\nnode_modules/\n.env*\n");
    write(path.join(repo, "README.md"), "# Repository\n\nUnchanged source remains reviewable.\n");
    write(
      path.join(repo, "src", "long.ts"),
      Array.from({ length: 320 }, (_, index) => `export const line${index + 1} = ${index + 1};`).join("\n"),
    );
    write(path.join(repo, "src", "guide.md"), "# Guide\n");
    write(path.join(repo, "src", "page.html"), "<main>Workbench</main>\n");
    write(path.join(repo, "assets", "pixel.png"), Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    ));
    write(path.join(repo, "binary.dat"), Buffer.from([0, 1, 2, 3, 255, 254]));
    write(path.join(repo, "document.pdf"), "%PDF-1.7\nASCII-looking binary fixture\n");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-qm", "repository browser fixture"]);
    const options = { root: persistenceRoot, seedFoundingCrew: false, nativeCodingHostVerification: false };
    venture = createVenture({ name: "Repository browser", repository: repo }, options);
    otherVenture = createVenture({ name: "Other isolated venture", repository: repo }, options);
    workspace = openCodingWorkspace({
      ventureId: venture.id,
      runId: "repository-browser",
      threadRef: "thread:repository-browser",
      participantRef: "claude",
      provider: "claude-code",
      repository: repo,
      goal: "Inspect unchanged files",
    }, options);

    write(
      path.join(workspace.worktree, "large.txt"),
      Buffer.alloc(repositoryBrowserLimits.maxTextBytes + 1, "a"),
    );
    write(path.join(repo, "source-only.txt"), "must not appear in the isolated worktree\n");
    write(path.join(repo, "credentials.json"), "{\"token\":\"must-not-leak\"}\n");
    fs.appendFileSync(path.join(repo, ".gitignore"), "credentials.json\n");
    fs.symlinkSync(path.join(outside, "secret.txt"), path.join(repo, "source-link.txt"));
    write(path.join(outside, "secret.txt"), "outside\n");
    fs.symlinkSync(path.join(outside, "secret.txt"), path.join(workspace.worktree, "outside-link.txt"));
  });

  after(() => {
    fs.rmSync(persistenceRoot, { recursive: true, force: true });
    fs.rmSync(repo, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });

  it("paginates a virtualizable tree and searches exact tracked/untracked paths", () => {
    const first = listWorkspaceRepositoryTree(workspace.worktree, { limit: 2 });
    assert.equal(first.entries.length, 2);
    assert.equal(first.cursor, 0);
    assert.ok(Number.isInteger(first.nextCursor));
    const second = listWorkspaceRepositoryTree(workspace.worktree, {
      cursor: first.nextCursor,
      limit: 2,
    });
    assert.ok(second.entries.length > 0);
    assert.notDeepEqual(second.entries, first.entries);

    const found = searchWorkspaceRepositoryPaths(workspace.worktree, {
      query: "long",
      limit: 20,
    });
    assert.deepEqual(found.entries.map((entry) => entry.path), ["src/long.ts"]);
    assert.equal(found.entries[0].presentation, "text");
    assert.deepEqual(
      searchWorkspaceRepositoryPaths(workspace.worktree, { query: "source-only" }).entries,
      [],
      "the venture source checkout cannot leak into the active isolated worktree projection",
    );
  });

  it("opens an unchanged file at line 200 with exact range metadata and a source ref", () => {
    const file = readWorkspaceRepositoryFile(workspace.worktree, {
      file: "src/long.ts",
      startLine: 200,
      endLine: 205,
    });
    assert.equal(file.state, "ready");
    assert.equal(file.presentation, "text");
    assert.equal(file.startLine, 200);
    assert.equal(file.endLine, 205);
    assert.equal(file.lineCount, 320);
    assert.equal(file.hasMoreBefore, true);
    assert.equal(file.hasMoreAfter, true);
    assert.match(file.content, /^export const line200 = 200;/);
    assert.match(file.ref, /^repository:src\/long\.ts#L200-L205:[0-9a-f]{12}$/);
  });

  it("reads exact source from the venture repository without requiring a coding workspace", () => {
    const file = readVentureRepositoryFile(venture.id, {
      file: "source-only.txt",
      startLine: 1,
      endLine: 1,
    });
    assert.equal(file.state, "ready");
    assert.equal(file.path, "source-only.txt");
    assert.equal(file.content, "must not appear in the isolated worktree");
    assert.match(file.ref, /^repository:source-only\.txt#L1-L1:[0-9a-f]{12}$/);
  });

  it("classifies Markdown, web, and image files without treating binary source as text", () => {
    const markdown = readWorkspaceRepositoryFile(workspace.worktree, { file: "src/guide.md" });
    const web = readWorkspaceRepositoryFile(workspace.worktree, { file: "src/page.html" });
    const image = readWorkspaceRepositoryFile(workspace.worktree, { file: "assets/pixel.png" });
    const binary = readWorkspaceRepositoryFile(workspace.worktree, { file: "binary.dat" });
    const binaryByKind = readWorkspaceRepositoryFile(workspace.worktree, { file: "document.pdf" });

    assert.equal(markdown.presentation, "markdown");
    assert.equal(markdown.state, "ready");
    assert.equal(web.presentation, "web");
    assert.equal(web.state, "ready");
    assert.equal(image.presentation, "image");
    assert.equal(image.state, "ready");
    assert.equal(image.encoding, "base64");
    assert.ok(image.content.length > 20);
    assert.equal(binary.presentation, "binary");
    assert.equal(binary.state, "binary");
    assert.equal("content" in binary, false);
    assert.equal(binaryByKind.presentation, "binary");
    assert.equal(binaryByKind.state, "binary");
  });

  it("returns exact oversized and removed states", () => {
    const oversized = readWorkspaceRepositoryFile(workspace.worktree, { file: "large.txt" });
    const removed = readWorkspaceRepositoryFile(workspace.worktree, { file: "src/removed.ts" });

    assert.deepEqual(
      {
        state: oversized.state,
        presentation: oversized.presentation,
        size: oversized.size,
        limit: oversized.limit,
      },
      {
        state: "oversized",
        presentation: "text",
        size: repositoryBrowserLimits.maxTextBytes + 1,
        limit: repositoryBrowserLimits.maxTextBytes,
      },
    );
    assert.equal(removed.state, "removed");
    assert.equal(removed.path, "src/removed.ts");
    assert.match(removed.message, /no longer exists/i);
  });

  it("fails closed for traversal, git metadata, secret files, and symlinks", () => {
    for (const file of ["../secret.txt", ".git/config", ".env", "outside-link.txt"]) {
      assert.throws(
        () => readWorkspaceRepositoryFile(workspace.worktree, { file }),
        (error) => (
          ["repository_path_invalid", "repository_symlink_forbidden"].includes(error.code)
          && [400, 403].includes(error.status)
        ),
        file,
      );
    }
  });

  it("keeps a large path set bounded and page-sized", () => {
    const many = path.join(workspace.worktree, "many");
    fs.mkdirSync(many);
    for (let index = 0; index < 5_000; index += 1) {
      fs.writeFileSync(path.join(many, `file-${String(index).padStart(5, "0")}.txt`), `${index}\n`);
    }
    const started = performance.now();
    const tree = listWorkspaceRepositoryTree(workspace.worktree, {
      directory: "many",
      limit: 50,
    });
    const elapsed = performance.now() - started;
    assert.equal(tree.entries.length, 50);
    assert.equal(tree.total, 5_000);
    assert.equal(tree.nextCursor, 50);
    assert.ok(elapsed < 3_000, `large repository page took ${Math.round(elapsed)}ms`);
  });

  it("serves the same exact states through the active coding-workspace routes", async () => {
    const base = `/api/ventures/${encodeURIComponent(venture.id)}/coding-workspaces/${encodeURIComponent(workspace.id)}/repository`;
    const tree = await get(`${base}/tree?path=src&limit=2`);
    assert.equal(tree.status, 200);
    assert.equal(tree.body.tree.entries.length, 2);

    const search = await get(`${base}/search?q=guide&limit=10`);
    assert.equal(search.status, 200);
    assert.equal(search.body.search.entries[0].path, "src/guide.md");

    const file = await get(`${base}/file?path=src%2Flong.ts&startLine=200&endLine=201`);
    assert.equal(file.status, 200);
    assert.equal(file.body.file.startLine, 200);
    assert.match(file.body.file.ref, /#L200-L201:/);

    const refused = await get(`${base}/file?path=..%2Foutside.txt`);
    assert.equal(refused.status, 400);
    assert.equal(refused.body.code, "repository_path_invalid");

    const crossVenture = await get(
      `/api/ventures/${encodeURIComponent(otherVenture.id)}/coding-workspaces/${encodeURIComponent(workspace.id)}/repository/tree`,
    );
    assert.equal(crossVenture.status, 404);
  });

  it("serves venture-root citations while refusing secret and escaping paths", async () => {
    const base = `/api/ventures/${encodeURIComponent(venture.id)}/repository/file`;
    const file = await get(`${base}?path=source-only.txt&startLine=1&endLine=1`);
    assert.equal(file.status, 200);
    assert.equal(file.body.file.content, "must not appear in the isolated worktree");
    assert.match(file.body.file.ref, /^repository:source-only\.txt#L1-L1:[0-9a-f]{12}$/);

    for (const unsafe of ["../secret.txt", ".git/config", ".env", "credentials.json", "source-link.txt"]) {
      const refused = await get(`${base}?path=${encodeURIComponent(unsafe)}`);
      assert.ok([400, 403, 404].includes(refused.status), unsafe);
      assert.ok(
        ["repository_path_invalid", "repository_path_unavailable", "repository_symlink_forbidden"].includes(refused.body.code),
        unsafe,
      );
    }

    const missing = await get("/api/ventures/venture-that-does-not-exist/repository/file?path=README.md");
    assert.equal(missing.status, 404);
    assert.equal(missing.body.code, "repository_workspace_unavailable");
  });
});
