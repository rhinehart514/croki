import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { createVenture } from "../../src/firm/venture-store.mjs";
import { runFirstRun } from "../../src/firm/first-run.mjs";
import { listConversation } from "../../src/firm/conversation.mjs";

function directory(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function groundedRepo() {
  const repository = directory("croki-firstrun-repo-");
  fs.writeFileSync(path.join(repository, "package.json"), JSON.stringify({
    name: "taskly",
    description: "A small team task tracker.",
    dependencies: { next: "^14" },
  }, null, 2));
  fs.writeFileSync(path.join(repository, "README.md"), "# Taskly\n\nTrack work across a small team.\n");
  fs.mkdirSync(path.join(repository, "src", "app", "pricing"), { recursive: true });
  fs.writeFileSync(path.join(repository, "src", "app", "pricing", "page.tsx"), "export default function Pricing() {\n  return <h1>Simple pricing</h1>;\n}\n");
  return repository;
}

describe("first run: connect and ground without ceremony", () => {
  it("derives source-backed pages without inserting theory, offers, or conversation", () => {
    const options = { root: directory("croki-firstrun-store-") };
    const repository = groundedRepo();
    const venture = createVenture({ name: "Taskly", repository }, options);

    const result = runFirstRun({ ventureId: venture.id, repository }, options);

    assert.equal(result.grounded, true);
    assert.equal(result.theory, null);
    assert.deepEqual(result.offers, []);
    assert.equal(result.messageId, undefined);
    assert.equal(listConversation(venture.id, options).length, 0);
    assert.ok(result.pages.some((page) => page.route === "/pricing"));

    fs.rmSync(options.root, { recursive: true, force: true });
    fs.rmSync(repository, { recursive: true, force: true });
  });

  it("stays honestly empty when the repository has no citable source", () => {
    const options = { root: directory("croki-firstrun-store-") };
    const repository = directory("croki-firstrun-blind-");
    const venture = createVenture({ name: "Empty", repository }, options);

    const result = runFirstRun({ ventureId: venture.id, repository }, options);

    assert.equal(result.grounded, false);
    assert.equal(result.theory, null);
    assert.deepEqual(result.offers, []);
    assert.deepEqual(result.pages, []);
    assert.equal(listConversation(venture.id, options).length, 0);

    fs.rmSync(options.root, { recursive: true, force: true });
    fs.rmSync(repository, { recursive: true, force: true });
  });
});
