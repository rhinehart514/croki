import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { isRoutingDecision, routeInput } from "../src/input-router.mjs";

const channels = [
  { id: "ch-github", name: "GitHub signal scout", objective: "watch the repo for stars and commits", kind: "commit", enabled: true },
  { id: "ch-outbound", name: "Founder outbound", objective: "personalized cold drafts to design-tool founders", kind: "outbound", enabled: true },
  { id: "ch-disabled", name: "Old waitlist", objective: "signup nurture", kind: "signup", enabled: false },
];

describe("input-router: pure classifier+decider", () => {
  it("routes an input to a channel whose intake matches by exact kind", () => {
    const decision = routeInput({ kind: "commit", source: "github" }, channels);
    assert.equal(decision.route, "flow");
    assert.equal(decision.channelId, "ch-github");
    assert.ok(isRoutingDecision(decision));
    assert.match(decision.reason, /matches channel/);
  });

  it("routes by keyword overlap when no exact kind equals", () => {
    // No channel has kind "demo-visit", but the source token "outbound" overlaps the outbound channel's
    // declared intake, so the deterministic match still binds it there.
    const decision = routeInput({ kind: "demo-visit", source: "outbound-page" }, channels);
    assert.equal(decision.route, "flow");
    assert.equal(decision.channelId, "ch-outbound");
  });

  it("never routes to a disabled channel", () => {
    const decision = routeInput({ kind: "signup", source: "landing" }, channels);
    // ch-disabled is the only kind:signup channel but it is disabled, so no flow match.
    assert.notEqual(decision.route, "flow");
  });

  it("ignores an ambiguous input rather than starting a run (no scorer wired)", () => {
    const decision = routeInput({ kind: "weather", source: "noaa" }, channels);
    assert.equal(decision.route, "ignore");
    assert.match(decision.reason, /No channel fits/);
  });

  it("ignores noise with no kind or no source", () => {
    assert.equal(routeInput({ source: "github" }, channels).route, "ignore");
    assert.equal(routeInput({ kind: "commit" }, channels).route, "ignore");
    assert.equal(routeInput({}, channels).route, "ignore");
    assert.match(routeInput({ source: "github" }, channels).reason, /no kind/);
  });

  it("the blank default scorer refuses to wake — an unmatched input ignores, never wakes", () => {
    const decision = routeInput({ kind: "tweet", source: "twitter" }, []);
    assert.equal(decision.route, "ignore");
  });

  it("wakes a standing brief only when an injected scorer warrants it AND supplies a brief", () => {
    const wakeScorer = (input) => ({
      warrant: true,
      brief: `A competitor shipped (${input.kind}); draft a positioning response.`,
      reason: "competitor-launch signal",
    });
    const decision = routeInput({ kind: "competitor-launch", source: "rss" }, [], { wakeScorer });
    assert.equal(decision.route, "ambient_wake");
    assert.match(decision.brief, /draft a positioning response/);
    assert.equal(decision.reason, "competitor-launch signal");
    assert.ok(isRoutingDecision(decision));
  });

  it("ignores when the scorer warrants a wake but supplies no brief — never runs blind", () => {
    const wakeScorer = () => ({ warrant: true });
    const decision = routeInput({ kind: "competitor-launch", source: "rss" }, [], { wakeScorer });
    assert.equal(decision.route, "ignore");
    assert.match(decision.reason, /no brief/);
  });

  it("prefers a channel match over a wake — the scorer is only consulted when no channel fits", () => {
    const wakeScorer = () => ({ warrant: true, brief: "should not be used" });
    const decision = routeInput({ kind: "commit", source: "github" }, channels, { wakeScorer });
    assert.equal(decision.route, "flow");
    assert.equal(decision.channelId, "ch-github");
  });

  it("is pure — repeated calls with the same args yield the same decision and no throw", () => {
    const a = routeInput({ kind: "commit", source: "github" }, channels);
    const b = routeInput({ kind: "commit", source: "github" }, channels);
    assert.deepEqual(a, b);
  });

  it("the router source imports no send/execute/compose/store path (ambient cannot relax the wall)", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.join(here, "../src/input-router.mjs"), "utf8");
    const imports = [...src.matchAll(/import\s+.*?from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    // A pure decider must stand alone: no store, composer, graph/run, connector, or server import.
    const forbidden = /(store|composer|graph|connector|server|operator|execute|send|flow|workflow|runtime)/i;
    const offenders = imports.filter((spec) => forbidden.test(spec));
    assert.deepEqual(offenders, [], `input-router must not import action paths, found: ${offenders.join(", ")}`);
  });
});
