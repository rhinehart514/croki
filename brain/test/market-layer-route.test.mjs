// The per-layer market-research door (server.mjs): POST .../market-layer researches the NEXT buyer
// facet given the kinds already settled and returns a spread of candidates the founder chooses
// between. The point this proves through the REAL HTTP wiring: the route returns candidates WITHOUT
// persisting any of them — the founder's pick is what later reaches the store, not this preview. The
// next kind is derived from the settled upstream picks (a hint, not a fixed pipeline).
//
// The wall is untouched — researching the buyer side reads the outside world; it never sends.

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Isolate the durable home BEFORE importing the server (and the stores), so route reads/writes and
// test seeds share one temp dir. No live Claude is connected in tests, so the route falls back to the
// module's honest-blank per-layer default — which returns no candidates and, by design, persists none.
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-market-layer-routes-"));
process.env.GTM_IDE_HOME = HOME;
process.env.HOST = "127.0.0.1";
// Force the honest-blank path deterministically: with no operator runtime selectable, the route uses
// the module's blank per-layer default instead of firing a real (slow, non-deterministic, network)
// Claude research call. The no-persist contract this test proves holds identically either way.
process.env.GTM_IDE_OPERATOR_RUNTIME = "none";

async function freePort() {
  const probe = net.createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

const PORT = await freePort();
process.env.PORT = String(PORT);

const { marketObjectStore } = await import("../src/gtm-store.mjs");
const { createProject } = await import("../src/project-store.mjs");
const { server } = await import("../src/server.mjs");

if (!server.listening) await once(server, "listening");

const base = `http://127.0.0.1:${PORT}`;

after(() => {
  server.close();
  fs.rmSync(HOME, { recursive: true, force: true });
});

describe("per-layer market research route — the preview door that persists nothing", () => {
  it("derives the next kind from the settled upstream and returns candidates without persisting", async () => {
    const { project } = createProject({ name: "Market Layer Route" });
    const projectId = project.id;
    // Seed the founder's already-settled picks: buyer + pain. The next hinted facet is "job".
    marketObjectStore.create({ projectId, kind: "buyer", statement: "local business owners", evidence: [{ claim: "repo ICP", source: "AGENTS.md:1", solidity: "observed" }], solidity: "observed" }, { projectId });
    marketObjectStore.create({ projectId, kind: "pain", statement: "their website rots after launch", evidence: [{ claim: "forum", source: "https://x/thread", solidity: "researched" }], solidity: "researched" }, { projectId });
    const before = marketObjectStore.list({ projectId }).length;
    assert.equal(before, 2);

    const res = await fetch(`${base}/api/projects/${projectId}/market-layer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 200);
    const body = await res.json();

    // The next kind is derived from the settled picture — a hint off the canonical order, not a fixed pipeline.
    assert.equal(body.kind, "job", "the next facet is the first unfilled hinted kind given buyer + pain");
    assert.ok(Array.isArray(body.candidates), "the route returns a candidate array");
    assert.equal(body.count, body.candidates.length);
    assert.equal(body.meta.connected, false, "no live Claude in tests → honest-blank default");

    // The whole point: the preview persisted NOTHING. The store is untouched — the founder's pick,
    // not this call, is what would later reach the store through the market-research persist path.
    assert.equal(marketObjectStore.list({ projectId }).length, before, "the preview route persists no candidates");
  });

  it("honors an explicitly named kind to steer off the hint order", async () => {
    const { project } = createProject({ name: "Market Layer Route Steer" });
    const projectId = project.id;
    const res = await fetch(`${base}/api/projects/${projectId}/market-layer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "channel", upstream: [{ kind: "buyer", statement: "b" }] }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.kind, "channel", "a named kind steers the layer, on or off the hint order");
    assert.equal(marketObjectStore.list({ projectId }).length, 0, "still persists nothing");
  });
});
