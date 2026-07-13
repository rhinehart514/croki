// outward-release.test.mjs — EXPERIMENT-MACHINE-SPEC rail 1, FIX 1: greenlight can never cross the wall.
//
// THE HOLE (Codex review): greenlight classified staged items by LABEL and stamped internal/prep items
// with the SAME `approved` stamp the outward gate uses. A real network connector (http, slack, gmail) sent
// for ANY approved item via native fetch — so a "patch"/prep item mis-routed into an http/slack execute
// node would actually be POSTed. The label was the only barrier.
//
// THE FIX: outward authority is an EXECUTOR-LEVEL, HOST-ISSUED capability (OUTWARD_RELEASE on
// node.runtime), not an item label. A real sender REFUSES to send unless the run carried the capability,
// which ONLY the founder outward-approval path supplies. Greenlight, ambient runs, and composition never
// carry it — so even a mis-classified approved item sends NOTHING.
//
// What this proves:
//   - An http node runs an approved patch item WITHOUT the capability → nothing is fetched; the item is HELD.
//   - A slack node runs an approved patch item WITHOUT the capability → nothing is posted; the item is HELD.
//   - The SAME item, run WITH the founder outward-release capability → the connector actually sends.
//   - hasOutwardRelease refuses a forged token (only the exact host symbol passes).

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { run as runHttp } from "../src/connectors/execute/http.mjs";
import { run as runSlack } from "../src/connectors/execute/slack.mjs";
import { OUTWARD_RELEASE, hasOutwardRelease } from "../src/graph.mjs";

// A "patch"/prep item that greenlight would have classified internal and stamped approved === true. If a
// composed graph mis-routes it into an http/slack execute node, ONLY the executor-level capability stops it
// from being sent. It carries a gtmActionId so the ONLY thing that could hold it is the missing capability
// (never the attribution refusal).
const approvedPatchItem = () => ({
  kind: "patch",
  protects: "prepare_diff",
  approved: true,
  gtmActionId: "gtm-patch-1",
  draft: "diff --git a/x b/x",
  email: "someone@example.com",
});

describe("FIX 1 — greenlight (no outward-release capability) cannot send via http or slack", () => {
  it("HTTP: an approved patch item on a run WITHOUT the capability sends NOTHING and is HELD", async () => {
    let fetched = 0;
    const node = {
      id: "exe-http",
      category: "execute",
      connector: "http",
      config: {
        endpoint: "https://relay.example/send",
        fetchImpl: async () => { fetched += 1; return { ok: true, status: 202, json: async () => ({ id: "p" }) }; },
      },
      // NO node.runtime.outwardRelease — exactly what greenlight / an ambient run produces.
    };
    const result = await runHttp(node, [approvedPatchItem()]);
    assert.equal(fetched, 0, "the network was never touched — nothing was sent");
    assert.equal(result.ok, false);
    assert.equal(result.blocked, true);
    assert.equal(result.blockedReason, "needs_release");
    assert.equal(result.items[0].executionStatus, "held_without_release");
    assert.ok(!result.items[0].providerMessageId, "no send happened, so no provider id");
  });

  it("SLACK: an approved patch item on a run WITHOUT the capability posts NOTHING and is HELD", async () => {
    let posted = 0;
    const node = {
      id: "exe-slack",
      category: "execute",
      connector: "slack",
      config: {
        webhook: "https://hooks.slack.example/x",
        fetchImpl: async () => { posted += 1; return { ok: true, status: 200 }; },
      },
      // NO capability on runtime.
    };
    const result = await runSlack(node, [approvedPatchItem()]);
    assert.equal(posted, 0, "the Slack webhook was never posted to — nothing was sent");
    assert.equal(result.ok, false);
    assert.equal(result.blocked, true);
    assert.equal(result.blockedReason, "needs_release");
    assert.equal(result.items[0].executionStatus, "held_without_release");
  });

  it("ONLY the founder outward path sends: WITH the capability, http actually fetches", async () => {
    let fetched = 0;
    const node = {
      id: "exe-http",
      category: "execute",
      connector: "http",
      config: {
        endpoint: "https://relay.example/send",
        fetchImpl: async () => { fetched += 1; return { ok: true, status: 202, json: async () => ({ id: "prov-1" }) }; },
      },
      // The host-issued capability the founder outward-approval run threads onto node.runtime.
      runtime: { outwardRelease: OUTWARD_RELEASE },
    };
    const result = await runHttp(node, [approvedPatchItem()]);
    assert.equal(fetched, 1, "with the founder outward-release capability, the send actually leaves");
    assert.equal(result.ok, true);
    assert.equal(result.items[0].executionStatus, "sent");
    assert.equal(result.items[0].providerMessageId, "prov-1");
  });

  it("ONLY the founder outward path sends: WITH the capability, slack actually posts", async () => {
    let posted = 0;
    const node = {
      id: "exe-slack",
      category: "execute",
      connector: "slack",
      config: {
        webhook: "https://hooks.slack.example/x",
        fetchImpl: async () => { posted += 1; return { ok: true, status: 200 }; },
      },
      runtime: { outwardRelease: OUTWARD_RELEASE },
    };
    const result = await runSlack(node, [approvedPatchItem()]);
    assert.equal(posted, 1, "with the founder outward-release capability, the post actually leaves");
    assert.equal(result.ok, true);
    assert.equal(result.items[0].executionStatus, "sent");
  });

  it("the capability is unforgeable: only the exact host-issued symbol passes hasOutwardRelease", () => {
    assert.equal(hasOutwardRelease({ runtime: { outwardRelease: OUTWARD_RELEASE } }), true);
    // A composed/forged value — a string, a look-alike symbol, a truthy — all fail closed.
    assert.equal(hasOutwardRelease({ runtime: { outwardRelease: "outward-release" } }), false);
    assert.equal(hasOutwardRelease({ runtime: { outwardRelease: Symbol("gtm.outward-release-capability") } }), false);
    assert.equal(hasOutwardRelease({ runtime: { outwardRelease: true } }), false);
    assert.equal(hasOutwardRelease({ runtime: {} }), false);
    assert.equal(hasOutwardRelease({}), false);
    assert.equal(hasOutwardRelease(null), false);
  });
});
