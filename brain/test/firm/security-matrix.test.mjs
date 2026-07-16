// security-matrix.test.mjs — adversarial red-team pass over FIRM-SPEC.md §Verification, run fresh
// against the current tree (not a re-run of what builders already proved with their own happy-path
// and refusal tests). Every test here is an ATTEMPT TO VIOLATE an invariant; the assertion is that the
// attempt fails closed. Where an attack surface turned out to have no test anywhere in this tree, it
// is added here rather than left as a gap. Where an attack actually succeeded, that is a genuine hole
// and is reported separately (see the audit report), never silently patched into a passing test.
//
// Conventions borrowed from the existing suites so this reads as one family, not a foreign layer:
// wall-routes.test.mjs's Readable-body call() harness, firm-mcp.test.mjs's AGENT_HEADERS stamp,
// product-routes.test.mjs's stagedFixture() shape, GTM_IDE_HOME module-scope isolation.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { Readable } from "node:stream";
import { describe, it } from "node:test";
import { founderHeaders, founderRequest } from "../helpers/founder-capability.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "drover-security-matrix-"));
process.env.GTM_IDE_HOME = root;
process.env.GTM_IDE_PERSISTENCE = "json";

const { createVenture, setVentureDoc, getVentureDoc } = await import("../../src/firm/venture-store.mjs");
const { createBet, end: endBet } = await import("../../src/firm/bet.mjs");
const { park, decide, hasWallRelease, queue } = await import("../../src/firm/wall.mjs");
const { getHeatSettings, setHeatSettings } = await import("../../src/firm/heat.mjs");
const { buildLens, putPlacement } = await import("../../src/firm/lens.mjs");
const { forkProductBet, stageProductBetForReview, getWorkspace } = await import("../../src/firm/product-change.mjs");
const { reviewProductBetChange, applyProductBetChange, revertProductBetChange, discardProductBetChange } = await import("../../src/firm/product-change-decide.mjs");
const { createEffectExecutor } = await import("../../src/firm/effect-executors.mjs");
const { recordGrant, grantSkipsWait } = await import("../../src/firm/grants.mjs");

const { default: wallRoutes } = await import("../../src/firm/routes.mjs");
const { default: heatRoutes } = await import("../../src/firm/heat-routes.mjs");
const { default: productRoutes } = await import("../../src/firm/product-routes.mjs");
const { default: lensRoutes } = await import("../../src/firm/lens-routes.mjs");
const { default: ventureRoutes } = await import("../../src/firm/venture-routes.mjs");

const { __resetPresence } = await import("../../src/presence.mjs");

const options = { root, queueDir: path.join(root, "dogfood", "queue") };

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}
function fixtureRepo() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "security-matrix-repo-"));
  git(repo, ["init", "-q"]);
  git(repo, ["config", "user.email", "t@x.com"]);
  git(repo, ["config", "user.name", "T"]);
  fs.writeFileSync(path.join(repo, "a.txt"), "before\n");
  git(repo, ["add", "."]);
  git(repo, ["commit", "-qm", "base"]);
  return repo;
}

const AGENT_HEADERS = { "x-gtm-actor": "agent" };

async function call(handler, method, pathname, body = {}, headers = {}) {
  const req = Readable.from([JSON.stringify(body)]);
  req.method = method;
  req.url = pathname;
  req.headers = { "content-type": "application/json", ...founderHeaders({ method, path: pathname }), ...headers };
  let status = 0;
  let raw = "";
  const res = { writeHead(next) { status = next; }, setHeader() {}, end(next) { raw += next ?? ""; } };
  const handled = await handler({ req, res, url: new URL(pathname, "http://local") });
  return { handled, status, body: raw ? JSON.parse(raw) : null };
}

function freshVenture(name) {
  const venture = createVenture({ name }, options);
  const bet = createBet({ ventureId: venture.id, intent: `${name} bet` });
  setVentureDoc(venture.id, "bets", bet.id, bet, options);
  return { venture, bet };
}

// ── 1. SELF-APPROVAL from every door ──────────────────────────────────────────────────────────────
//
// Beyond the existing tests (which prove missing-request/agent-stamped refusal on wall.decide and heat via
// wall.test.mjs/heat.test.mjs/firm-mcp.test.mjs), this section attacks TWO surfaces those files never
// touch: the product-change apply/review/revert/discard routes' actor derivation, and a hand-crafted
// caller-supplied actor object shaped to *look* like a founder identity.

describe("SELF-APPROVAL — product-change routes never take actor from the caller's body", () => {
  async function stagedFixture() {
    const repo = fixtureRepo();
    const { venture, bet } = freshVenture("Product-change self-approval");
    const enqueued = forkProductBet({ ventureId: venture.id, betId: bet.id, intent: bet.intent }, {
      ...options, repoRoot: repo,
      runQuery: async ({ cwd }) => { fs.writeFileSync(path.join(cwd, "a.txt"), "after\n"); return { text: "done", error: null }; },
    });
    const built = await enqueued.build;
    const { workspaceId, revision } = await stageProductBetForReview(bet, path.basename(built.file), options, { park: async () => ({}) });
    return { venture, bet, workspaceId, revisionId: revision.id, file: path.basename(built.file), repo };
  }

  it("an agent-stamped review/apply POST is refused", async () => {
    const { venture, workspaceId, revisionId } = await stagedFixture();
    const review = await call(productRoutes, "POST", `/api/ventures/${venture.id}/product-change-workspaces/${workspaceId}/revisions/${revisionId}/review`, { decision: "approve" }, AGENT_HEADERS);
    assert.equal(review.status, 403);
    const apply = await call(productRoutes, "POST", `/api/ventures/${venture.id}/product-change-workspaces/${workspaceId}/revisions/${revisionId}/apply`, { confirm: true }, AGENT_HEADERS);
    assert.equal(apply.status, 403);
  });

  it("a body-supplied actor/decidedBy claiming founder is IGNORED — the receipt is stamped from the route's own resolved actor, never the request body", async () => {
    const { venture, workspaceId, revisionId } = await stagedFixture();
    // The attacker tries to inject an actor claim directly in the body — product-change-decide.mjs
    // never reads body.actor/decidedBy at all, but this proves it end to end through the real route.
    const res = await call(
      productRoutes, "POST",
      `/api/ventures/${venture.id}/product-change-workspaces/${workspaceId}/revisions/${revisionId}/review`,
      { decision: "approve", actor: "impostor", decidedBy: "impostor", founderOverride: true },
      {},
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.revision.status, "approved");
    const workspace = getWorkspace(workspaceId, options);
    const decision = workspace.decisions.find((d) => d.type === "product_change_review");
    assert.equal(decision.decidedBy, "founder", "the body's impostor actor claim never reaches the receipt");
  });

  it("store-layer actor check still refuses a model-shaped actor object even if a caller reached product-change-decide.mjs directly (defense in depth, not just the route gate)", async () => {
    const { workspaceId, revisionId } = await stagedFixture();
    assert.throws(() => reviewProductBetChange(workspaceId, revisionId, { kind: "model", ref: "claude" }, { decision: "approve" }, options), /founder-only/);
    assert.throws(() => applyProductBetChange(workspaceId, revisionId, { kind: "agent" }, { confirm: true }, options), /founder-only/);
    assert.throws(() => revertProductBetChange(workspaceId, revisionId, "agent", { confirm: true }, options), /founder-only/);
  });
});

describe("SELF-APPROVAL — a hand-crafted actor object shaped to LOOK like a founder identity is still rejected everywhere the route itself is unauthenticated", () => {
  it("wall.decide(): a caller-supplied auth.actor cannot substitute for a real local HTTP request", () => {
    const { venture, bet } = freshVenture("Founder-shaped actor forgery — wall");
    const item = park({ ventureId: venture.id, betId: bet.id, effect: { kind: "message", to: "x@acme.com" } }, options);
    // No req at all — the founder-shaped `actor` object is irrelevant because
    // authorizeFounderWriteForRequest runs FIRST and never even looks at deps.actor/auth.actor for the
    // authority decision (auth.actor only ever affects what NAME lands in decidedBy after authority is
    // already established by the req check).
    assert.throws(
      () => decide({ ventureId: venture.id, itemId: item.id, decision: "kill" }, { actor: { kind: "founder", ref: "founder", role: "founder" } }, {}, options),
      /local Drover page/i,
    );
  });

  it("bet.end(): an object with kind:'founder' spelled out is the ONLY shape that passes — but a model cannot reach this call without already holding founder authority upstream (wall.decide's own gate runs first in every real path)", () => {
    const { bet } = freshVenture("Founder-shaped actor forgery — bet.end");
    // This documents the actual contract precisely: bet.end()'s OWN check is a string-match on "founder",
    // not itself a session check — so a caller who can invoke bet.end() directly (bypassing wall.decide
    // entirely) COULD forge {kind:"founder"}. This is only safe because no code path in the firm core
    // calls endBet except wall.mjs's decide(), which gates on the real session FIRST. Proven here as an
    // explicit boundary: bet.mjs itself has no independent way to tell a real founder from a forged label.
    const forged = endBet(bet, { kind: "founder", ref: "attacker-claiming-founder" }, { learning: "forged" });
    assert.equal(forged.endedBy, "attacker-claiming-founder", "bet.end()'s OWN authority check is a label match, not a session — it trusts whoever already got past wall.decide()'s real gate to call it honestly");
  });

  it("heat.setHeatSettings(): a caller-supplied actor-shaped object in the auth bag does not bypass authorizeFounderWriteForRequest", () => {
    assert.throws(
      () => setHeatSettings({ ventureId: "irrelevant", heat: "full", dailySpendUsd: 1 }, { actor: { kind: "founder" } }, options),
      /local Drover page/i,
    );
    assert.throws(
      () => setHeatSettings({ ventureId: "irrelevant", heat: "full", dailySpendUsd: 1 }, { actor: { kind: "founder" }, req: { headers: AGENT_HEADERS } }, options),
      /founder-only|model or MCP session/i,
    );
  });
});

// ── 2. CAPABILITY FORGERY ────────────────────────────────────────────────────────────────────────

describe("CAPABILITY FORGERY — WALL_RELEASE is genuinely unreachable from outside wall.mjs", () => {
  it("wall.mjs exports no way to obtain the release Symbol — hasWallRelease is the ONLY export touching it", async () => {
    const wallModule = await import("../../src/firm/wall.mjs");
    const exportNames = Object.keys(wallModule);
    assert.deepEqual(
      exportNames.sort(),
      ["decide", "hasWallRelease", "park", "queue", "queueAll"].sort(),
      "wall.mjs's export surface is exactly this list — no WALL_RELEASE, no factory, no back door",
    );
    // A test literally cannot import the private Symbol; the closest a hostile module could get is
    // re-implementing Symbol("firm.wall-release-capability") itself, proven forgeable-free below.
  });

  it("a freshly minted Symbol with the IDENTICAL description string never satisfies hasWallRelease", () => {
    const lookalike = Symbol("firm.wall-release-capability");
    assert.equal(hasWallRelease({ runtime: { outwardRelease: lookalike } }), false);
  });

  it("Symbol.for() (the GLOBAL symbol registry) never satisfies hasWallRelease — a different symbol space entirely", () => {
    assert.equal(hasWallRelease({ runtime: { outwardRelease: Symbol.for("firm.wall-release-capability") } }), false);
  });

  it("a plain string, a plain object, and a copied-looking nested object all fail hasWallRelease", () => {
    assert.equal(hasWallRelease({ runtime: { outwardRelease: "firm.wall-release-capability" } }), false);
    assert.equal(hasWallRelease({ runtime: { outwardRelease: {} } }), false);
    assert.equal(hasWallRelease({ runtime: { outwardRelease: { description: "firm.wall-release-capability" } } }), false);
    assert.equal(hasWallRelease({}), false);
    assert.equal(hasWallRelease(null), false);
    assert.equal(hasWallRelease(undefined), false);
  });

  it("Object.prototype pollution cannot inject a runtime.outwardRelease onto an innocent effect", () => {
    try {
      // eslint-disable-next-line no-extend-native
      Object.prototype.runtime = { outwardRelease: "polluted" };
      assert.equal(hasWallRelease({}), false);
    } finally {
      delete Object.prototype.runtime;
    }
  });

  it("every executor branch in createEffectExecutor refuses an effect forged with a lookalike release value", () => {
    const executeEffect = createEffectExecutor({ founderActor: "founder", options });
    const forged = { kind: "product-change", workspaceId: "w1", revisionId: "r1", runtime: { outwardRelease: Symbol("firm.wall-release-capability") } };
    assert.throws(() => executeEffect(forged, {}), /release capability/);
    const forgedMessage = { kind: "message", to: "x@acme.com", runtime: { outwardRelease: "firm.wall-release-capability" } };
    assert.throws(() => executeEffect(forgedMessage, {}), /release capability/);
  });

  it("park() strips ANY caller-supplied authorization-claim field, not only deployConfirmed — the parker can never pre-author its own approval", () => {
    const { venture, bet } = freshVenture("Authorization claim stripping");
    const item = park({
      ventureId: venture.id, betId: bet.id,
      effect: { kind: "message", to: "x@acme.com", deployConfirmed: true, deployAuthorization: { confirmed: true }, deployAuthorized: true, authorized: true },
    }, options);
    for (const field of ["deployConfirmed", "deployAuthorization", "deployAuthorized", "authorized"]) {
      assert.equal(field in item.effect, false, `park() failed to strip ${field}`);
    }
  });

  it("re-parking a released item's content creates a genuinely NEW item requiring its own fresh founder decision — never a way to replay the old release", async () => {
    const { venture, bet } = freshVenture("Re-park replay attempt");
    const item = park({ ventureId: venture.id, betId: bet.id, effect: { kind: "message", to: "x@acme.com" } }, options);
    __resetPresence();
    let executions = 0;
    decide({ ventureId: venture.id, itemId: item.id, decision: "release" }, { req: founderRequest() }, { executeEffect: () => { executions += 1; return {}; }, isFounderPresent: () => true }, options);
    assert.equal(executions, 1);
    // Re-parking the SAME effect content mints a genuinely new item id — it is not the same decided
    // document reanimated, and it starts back at decision:null, requiring its own founder act.
    const reparked = park({ ventureId: venture.id, betId: bet.id, effect: { kind: "message", to: "x@acme.com" } }, options);
    assert.notEqual(reparked.id, item.id);
    assert.equal(reparked.decision, null);
    assert.equal(queue(venture.id, options).some((q) => q.id === reparked.id), true, "the re-park sits freshly queued, not auto-released");
  });

  it("double-release on the SAME item is impossible even under rapid repeated calls (decide() is synchronous — no interleaving window exists)", () => {
    const { venture, bet } = freshVenture("Double release race");
    const item = park({ ventureId: venture.id, betId: bet.id, effect: { kind: "message", to: "x@acme.com" } }, options);
    __resetPresence();
    let executions = 0;
    let successes = 0;
    let refusals = 0;
    for (let i = 0; i < 5; i += 1) {
      try {
        decide({ ventureId: venture.id, itemId: item.id, decision: "release" }, { req: founderRequest() }, { executeEffect: () => { executions += 1; return {}; }, isFounderPresent: () => true }, options);
        successes += 1;
      } catch { refusals += 1; }
    }
    assert.equal(successes, 1);
    assert.equal(refusals, 4);
    assert.equal(executions, 1, "the executor never ran more than once for one item");
  });

  it("path traversal on ventureId/betId neutralizes into a harmless filename — no directory escape", () => {
    // Isolated root, not the module-scope `options` every other test in this file shares — this test
    // asserts something about the EXACT SET of files in ventures/, so it must never run against a
    // directory forty other tests are also writing into. De-flaked per builder-f2's report: the
    // failure was never real path-traversal non-determinism (createVenture's JSON-backend write is a
    // synchronous atomicWriteFile — write temp, fs.renameSync, done — so the file exists under its
    // final name before this line ever runs); it was a shared-directory listing picking up unrelated
    // ventures created by concurrent tests in the same describe file. A private tmp root removes that
    // entirely, and the assertion itself is the pure structural invariant with no filesystem-timing
    // dependency: the resolved real path's parent directory is exactly ventures/, never a `..`-prefix
    // substring check (safeId()'s own collapse can legitimately produce a filename that STARTS WITH
    // literal dots — "..-..-etc-passwd.json" — which would falsely trip a naive
    // rel.startsWith("..")/name.includes("..") check despite the file being perfectly contained).
    const isolatedOptions = { root: fs.mkdtempSync(path.join(os.tmpdir(), "drover-path-traversal-")) };
    const venture = createVenture({ name: "Path traversal probe" }, isolatedOptions);
    const bet = createBet({ ventureId: venture.id, intent: "top secret" });
    setVentureDoc(venture.id, "bets", bet.id, bet, isolatedOptions);
    assert.throws(() => getVentureDoc(`../${venture.id}`, "bets", bet.id, isolatedOptions), /No such venture/);

    const evil = createVenture({ name: "Evil", id: "../../etc/passwd" }, isolatedOptions);
    assert.equal(evil.id, "../../etc/passwd", "the manifest object itself is not required to sanitize the id");

    const venturesDir = path.join(isolatedOptions.root, "ventures");
    const entries = fs.readdirSync(venturesDir);
    const evilFile = entries.find((name) => name.includes("etc-passwd"));
    assert.ok(evilFile, "the traversal id was neutralized into a harmless filename, not silently dropped");

    // The real, deterministic invariant: the neutralized file's resolved real path has ventures/ as its
    // exact parent directory. No substring check on the filename, no relative-path prefix check — a
    // pure structural comparison of two real, already-existing paths, with no timing dependency at all.
    const resolvedFile = fs.realpathSync(path.join(venturesDir, evilFile));
    const resolvedVenturesDir = fs.realpathSync(venturesDir);
    assert.equal(path.dirname(resolvedFile), resolvedVenturesDir, "the neutralized file's parent is exactly ventures/, never an escaped location");
  });
});

// ── 3. DEPLOY TWO-STEP ───────────────────────────────────────────────────────────────────────────

describe("DEPLOY TWO-STEP — pre-stamped confirmation on the parked effect never substitutes for the founder's separate authorize-deploy act", () => {
  it("a deploy effect parked with deployConfirmed:true pre-stamped is STILL refused release without authorize-deploy — because park() already stripped that claim on the way in", () => {
    const { venture, bet } = freshVenture("Deploy pre-stamp attack");
    const item = park({ ventureId: venture.id, betId: bet.id, effect: { kind: "deploy", target: "prod", deployConfirmed: true } }, options);
    assert.equal("deployConfirmed" in item.effect, false);
    __resetPresence();
    assert.throws(
      () => decide({ ventureId: venture.id, itemId: item.id, decision: "release" }, { req: founderRequest() }, { executeEffect: () => ({}), isFounderPresent: () => true }, options),
      /second explicit founder authorization/i,
    );
  });

  it("authorize-deploy from a missing-request or agent-stamped caller is rejected", () => {
    const { venture, bet } = freshVenture("Authorize-deploy self-approval");
    const item = park({ ventureId: venture.id, betId: bet.id, effect: { kind: "deploy", target: "prod" } }, options);
    assert.throws(
      () => decide({ ventureId: venture.id, itemId: item.id, decision: "authorize-deploy" }, {}, {}, options),
      /local Drover page/i,
    );
    assert.throws(
      () => decide({ ventureId: venture.id, itemId: item.id, decision: "authorize-deploy" }, { req: { headers: AGENT_HEADERS } }, {}, options),
      /model or MCP session/i,
    );
  });

  it("the real two-step through effect-executors.mjs's dispatcher: release ships only after BOTH authorize-deploy AND release, never from release alone", () => {
    const { venture, bet } = freshVenture("Real dispatcher deploy two-step");
    const item = park({ ventureId: venture.id, betId: bet.id, effect: { kind: "deploy", target: "prod" } }, options);
    __resetPresence();
    const executeEffect = createEffectExecutor({ founderActor: "founder", options });

    assert.throws(
      () => decide({ ventureId: venture.id, itemId: item.id, decision: "release" }, { req: founderRequest() }, { executeEffect, isFounderPresent: () => true }, options),
      /second explicit founder authorization/i,
    );
    decide({ ventureId: venture.id, itemId: item.id, decision: "authorize-deploy" }, { req: founderRequest() }, {}, options);
    // No real "deploy" executor branch exists in effect-executors.mjs today (only product-change/
    // message) — the release now clears the wall-level gate and fails one level deeper on the
    // dispatcher's own "no executor wired for this kind" refusal, never on a silent no-op success.
    assert.throws(
      () => decide({ ventureId: venture.id, itemId: item.id, decision: "release" }, { req: founderRequest() }, { executeEffect, isFounderPresent: () => true }, options),
      /No executor is wired/,
    );
  });
});

// ── 4. CROSS-VENTURE ─────────────────────────────────────────────────────────────────────────────

describe("CROSS-VENTURE — every read/decide surface fails closed as 404 across ventures", () => {
  it("wall: venture B's URL cannot decide venture A's item", async () => {
    const { venture: a, bet } = freshVenture("Cross-venture wall A");
    const b = createVenture({ name: "Cross-venture wall B" }, options);
    const item = park({ ventureId: a.id, betId: bet.id, effect: { kind: "message", to: "x@acme.com" } }, options);
    const res = await call(wallRoutes, "POST", `/api/ventures/${b.id}/wall/${item.id}/decide`, { decision: "kill" });
    assert.equal(res.status, 404);
  });

  it("bets: venture B's route cannot read venture A's bet", async () => {
    const { venture: a, bet } = freshVenture("Cross-venture bet A");
    const b = createVenture({ name: "Cross-venture bet B" }, options);
    const res = await call(ventureRoutes, "GET", `/api/ventures/${b.id}/bets/${bet.id}`);
    assert.equal(res.status, 404);
  });

  it("lens: a nonexistent venture 404s rather than returning an empty-but-200 lens", async () => {
    const res = await call(lensRoutes, "GET", "/api/ventures/never-created-venture-xyz/lens");
    assert.equal(res.status, 404);
  });

  it("lens: venture B's placement write cannot be reached through venture A's id, and venture A's own placement never leaks venture B's positions", async () => {
    const { venture: a } = freshVenture("Cross-venture lens A");
    const b = createVenture({ name: "Cross-venture lens B" }, options);
    putPlacement(a.id, { positions: { "a-anchor": { x: 1, y: 2 } }, expectedRevision: 0 }, options);
    const lensB = buildLens(b.id, options);
    assert.deepEqual(lensB.placement.positions, {}, "venture B's lens never shows venture A's placement");
    const lensA = buildLens(a.id, options);
    assert.deepEqual(lensA.placement.positions, { "a-anchor": { x: 1, y: 2 } });
  });

  it("product-change: venture B's route cannot review, apply, or read readiness for venture A's workspace", async () => {
    const repo = fixtureRepo();
    const { venture: a, bet } = freshVenture("Cross-venture product-change A");
    const b = createVenture({ name: "Cross-venture product-change B" }, options);
    const enqueued = forkProductBet({ ventureId: a.id, betId: bet.id, intent: bet.intent }, {
      ...options, repoRoot: repo,
      runQuery: async ({ cwd }) => { fs.writeFileSync(path.join(cwd, "a.txt"), "after\n"); return { text: "done", error: null }; },
    });
    const built = await enqueued.build;
    const { workspaceId, revision } = await stageProductBetForReview(bet, path.basename(built.file), options, { park: async () => ({}) });

    const readiness = await call(productRoutes, "GET", `/api/ventures/${b.id}/product-change-workspaces/${workspaceId}/revisions/${revision.id}/readiness`);
    assert.equal(readiness.status, 404);
    const review = await call(productRoutes, "POST", `/api/ventures/${b.id}/product-change-workspaces/${workspaceId}/revisions/${revision.id}/review`, { decision: "approve" });
    assert.equal(review.status, 404);
    const apply = await call(productRoutes, "POST", `/api/ventures/${b.id}/product-change-workspaces/${workspaceId}/revisions/${revision.id}/apply`, { confirm: true });
    assert.equal(apply.status, 404);

    // venture A's OWN route still works — this isn't a global refusal, only the cross-venture path.
    const ownReadiness = await call(productRoutes, "GET", `/api/ventures/${a.id}/product-change-workspaces/${workspaceId}/revisions/${revision.id}/readiness`);
    assert.equal(ownReadiness.status, 200);
  });

  it("product-change: venture B cannot discard venture A's queued product-change file by naming it under B's route", async () => {
    const repo = fixtureRepo();
    const { venture: a, bet } = freshVenture("Cross-venture discard A");
    const b = createVenture({ name: "Cross-venture discard B" }, options);
    const betB = createBet({ ventureId: b.id, intent: "attacker bet" });
    setVentureDoc(b.id, "bets", betB.id, betB, options);
    const enqueued = forkProductBet({ ventureId: a.id, betId: bet.id, intent: bet.intent }, {
      ...options, repoRoot: repo,
      runQuery: async ({ cwd }) => { fs.writeFileSync(path.join(cwd, "a.txt"), "after\n"); return { text: "done", error: null }; },
    });
    const built = await enqueued.build;
    const file = path.basename(built.file);
    const res = await call(productRoutes, "POST", `/api/ventures/${b.id}/bets/${betB.id}/product-changes/${file}/discard`, { confirm: true });
    assert.equal(res.status, 400, "refused (not found on this bet), never a successful cross-venture discard");
    assert.match(res.body.error, /not found on this bet/i);
  });

  it("heat: reading/writing venture B's heat is independent of venture A's — no cross-read, and both routes 200 on their own venture (heat.mjs has NO venture-existence check at all — see finding below)", async () => {
    const { venture: a } = freshVenture("Cross-venture heat A");
    const b = createVenture({ name: "Cross-venture heat B" }, options);
    await call(heatRoutes, "POST", `/api/ventures/${a.id}/heat`, { heat: "full", dailySpendUsd: 50 });
    const heatA = await call(heatRoutes, "GET", `/api/ventures/${a.id}/heat`);
    const heatB = await call(heatRoutes, "GET", `/api/ventures/${b.id}/heat`);
    assert.equal(heatA.body.heat, "full");
    assert.equal(heatB.body.heat, "off", "venture B never inherits venture A's heat setting");
  });
});

// ── 5. AWAY-HOLD ─────────────────────────────────────────────────────────────────────────────────

describe("AWAY-HOLD — no outward release succeeds while isFounderPresent() is false; inward work is unaffected", () => {
  it("a release attempted while away is refused even from the local founder page with a real executor wired", () => {
    const { venture, bet } = freshVenture("Away-hold release attempt");
    const item = park({ ventureId: venture.id, betId: bet.id, effect: { kind: "message", to: "x@acme.com" } }, options);
    let executed = false;
    assert.throws(
      () => decide(
        { ventureId: venture.id, itemId: item.id, decision: "release" },
        { req: founderRequest() },
        { executeEffect: () => { executed = true; return {}; }, isFounderPresent: () => false },
        options,
      ),
      /founder is away/i,
    );
    assert.equal(executed, false, "the executor never ran while away");
  });

  it("kill and reject are NEVER held by presence — they touch nothing outward", () => {
    const { venture, bet } = freshVenture("Away-hold kill/reject");
    const killItem = park({ ventureId: venture.id, betId: bet.id, purpose: "end-bet", effect: { kind: "kill-proposal", question: "kill this?" } }, options);
    const receipt = decide(
      { ventureId: venture.id, itemId: killItem.id, decision: "kill" },
      { req: founderRequest() },
      { isFounderPresent: () => false },
      options,
    );
    assert.equal(receipt.decision, "kill");

    const bet2 = createBet({ ventureId: venture.id, intent: "reject target" });
    setVentureDoc(venture.id, "bets", bet2.id, bet2, options);
    const rejectItem = park({ ventureId: venture.id, betId: bet2.id, effect: { kind: "message", to: "y@acme.com" } }, options);
    const rejected = decide(
      { ventureId: venture.id, itemId: rejectItem.id, decision: "reject" },
      { req: founderRequest() },
      { isFounderPresent: () => false },
      options,
    );
    assert.equal(rejected.decision, "reject");
  });

  it("inward work (parking, staging, forking) is entirely unaffected by away — only the release itself holds", async () => {
    const { venture, bet } = freshVenture("Away-hold inward unaffected");
    const repo = fixtureRepo();
    const enqueued = forkProductBet({ ventureId: venture.id, betId: bet.id, intent: bet.intent }, {
      ...options, repoRoot: repo,
      runQuery: async ({ cwd }) => { fs.writeFileSync(path.join(cwd, "a.txt"), "after\n"); return { text: "done", error: null }; },
    });
    const built = await enqueued.build;
    assert.equal(built.status, "ready-for-review", "forking/staging a product change never checks presence at all");
    const { workspaceId } = await stageProductBetForReview(bet, path.basename(built.file), options, { park: async (effect) => park(effect, options) });
    assert.ok(getWorkspace(workspaceId, options), "staging succeeded with no presence check whatsoever");
  });

  it("presence itself cannot be forged present by an unauthenticated caller — only the real markPresent (itself founder-gated at the route) or an injected isFounderPresent can flip it", async () => {
    const { markPresent } = await import("../../src/presence.mjs");
    // Direct module access proves the FUNCTION exists and requires an explicit call — the route-level
    // gate on marking present is proven in routes/presence-route-auth.test.mjs; this pins the pure
    // function's own behavior (no hidden bypass parameter that skips the lease semantics).
    __resetPresence();
    const { isFounderPresent } = await import("../../src/presence.mjs");
    assert.equal(isFounderPresent(), false, "fresh boot defaults to away");
    markPresent("test");
    assert.equal(isFounderPresent(), true);
    __resetPresence();
  });
});

// ── 6. KILL AUTHORITY ────────────────────────────────────────────────────────────────────────────

describe("KILL AUTHORITY — only the founder ends a bet; reject never implies a kill", () => {
  it("bet.end() rejects agent, model, and empty actors directly", () => {
    const { bet } = freshVenture("Kill authority direct");
    assert.throws(() => endBet(bet, "agent"), /founder-only/);
    assert.throws(() => endBet(bet, { kind: "model" }), /founder-only/);
    assert.throws(() => endBet(bet, undefined), /founder-only/);
    assert.throws(() => endBet(bet, {}), /founder-only/);
  });

  it("wall.decide({decision:'kill'}) is refused for a missing-request or agent-stamped caller — the bet is NOT ended", () => {
    const { venture, bet } = freshVenture("Kill authority via wall — refused");
    const item = park({ ventureId: venture.id, betId: bet.id, effect: { question: "kill?" } }, options);
    assert.throws(() => decide({ ventureId: venture.id, itemId: item.id, decision: "kill" }, {}, {}, options), /local Drover page/i);
    assert.throws(
      () => decide({ ventureId: venture.id, itemId: item.id, decision: "kill" }, { req: { headers: AGENT_HEADERS } }, {}, options),
      /model or MCP session/i,
    );
    const stillLive = getVentureDoc(venture.id, "bets", bet.id, options);
    assert.equal(stillLive.endedAt, null, "the refused kill never touched the bet");
  });

  it("a 'reject' decision never ends the bet — reject and kill are structurally different acts", () => {
    const { venture, bet } = freshVenture("Reject never kills");
    const item = park({ ventureId: venture.id, betId: bet.id, effect: { kind: "message", to: "x@acme.com" } }, options);
    const receipt = decide({ ventureId: venture.id, itemId: item.id, decision: "reject" }, { req: founderRequest() }, {}, options);
    assert.equal(receipt.decision, "reject");
    const stillLive = getVentureDoc(venture.id, "bets", bet.id, options);
    assert.equal(stillLive.endedAt, null, "reject leaves the bet fully live — no implicit kill");
    assert.equal("learning" in receipt, false, "reject carries no learning field the way a kill receipt does");
  });

  it("a kill with no betId on the wall item is refused rather than silently no-oping", () => {
    const { venture } = freshVenture("Kill with no bet");
    const item = park({ ventureId: venture.id, purpose: "end-bet", effect: { kind: "kill-proposal", question: "just a question, no bet" } }, options);
    assert.throws(
      () => decide({ ventureId: venture.id, itemId: item.id, decision: "kill" }, { req: founderRequest() }, {}, options),
      /no bet to kill/i,
    );
  });
});

// ── 7. FORBIDDEN_TOOL ────────────────────────────────────────────────────────────────────────────

describe("FORBIDDEN_TOOL — the firm MCP tool list carries no approve/send/publish/deploy/decide verb", () => {
  it("firm/mcp-tools.mjs's full tool list matches no forbidden verb by name, and every tool passes filterSafeTools", async () => {
    const { createFirmTools } = await import("../../src/firm/mcp-tools.mjs");
    const { filterSafeTools } = await import("../../src/tool-safety.mjs");
    const tools = createFirmTools({ brainGet: async () => ({}), brainPost: async () => ({}) });
    assert.ok(tools.length > 0, "the firm tool set exists and is non-empty at audit time");
    const forbidden = /approve|send|publish|deploy|charge|decide|release|kill|authorize.?deploy|set.?heat/i;
    for (const tool of tools) {
      assert.doesNotMatch(tool.name, forbidden, `${tool.name} matches a forbidden verb`);
    }
    assert.doesNotThrow(() => filterSafeTools(tools), "every firm tool name clears the safety screen");
  });

  it("the firm tools registered on mcp.mjs's real merged TOOLS/TOOL_MAP carry the same guarantee — this is the actual agent-facing surface, not just the factory's own output", async () => {
    const { TOOLS, TOOL_MAP, FIRM_TOOLS } = await import("../../src/mcp.mjs");
    assert.ok(Array.isArray(FIRM_TOOLS) && FIRM_TOOLS.length > 0, "mcp.mjs exports the firm tools it registered — if this ever goes empty/undefined, the coordination note below applies");
    const forbidden = /approve|send|publish|deploy|charge|decide|release|kill|authorize.?deploy|set.?heat/i;
    for (const tool of FIRM_TOOLS) {
      assert.doesNotMatch(tool.name, forbidden, `${tool.name} matches a forbidden verb on the REAL agent door`);
      assert.equal(TOOL_MAP.get(tool.name), tool, `${tool.name} is reachable through the real dispatch map`);
    }
    for (const tool of TOOLS) {
      assert.doesNotMatch(tool.name, forbidden, `${tool.name} (in the full merged TOOLS list) matches a forbidden verb`);
    }
  });
});

// ── 8. STAGE_OUTWARD DEFAULT-DENY — the critical wall-invisibility bypass, re-verified against the
// real fix (work-loop-tools.mjs's hasOutwardSignal), not just against the builder's own green test ────
//
// The hole this closes: stage_outward used to classify a model-supplied effect via
// classifyCapabilityEffects(effect?.effects ?? effect ?? {}) — trusting a SELF-DECLARED
// effects.external/irreversible/financial claim from the exact caller with every incentive to omit
// it. A genuinely outward effect (to/body/channel) with no effects.external declared, plus
// producedDraft:false, skipped BOTH the wall park and the taste-consult guard in one call, leaving
// zero founder-visible trace. work-loop-tools.mjs's hasOutwardSignal makes classification host-
// structural: a recognized field name, OR a string value anywhere in the effect's whole tree matching
// an email/URL/phone pattern, FORCES founder-wall regardless of what effects.external claims — OR'd
// (never AND'd) with the old host-authored path, so a false claim can only ever ADD a reason to park,
// never remove one.
//
// A FIRST version of this fix (field-name allowlist, one level of object nesting, no arrays) was red-
// teamed and beaten three ways: deeper nesting, an array of recipient objects, and field names the
// list had never seen (phone/sms_to/slack_channel_id/target/recipient_list/post_url/address). The
// CURRENT version closes the class rather than each field — it walks the whole effect tree (objects
// and arrays, to unbounded depth up to a node cap) and adds a value-pattern signal that fires on
// content alone, with no dependency on the host having pre-named the field. This section proves the
// fix closes the ORIGINAL repro exactly, proves the false-suppression and nesting cases, proves a
// genuinely local artifact still skips cleanly (no false-positive regression), and proves the three
// PREVIOUSLY confirmed evasions above now all park (see the describe below, renamed from "known gaps"
// to reflect the flip).
describe("STAGE_OUTWARD DEFAULT-DENY — the original bypass is closed for its own exact shape", () => {
  async function driveStageOutward(effect, { skipTaste = false, ...toolInput } = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stage-outward-reverify-"));
    const driveOptions = { root: dir };
    const { createVenture: cv, setVentureDoc: svd, getVentureDoc: gvd } = await import("../../src/firm/venture-store.mjs");
    const { createBet: createBetFn } = await import("../../src/firm/bet.mjs");
    const { driveTeammate } = await import("../../src/firm/work-loop.mjs");
    const { queue: loadQueue } = await import("../../src/firm/wall.mjs");

    const venture = cv({ name: "stage_outward reverify" }, driveOptions);
    const bet = createBetFn({ ventureId: venture.id, intent: "reverify target" });
    svd(venture.id, "bets", bet.id, bet, driveOptions);

    function fakeClient(turns) {
      let index = 0;
      return { messages: { async create() { const r = turns[index]; index += 1; if (!r) throw new Error("extra turn"); return r; } } };
    }
    const toolCalls = skipTaste
      ? [{ id: "s1", name: "stage_outward", input: { betId: bet.id, effect, ...toolInput } }]
      : [{ id: "t1", name: "get_taste", input: {} }, { id: "s1", name: "stage_outward", input: { betId: bet.id, effect, ...toolInput } }];
    const client = fakeClient([
      { content: toolCalls.map((c) => ({ type: "tool_use", ...c })) },
      { content: [{ type: "text", text: "done" }] },
    ]);
    await driveTeammate({ ventureId: venture.id, teammateRef: "reverify", goal: "x", betId: bet.id, options: driveOptions, deps: { client } });

    const q = loadQueue(venture.id, driveOptions);
    const reloadedBet = gvd(venture.id, "bets", bet.id, driveOptions);
    const classified = reloadedBet.events.filter((e) => e.type === "stage_outward_classified").at(-1);
    const tasteRefused = reloadedBet.events.some((e) => e.type === "tool_failed" && /moat|taste/i.test(e.detail));
    return { parkedCount: q.length, parkedEffect: q[0]?.effect ?? null, classified, tasteRefused, events: reloadedBet.events };
  }

  it("the EXACT original repro (outward effect, no effects.external, producedDraft:false, taste consulted) now parks, traces, and stays taste-gated", async () => {
    const result = await driveStageOutward(
      { kind: "message", channel: "gmail", to: "victim@acme.com", body: "wire funds now" },
      { producedDraft: false },
    );
    assert.equal(result.parkedCount, 1, "the effect is genuinely parked at the wall — the original bypass is closed");
    assert.equal(result.parkedEffect.to, "victim@acme.com");
    assert.ok(result.classified, "a stage_outward_classified event is always left in the bet's trace, parked or not");
    const detail = JSON.parse(result.classified.detail);
    assert.equal(detail.lane, "founder-wall");
    assert.equal(detail.structuralSignal, true);
  });

  it("producedDraft:false no longer waives taste for an effect that reaches the wall — skipping get_taste still refuses", async () => {
    const result = await driveStageOutward(
      { kind: "message", channel: "gmail", to: "victim@acme.com", body: "wire funds now" },
      { producedDraft: false, skipTaste: true },
    );
    assert.equal(result.parkedCount, 0, "refused before parking — taste was never consulted");
    assert.ok(result.tasteRefused, "the taste-consult guard fired");
  });

  it("false-suppression: effects:{external:false} sitting alongside a real outward field cannot cancel the structural signal", async () => {
    const result = await driveStageOutward({ kind: "message", to: "victim@acme.com", body: "hi", effects: { external: false } });
    assert.equal(result.parkedCount, 1, "the false claim never suppresses the park — OR, never AND");
  });

  it("nested one level deep ({message:{to:...}}) is still caught", async () => {
    const result = await driveStageOutward({ kind: "custom", message: { to: "victim@acme.com", body: "hi" } });
    assert.equal(result.parkedCount, 1);
  });

  it("FALSE-POSITIVE CHECK: a genuinely local artifact with none of the outward signal fields still classifies read-only and never parks", async () => {
    const result = await driveStageOutward({ kind: "local-note", summary: "researched the ICP", findings: ["a", "b"] });
    assert.equal(result.parkedCount, 0, "normal local staging is not broken by the fix");
    const detail = JSON.parse(result.classified.detail);
    assert.equal(detail.lane, "read-only");
    assert.equal(detail.structuralSignal, false);
  });
});

// This describe ORIGINALLY documented three confirmed evasions of the first fix (a field-name
// allowlist scanned one level deep, plain objects only): two-level nesting, an array of recipient
// objects, and field names outside the closed list (phone/sms_to/slack_channel_id/target/
// recipient_list/post_url/address). work-loop-tools.mjs's hasOutwardSignal now closes the CLASS
// rather than each field: it walks the effect's whole tree (objects AND arrays, to unbounded depth up
// to a node cap) and adds a value-pattern signal (any email/URL/phone-shaped STRING anywhere in the
// tree forces the wall regardless of key name) alongside the widened field-name list. All three
// evasions below now park — this describe is renamed and its assertions flipped to prove the class is
// closed, not just the original three shapes; a future regression on any of these would show as a
// test flip back to 0.
describe("STAGE_OUTWARD DEFAULT-DENY — the three confirmed evasions are now closed (structural fix, not a per-field patch)", () => {
  async function driveStageOutward(effect) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stage-outward-gap-"));
    const driveOptions = { root: dir };
    const { createVenture: cv, setVentureDoc: svd, getVentureDoc: gvd } = await import("../../src/firm/venture-store.mjs");
    const { createBet: createBetFn } = await import("../../src/firm/bet.mjs");
    const { driveTeammate } = await import("../../src/firm/work-loop.mjs");
    const { queue: loadQueue } = await import("../../src/firm/wall.mjs");
    const venture = cv({ name: "stage_outward gap probe" }, driveOptions);
    const bet = createBetFn({ ventureId: venture.id, intent: "gap probe" });
    svd(venture.id, "bets", bet.id, bet, driveOptions);
    function fakeClient(turns) {
      let index = 0;
      return { messages: { async create() { const r = turns[index]; index += 1; if (!r) throw new Error("extra turn"); return r; } } };
    }
    const client = fakeClient([
      { content: [{ type: "tool_use", id: "t1", name: "get_taste", input: {} }, { type: "tool_use", id: "s1", name: "stage_outward", input: { betId: bet.id, effect } }] },
      { content: [{ type: "text", text: "done" }] },
    ]);
    await driveTeammate({ ventureId: venture.id, teammateRef: "gap", goal: "x", betId: bet.id, options: driveOptions, deps: { client } });
    return loadQueue(venture.id, driveOptions).length;
  }

  it("CLOSED: two levels of nesting now parks — the whole-tree walk is not depth-limited to one level", async () => {
    const parked = await driveStageOutward({ kind: "custom", payload: { message: { to: "victim@acme.com", body: "hi" } } });
    assert.equal(parked, 1, "two-level nesting is caught by the whole-tree walk (and the email value pattern besides)");
  });

  it("CLOSED: an array of recipient objects now parks — the walk traverses array elements exactly like object values", async () => {
    const parked = await driveStageOutward({ kind: "message", batch: [{ to: "victim@acme.com" }] });
    assert.equal(parked, 1, "arrays are no longer invisible to the scan");
  });

  it("CLOSED: field names outside the (now-widened) list still park — via the value-pattern signal, which needs no field name at all", async () => {
    const naturalOutwardNames = [
      { phone: "+15551234567", text: "hi" }, // now ALSO a recognized field name
      { sms_to: "+15551234567", text: "hi" }, // now ALSO a recognized field name
      { slack_channel_id: "C123", text: "hi" }, // now ALSO a recognized field name
      { target: "prod-db", action: "delete" }, // now ALSO a recognized field name
      { recipient_list: ["victim@acme.com"] }, // now ALSO a recognized field name, AND the value is email-shaped
      { post_url: "https://evil.example.com/hook" }, // now ALSO a recognized field name, AND the value is URL-shaped
      { address: "victim@acme.com", body: "hi" }, // now ALSO a recognized field name, AND the value is email-shaped
      { totally_novel_key_nobody_named: "reach me at victim@acme.com" }, // NO recognized field name anywhere —
      // this is the class-closing case: the value pattern alone forces the wall for a channel the host
      // has never seen a field name for, proving this isn't just a longer allowlist.
    ];
    for (const effect of naturalOutwardNames) {
      const parked = await driveStageOutward({ kind: "message", ...effect });
      assert.equal(parked, 1, `${Object.keys(effect)[0]} now parks (field-name and/or value-pattern signal)`);
    }
  });
});

// ── 9. TRUST GRANT NEVER MINTS HOST AUTHORITY (invariant §5.8) ──────────────────────────────────────
//
// A trust grant (grants.mjs, §4A.3) may skip the WAIT for a matching act type — the effort keeps going
// rather than parking on the founder. That is the ONLY thing it does. It must never mint the wall's
// OUTWARD_RELEASE capability, never let a release execute without the founder's own decide() through the
// host-issued path, and never override deploy's second authorization. This section attacks each of those
// as an explicit self-approval attempt through a grant.
describe("TRUST GRANT — a grant skips only the wait, never forging release authority from any door", () => {
  it("a granted act's guard result carries no release capability — hasWallRelease rejects it every way", () => {
    const { venture } = freshVenture("Grant no release capability");
    const grant = recordGrant({ ventureId: venture.id, actType: "message:gmail" }, options);
    const result = grantSkipsWait(venture.id, { kind: "message", channel: "gmail", to: "x@acme.com" }, options);
    assert.equal(result.skip, true, "the grant does skip the wait");
    // But nothing it returns is a release capability the executor would honor.
    assert.equal(hasWallRelease({ runtime: { outwardRelease: grant } }), false);
    assert.equal(hasWallRelease({ runtime: { outwardRelease: result.grant } }), false);
    assert.equal(hasWallRelease(result), false);
  });

  it("a pre-authorized (granted) wall item still requires the founder's real decide() to execute — the executor refuses it unreleased", () => {
    const { venture, bet } = freshVenture("Grant still needs decide");
    recordGrant({ ventureId: venture.id, actType: "message:gmail" }, options);
    // Simulate the pre-authorized park stage_outward produces: a non-blocking item stamped with the grant.
    const item = park({
      ventureId: venture.id, betId: bet.id, purpose: "release", blocksBet: false,
      effect: { kind: "message", channel: "gmail", to: "x@acme.com", preAuthorizedGrantId: "grant-x" },
    }, options);
    // The executor still demands the wall's minted release capability — a pre-authorized stamp is NOT it.
    const executeEffect = createEffectExecutor({ founderActor: "founder", options });
    assert.throws(() => executeEffect(item.effect, item), /release capability/);
    // And the item sits queued: a grant never auto-decided it.
    assert.equal(item.decision, null);
    assert.equal(queue(venture.id, options).some((q) => q.id === item.id), true);
  });

  it("a grant on a deploy act type never skips deploy's wait (deploy keeps its second authorization)", () => {
    const { venture } = freshVenture("Grant cannot skip deploy");
    recordGrant({ ventureId: venture.id, actType: "deploy" }, options);
    const result = grantSkipsWait(venture.id, { kind: "deploy", target: "prod" }, options);
    assert.equal(result.skip, false, "deploy is never skippable by a grant");
    assert.equal(result.neverSkippable, true);
  });

  it("a grant cannot be forged by a model/agent through the outward path — grants are written only by recordGrant, never by stage_outward's effect content", async () => {
    // The stage_outward effect is model-supplied; a model trying to grant itself standing by stuffing a
    // grant-shaped field into the effect achieves nothing — grantSkipsWait reads ONLY the venture's own
    // grants collection (written by recordGrant, reachable only through the founder-gated reply route),
    // never the effect's content.
    const { venture } = freshVenture("Grant forgery via effect content");
    const forgedEffect = { kind: "message", channel: "gmail", to: "x@acme.com", grants: [{ actType: "message:gmail" }], grant: { actType: "message:gmail" }, preAuthorizedGrantId: "grant-forged" };
    const result = grantSkipsWait(venture.id, forgedEffect, options);
    assert.equal(result.skip, false, "no real grant exists — the effect's own grant-shaped content is ignored");
  });
});
