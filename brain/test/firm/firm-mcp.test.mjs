// firm-mcp.test.mjs — F9 acceptance: the firm's agent-facing MCP door (firm/mcp-tools.mjs, wired
// additively into mcp.mjs's TOOLS/TOOL_MAP).
//
// Two layers proven:
//   1. Unit: createFirmTools' own handlers call the right brainGet/brainPost path with the right args
//      (a fake brainGet/brainPost — no network, no real routes — the same isolation mcp.test.mjs's own
//      "routes all six verbs" test uses via a faked global.fetch).
//   2. Real end to end: the actual firm HTTP routes (venture-routes.mjs, work-routes.mjs,
//      product-routes.mjs, heat-routes.mjs, routes.mjs), called with a synthetic req/res exactly like
//      wall-routes.test.mjs's own `call()` harness — no doubles for venture-store/wall/heat. This is
//      what proves an agent-stamped request is refused by the REAL founder-authority guard, not a mock
//      of it: a hand-crafted brainPost equivalent carrying x-gtm-actor: agent hits wall.decide()'s and
//      heat.setHeatSettings()'s own authorizeFounderWriteForRequest and is rejected for real.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { describe, it } from "node:test";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "firm-mcp-"));
process.env.GTM_IDE_HOME = root;
process.env.GTM_IDE_PERSISTENCE = "json";

const { createFirmTools } = await import("../../src/firm/mcp-tools.mjs");
const { filterSafeTools } = await import("../../src/tool-safety.mjs");
const { TOOLS, TOOL_MAP, FIRM_TOOLS } = await import("../../src/mcp.mjs");

const { default: ventureRoutes } = await import("../../src/firm/venture-routes.mjs");
const { default: workRoutes } = await import("../../src/firm/work-routes.mjs");
const { default: productRoutes } = await import("../../src/firm/product-routes.mjs");
const { default: heatRoutes } = await import("../../src/firm/heat-routes.mjs");
const { default: wallRoutes } = await import("../../src/firm/routes.mjs");

const { createVenture, setVentureDoc } = await import("../../src/firm/venture-store.mjs");
const { createBet } = await import("../../src/firm/bet.mjs");
const { park } = await import("../../src/firm/wall.mjs");

const options = { root };

function setup() {
  const venture = createVenture({ name: "MCP door acceptance" }, options);
  const bet = createBet({ ventureId: venture.id, intent: "cold email to ops leads", teammateRef: "outreach-writer" });
  setVentureDoc(venture.id, "bets", bet.id, bet, options);
  return { venture, bet };
}

// A synthetic req/res call against a route handler — no real HTTP server, no port. Mirrors
// wall-routes.test.mjs's own call() harness exactly, so this test stands on the SAME convention every
// other firm route test already proves out.
async function call(handler, method, pathname, body = {}, headers = {}) {
  const req = Readable.from([JSON.stringify(body)]);
  req.method = method;
  req.headers = { "content-type": "application/json", ...headers };
  let status = 0;
  let raw = "";
  const res = { writeHead(next) { status = next; }, setHeader() {}, end(next) { raw += next ?? ""; } };
  const handled = await handler({ req, res, url: new URL(pathname, "http://local") });
  return { handled, status, body: raw ? JSON.parse(raw) : null };
}

// The agent stamp mcp.mjs's real brainPost sets on EVERY request — reproduced here by hand exactly as
// the task asks ("even hand-crafted"), so the test proves the route's own guard, not brainPost's stamp.
const AGENT_HEADERS = { "x-gtm-actor": "agent" };

describe("firm-mcp — each read tool returns venture-scoped data (unit, faked brainGet/brainPost)", () => {
  it("list_ventures, get_venture, get_venture_lens, list_bets, get_bet, read_wall all call the right path", async () => {
    const calls = [];
    const fakeBrainGet = async (p) => { calls.push(["GET", p]); return { ok: true, path: p }; };
    const fakeBrainPost = async (p, body) => { calls.push(["POST", p, body]); return { ok: true, path: p, body }; };
    const tools = createFirmTools({ brainGet: fakeBrainGet, brainPost: fakeBrainPost });
    const byName = new Map(tools.map((t) => [t.name, t]));

    await byName.get("list_ventures").handler({});
    await byName.get("get_venture").handler({ ventureId: "v1" });
    await byName.get("get_venture_lens").handler({ ventureId: "v1" });
    await byName.get("list_bets").handler({ ventureId: "v1" });
    await byName.get("get_bet").handler({ ventureId: "v1", betId: "b1" });
    await byName.get("read_wall").handler({ ventureId: "v1" });

    assert.deepEqual(calls, [
      ["GET", "/api/ventures"],
      ["GET", "/api/ventures/v1"],
      ["GET", "/api/ventures/v1/lens"],
      ["GET", "/api/ventures/v1/bets"],
      ["GET", "/api/ventures/v1/bets/b1"],
      ["GET", "/api/ventures/v1/wall"],
    ]);
  });
});

describe("firm-mcp — each read tool returns venture-scoped data (real routes, no doubles)", () => {
  it("list_ventures/get_venture/list_bets/get_bet/read_wall hit the real venture-scoped stores", async () => {
    const { venture, bet } = setup();
    const other = createVenture({ name: "Other venture" }, options);

    const ventures = await call(ventureRoutes, "GET", "/api/ventures");
    assert.equal(ventures.status, 200);
    assert.ok(ventures.body.ventures.some((v) => v.id === venture.id));

    const oneVenture = await call(ventureRoutes, "GET", `/api/ventures/${venture.id}`);
    assert.equal(oneVenture.status, 200);
    assert.equal(oneVenture.body.venture.id, venture.id);

    const bets = await call(ventureRoutes, "GET", `/api/ventures/${venture.id}/bets`);
    assert.equal(bets.status, 200);
    assert.equal(bets.body.bets.length, 1);
    assert.equal(bets.body.bets[0].id, bet.id);

    const otherBets = await call(ventureRoutes, "GET", `/api/ventures/${other.id}/bets`);
    assert.equal(otherBets.body.bets.length, 0, "venture B's bet list never bleeds venture A's bet");

    const oneBet = await call(ventureRoutes, "GET", `/api/ventures/${venture.id}/bets/${bet.id}`);
    assert.equal(oneBet.status, 200);
    assert.equal(oneBet.body.bet.intent, "cold email to ops leads");

    park({ ventureId: venture.id, betId: bet.id, effect: { kind: "message", to: "ada@acme.com" } }, options);
    const wall = await call(wallRoutes, "GET", `/api/ventures/${venture.id}/wall`);
    assert.equal(wall.status, 200);
    assert.equal(wall.body.queue.length, 1);
  });
});

describe("firm-mcp — fork_product_bet stages without any founder authority", () => {
  // Calling the fork ROUTE for real would spawn feature-builder.mjs's real background build chain (no
  // runQuery injection point exists at the HTTP layer — only forkProductBet() itself accepts one, the
  // same seam effect-executors.test.mjs's own fork test uses directly). Two proofs instead, neither of
  // which spawns a real build: (1) a static source check — the anti-cage doctrine already used
  // elsewhere in this tree (see anti-cage.test.mjs) — that the fork branch of product-routes.mjs never
  // calls authorizeFounderWriteForRequest, unlike every review/apply/revert/discard branch below it in
  // the same file; (2) a direct call to forkProductBet() itself (no HTTP, no founder-authority guard in
  // its own signature) with a fake runQuery, proving it genuinely stages real isolated work.
  it("product-routes.mjs's fork branch never calls authorizeFounderWriteForRequest — every review/apply/revert/discard branch does", () => {
    const src = fs.readFileSync(path.join(import.meta.dirname, "../../src/firm/product-routes.mjs"), "utf8");
    const stripped = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    const forkBlockMatch = stripped.match(/forkMatch[\s\S]*?return true;\s*\}/);
    assert.ok(forkBlockMatch, "the fork route block exists");
    assert.ok(!forkBlockMatch[0].includes("authorizeFounderWriteForRequest"), "the fork branch is never founder-gated");
    for (const founderGated of ["reviewMatch", "applyMatch", "revertMatch", "discardMatch"]) {
      const block = stripped.match(new RegExp(`${founderGated}[\\s\\S]*?return true;\\s*\\}`));
      assert.ok(block[0].includes("authorizeFounderWriteForRequest"), `${founderGated}'s branch stays founder-gated`);
    }
  });

  it("forkProductBet() itself (no HTTP layer) genuinely stages an isolated local diff, with a fake runQuery, no founder authority anywhere in its call", async () => {
    const { venture, bet } = setup();
    const { forkProductBet } = await import("../../src/firm/product-change.mjs");
    const enqueued = forkProductBet({ ventureId: venture.id, betId: bet.id, intent: "try a code diff for the pricing page" }, {
      ...options,
      queueDir: path.join(root, "dogfood-queue"),
      runQuery: async ({ cwd }) => { fs.writeFileSync(path.join(cwd, "firm-mcp-fork-proof.txt"), "staged\n"); return { text: "done", error: null }; },
    });
    const built = await enqueued.build;
    assert.equal(built.status, "ready-for-review", "a real isolated worktree diff was staged, no founder act anywhere in this call");
  });
});

describe("firm-mcp — an attempted decide/release/kill/set_heat through the MCP door's own agent stamp is rejected", () => {
  it("a hand-crafted agent-stamped wall decide POST is refused by the real founder-authority guard", async () => {
    const { venture, bet } = setup();
    const item = park({ ventureId: venture.id, betId: bet.id, effect: { kind: "message", to: "x@acme.com" } }, options);
    const res = await call(
      wallRoutes, "POST",
      `/api/ventures/${venture.id}/wall/${item.id}/decide`,
      { decision: "kill" },
      AGENT_HEADERS,
    );
    assert.equal(res.status, 403);
  });

  it("a hand-crafted agent-stamped heat POST (set_heat) is refused by the real founder-authority guard", async () => {
    const { venture } = setup();
    const res = await call(
      heatRoutes, "POST",
      `/api/ventures/${venture.id}/heat`,
      { heat: "full", dailySpendUsd: 999 },
      AGENT_HEADERS,
    );
    assert.equal(res.status, 403);
  });

  it("no tool in the firm's own tool set is named decide/release/kill/authorize_deploy/set_heat", () => {
    const forbiddenNames = /^(decide|release|kill|authorize.?deploy|set.?heat)$/i;
    for (const tool of FIRM_TOOLS) {
      assert.ok(!forbiddenNames.test(tool.name), `${tool.name} must not exist on the agent door`);
    }
  });
});

describe("firm-mcp — FORBIDDEN_TOOL still screens the whole merged tool list", () => {
  it("filterSafeTools accepts every Firm tool — none matches an outbound/approval verb", () => {
    assert.doesNotThrow(() => filterSafeTools(TOOLS), "every advertised tool name is safe to expose");
    // Confirms specifically that the firm's own additions carry no approve/send/publish/deploy/charge
    // name, mirroring mcp.test.mjs's own "keeps outbound and approval verbs off the preferred set" check.
    const firmNames = FIRM_TOOLS.map((t) => t.name);
    assert.ok(firmNames.every((name) => !/approve|send|publish|deploy|charge/i.test(name)));
  });

  it("TOOL_MAP dispatches every Firm tool name", () => {
    for (const tool of FIRM_TOOLS) {
      assert.equal(TOOL_MAP.get(tool.name), tool, `${tool.name} dispatches to the firm's own handler`);
    }
  });
});
