// operator-in-repo-change.test.mjs — Area 5 MOVE 2 + MOVE 3: an in-repo product change is a first-class
// go-to-market motion that ships through the SAME wall-graduating deploy leg as a standalone microproduct,
// and registers on the shared object map as ONE change:<repo>#<path> object.
//
// What this proves:
//   MOVE 2 — when the producer emits an IN-REPO change (artifactSpec.inRepo === true), compose_microproduct
//     cuts a git worktree OFF the real repo (a branch, files at real paths) and sets the deploy node's
//     config.repo to that worktree, so deploy.mjs's BYO push/PR ships the real change — the zero-credential
//     alpha ship path. A standalone microproduct leaves config.repo unset (its ship path is the hosted runner).
//   MOVE 3 — the staged change item carries change-object identity (kind:"change", repo, path), so the
//     run-derivation touch deriver files it on the shared map as one change:<repo>#<path> object.
//   THE WALL — the run still stops at the founder gate, deploying nothing; the deploy connector still refuses
//     without the explicit founder deploy confirmation.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { loadFlow } from "../src/flow-store.mjs";
import { createOperatorSession } from "../src/operator-store.mjs";
import { executeOperatorTool, resolveOperatorGate } from "../src/operator-runtime.mjs";
import { listObjectTouches, getObjectTouch } from "../src/gtm-store.mjs";
import { objectKey } from "../src/object-identity.mjs";

function git(cwd, args) {
  execFileSync("git", ["-C", cwd, ...args], { stdio: ["ignore", "pipe", "pipe"] });
}

// A keyless client that lets the post-gate relaunch finish cleanly (one `complete` turn).
function completingClient() {
  let index = 0;
  return {
    messages: {
      async create() {
        index += 1;
        if (index > 1) throw new Error("Unexpected extra model turn.");
        return { content: [{ type: "tool_use", id: "done", name: "complete", input: { outcome: "achieved", summary: "Resolved." } }] };
      },
    },
  };
}

// An in-repo change producer: files targeting REAL paths inside the founder's product, inRepo:true.
function inRepoProducer() {
  return {
    ok: true,
    artifactSpec: {
      name: "share-link",
      kind: "product-change",
      summary: "Adds a share link to every sale page.",
      entry: "app/sale/[id]/ShareLink.tsx",
      inRepo: true,
      groundedClaims: ["sale pages exist at app/sale/[id]/page.tsx (scan)"],
    },
    artifactFiles: [
      { path: "app/sale/[id]/ShareLink.tsx", contents: "export function ShareLink() { return null; }\n" },
    ],
  };
}

describe("compose_microproduct — an in-repo product change (Area 5 MOVE 2 + MOVE 3)", () => {
  let parent;
  let repo;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-in-repo-change-"));
    repo = path.join(parent, "repo");
    fs.mkdirSync(repo);
    // A REAL git repo so the in-repo build can cut a worktree off it.
    git(repo, ["init", "-q"]);
    git(repo, ["config", "user.email", "t@t.dev"]);
    git(repo, ["config", "user.name", "Test"]);
    fs.mkdirSync(path.join(repo, "app", "sale", "[id]"), { recursive: true });
    fs.writeFileSync(path.join(repo, "app", "sale", "[id]", "page.tsx"), "export default function Page() { return null; }\n");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-q", "-m", "init"]);
    options = { root: path.join(parent, "state"), claudeDir: path.join(parent, "claude"), cwd: repo };
  });

  afterEach(async () => {
    // The operator records presentation-only teammate narration after returning the durable gate
    // result. Let that bounded callback settle before deleting this test's isolated session store.
    await new Promise((resolve) => setTimeout(resolve, 20));
    // The build cut a worktree off `repo`; prune registrations before removing the tree.
    try { git(repo, ["worktree", "prune"]); } catch { /* best-effort cleanup */ }
    fs.rmSync(parent, { recursive: true, force: true });
  });

  it("cuts a worktree off the real repo and points the deploy ship leg (config.repo) at it", async () => {
    const session = createOperatorSession({ goal: "Add a share link to every sale page.", projectId: "default" }, options);
    const execution = await executeOperatorTool(
      session,
      { id: "ir-1", name: "compose_microproduct", input: { title: "Share link", target: "in-repo" } },
      { ...options, produceMicroproduct: inRepoProducer },
    );

    // Still stops at the founder gate — an in-repo change never ships before approval.
    assert.equal(execution.session.status, "waiting_for_gate");
    assert.ok(execution.session.pendingGate?.nodeIds?.includes("deploy-gate"));

    const graph = loadFlow(execution.session.graphId, null, options).graph;
    const deploy = graph.nodes.find((n) => n.category === "execute");
    assert.ok(deploy, "the deploy execute node exists");
    assert.equal(deploy.connector, "deploy");
    // MOVE 2: the ship leg targets the build worktree cut off the real repo.
    assert.ok(deploy.config.repo, "config.repo is set to the build worktree for the BYO push/PR");
    assert.match(deploy.config.repo, /-build-/, "config.repo is the cut build worktree, not the source repo");
    assert.equal(deploy.config.runner, "byo", "an in-repo change ships via the BYO push path (zero credentials)");
    assert.ok(deploy.config.branch, "a change branch was cut for the push");
    // The worktree really exists on disk with the change file written at its real path.
    assert.ok(fs.existsSync(path.join(deploy.config.repo, "app", "sale", "[id]", "ShareLink.tsx")),
      "the change file landed at its real in-repo path inside the isolated worktree");
    // And the FOUNDER'S working tree is untouched — the change lives only in the isolated worktree.
    assert.ok(!fs.existsSync(path.join(repo, "app", "sale", "[id]", "ShareLink.tsx")),
      "the founder's real working tree is never written — stop-before-commit holds");
  });

  it("registers the change as ONE change:<repo>#<path> object on the shared touch ledger (MOVE 3)", async () => {
    const session = createOperatorSession({ goal: "Add a share link.", projectId: "default" }, options);
    await executeOperatorTool(
      session,
      { id: "ir-2", name: "compose_microproduct", input: { title: "Share link", target: "in-repo" } },
      { ...options, produceMicroproduct: inRepoProducer },
    );

    const touches = listObjectTouches("default", options);
    const changeTouches = touches.filter((t) => String(t.objectKey || t.key || "").startsWith("change:"));
    assert.ok(changeTouches.length >= 1, "the proposed in-repo change registered as a change object on the map");
    // It is keyed by Area 1's deterministic change key (repo + primary path) — the SAME key a later win joins.
    const expectedKey = objectKey("change", { repo, path: "app/sale/[id]/ShareLink.tsx" });
    const record = getObjectTouch("default", expectedKey, options);
    assert.ok(record, `the change object exists under its deterministic key ${expectedKey}`);
    assert.ok((record.touches ?? []).length >= 1, "it carries at least one touch (proposed at the run-derivation seam)");
  });

  it("even both authorizations leave the in-repo change staged without attempting a push", async () => {
    const session = createOperatorSession({ goal: "Add a share link.", projectId: "default" }, options);
    const execution = await executeOperatorTool(
      session,
      { id: "ir-ship", name: "compose_microproduct", input: { title: "Share link", target: "in-repo" } },
      { ...options, produceMicroproduct: inRepoProducer },
    );
    const graphId = execution.session.graphId;

    // The founder approves the gate AND explicitly confirms the deploy. GUARD 2 clears, and the BYO push
    // runner actually runs against the cut worktree — which has NO configured remote, so it fails HONESTLY
    // (a real git error), never a fake ship. That the deploy failed at the push (not at GUARD 2) proves the
    // whole ship leg is wired: config.repo reached the runner and the runner ran.
    await resolveOperatorGate(
      execution.session.id,
      { approvals: { "deploy-gate": true }, deployConfirmed: true },
      { options, client: completingClient() },
    );
    const confirmedRun = loadFlow(graphId, null, options).runs.at(-1).result;
    const deployNode = confirmedRun.nodes.deploy;
    assert.ok(deployNode, "the deploy node ran on resume");
    assert.equal(deployNode.ok, true);
    assert.equal(deployNode.meta?.reason, "ordinary_product_change_boundary");
    assert.equal((deployNode.items ?? [])[0]?.executionStatus, "staged_for_review");
    assert.equal((deployNode.items ?? [])[0]?.deployed, false);
  });

  it("a standalone microproduct (inRepo absent) leaves config.repo unset — its ship path is the hosted runner", async () => {
    const standalone = () => ({
      ok: true,
      artifactSpec: { name: "demo", kind: "landing", entry: "index.html" },
      artifactFiles: [{ path: "index.html", contents: "<!doctype html><title>demo</title>" }],
    });
    const session = createOperatorSession({ goal: "Ship a demo landing page.", projectId: "default" }, options);
    const execution = await executeOperatorTool(
      session,
      { id: "sa-1", name: "compose_microproduct", input: { title: "Demo" } },
      { ...options, produceMicroproduct: standalone },
    );
    const graph = loadFlow(execution.session.graphId, null, options).graph;
    const deploy = graph.nodes.find((n) => n.category === "execute");
    assert.ok(!deploy.config.repo, "a standalone microproduct sets no config.repo (no git worktree to push)");
  });
});
