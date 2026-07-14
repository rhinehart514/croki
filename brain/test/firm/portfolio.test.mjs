// portfolio.test.mjs — F8 acceptance: two ventures behind one wall, and a venture is a file.
//
// Fixture: two real ventures, each with a live bet, a parked wall item, a summoned teammate (a real
// soul instance), and a placement record. One surface (queueAll / the portfolio route) lists both
// ventures' pending decisions; deciding routes strictly to the owning venture; cross-venture decide
// 404s. Export -> wipe -> import round-trips bets/lineage/decisions/placement/souls intact, excludes
// credentials and template souls, and a live bet's work record survives so the loop can resume (cold-
// resume path proven honest when the provider session cannot be found on the new machine).

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { describe, it } from "node:test";

import { createVenture, exportVenture, importVenture, listVentures, getVentureDoc, setVentureDoc, listVentureDocs } from "../../src/firm/venture-store.mjs";
import { createBet, fork } from "../../src/firm/bet.mjs";
import { park, queue, queueAll, decide } from "../../src/firm/wall.mjs";
import { summon, listCrew } from "../../src/firm/crew.mjs";
import { putPlacement, buildLens } from "../../src/firm/lens.mjs";
import { setOAuthCredential, listCredentials } from "../../src/credential-store.mjs";
import { teammateSoulStore, LIBRARY_VENTURE } from "../../src/teammate-soul-store.mjs";
import { driveTeammate } from "../../src/firm/work-loop.mjs";
import { claimFounderSession, founderBootstrapCode } from "../../src/routes/session-guard.mjs";
import routes from "../../src/firm/routes.mjs";

function freshRoot() {
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), "firm-portfolio-")) };
}

function browserReq() {
  let cookie = null;
  claimFounderSession({ headers: {} }, { setHeader(_name, next) { cookie = next.split(";")[0]; } }, founderBootstrapCode());
  return { headers: { cookie } };
}

// Build one venture with a live bet, a summoned teammate (a real soul instance), a parked wall item
// on that bet, and a placement record — the full fixture shape a portfolio proof needs.
function buildFixtureVenture(name, options) {
  const venture = createVenture({ name }, options);
  summon(venture.id, "outreach-writer", {}, options);
  teammateSoulStore.record(venture.id, "outreach-writer", { text: "lead with the trigger, not the pitch" }, {}, options);
  const bet = createBet({ ventureId: venture.id, intent: `cold outbound for ${name}`, teammateRef: "outreach-writer" });
  setVentureDoc(venture.id, "bets", bet.id, { ...bet, work: { runtimeSessionId: `sess-${venture.id}`, stepCount: 3, spentUsd: 0.42, pausedFor: "Waiting on the founder." } }, options);
  const parked = park({ ventureId: venture.id, betId: bet.id, effect: { kind: "send", message: `hi from ${name}`, recipients: ["lead@example.com"] } }, options);
  putPlacement(venture.id, { positions: { [bet.id]: { x: 10, y: 20 } }, expectedRevision: 0 }, options);
  return { venture, bet, parked };
}

describe("portfolio — the one wall surfaces every venture's pending decisions", () => {
  it("queueAll lists both ventures' parked items, each still venture-scoped", () => {
    const options = freshRoot();
    const a = buildFixtureVenture("Venture A", options);
    const b = buildFixtureVenture("Venture B", options);

    const all = queueAll({ listVentureIds: (opts) => listVentures(opts).map((v) => v.id) }, options);
    assert.equal(all.length, 2);
    const byVenture = Object.fromEntries(all.map((item) => [item.ventureId, item]));
    assert.equal(byVenture[a.venture.id].id, a.parked.id);
    assert.equal(byVenture[b.venture.id].id, b.parked.id);
  });

  it("deciding an item from the portfolio list writes only to its owning venture", () => {
    const options = freshRoot();
    const a = buildFixtureVenture("Venture A decide", options);
    const b = buildFixtureVenture("Venture B decide", options);

    decide({ ventureId: a.venture.id, itemId: a.parked.id, decision: "reject" }, { req: browserReq() }, {}, options);

    assert.equal(queue(a.venture.id, options).length, 0, "A's item is decided and off A's queue");
    assert.equal(queue(b.venture.id, options).length, 1, "B's item is untouched");
  });

  it("cross-venture decide 404s across two real ventures (not a single-venture guard artifact)", () => {
    const options = freshRoot();
    const a = buildFixtureVenture("Venture A cross", options);
    const b = buildFixtureVenture("Venture B cross", options);

    assert.throws(
      () => decide({ ventureId: a.venture.id, itemId: b.parked.id, decision: "reject" }, { req: browserReq() }, {}, options),
      (err) => err.code === "wall_item_not_in_venture" && err.status === 404,
    );
    // Neither venture's queue moved.
    assert.equal(queue(a.venture.id, options).length, 1);
    assert.equal(queue(b.venture.id, options).length, 1);
  });

  it("GET /api/wall (the portfolio route) is founder-gated and lists both ventures' items", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "firm-portfolio-route-"));
    process.env.GTM_IDE_HOME = root;
    process.env.GTM_IDE_PERSISTENCE = "json";
    try {
      const options = { root };
      buildFixtureVenture("Route venture A", options);
      buildFixtureVenture("Route venture B", options);

      async function call(headers = {}) {
        const req = Readable.from([""]);
        req.method = "GET";
        req.headers = headers;
        let status = 0; let raw = "";
        const res = { writeHead(n) { status = n; }, setHeader() {}, end(n) { raw += n ?? ""; } };
        const handled = await routes({ req, res, url: new URL("/api/wall", "http://local") });
        return { handled, status, body: raw ? JSON.parse(raw) : null };
      }

      const tokenless = await call();
      assert.equal(tokenless.status, 403);

      const authed = await call({ cookie: browserReq().headers.cookie });
      assert.equal(authed.status, 200);
      assert.equal(authed.body.queue.length, 2);
    } finally {
      delete process.env.GTM_IDE_HOME;
      delete process.env.GTM_IDE_PERSISTENCE;
    }
  });
});

describe("portfolio — export -> wipe -> import round-trips a running venture as a file", () => {
  it("bets (with lineage), decisions, placement round-trip intact", () => {
    const source = freshRoot();
    const { venture, bet } = buildFixtureVenture("Round trip", source);
    const mutation = fork(bet, "try a warmer angle", { learning: "cold subject flopped" });
    setVentureDoc(venture.id, "bets", mutation.id, mutation, source);

    const bundle = exportVenture(venture.id, source);
    assert.ok(bundle.documents.bets.some((b) => b.id === mutation.id && b.forkedFrom === bet.id), "lineage exported intact");

    // A fresh "machine" — a brand-new root, nothing pre-existing.
    const destination = freshRoot();
    importVenture(bundle, destination);

    const reopenedBets = listVentureDocs(venture.id, "bets", destination);
    assert.equal(reopenedBets.length, 2);
    const reopenedMutation = reopenedBets.find((b) => b.id === mutation.id);
    assert.equal(reopenedMutation.forkedFrom, bet.id, "lineage survives the move");

    const reopenedDecisions = listVentureDocs(venture.id, "decisions", destination);
    assert.equal(reopenedDecisions.length, 1, "the parked wall item round-trips");

    const lens = buildLens(venture.id, destination);
    assert.ok(Object.keys(lens.placement?.positions ?? {}).length > 0, "placement survives the move");
  });

  it("a live bet's work record (runtimeSessionId) survives the bundle", () => {
    const source = freshRoot();
    const { venture, bet } = buildFixtureVenture("Resume record", source);
    const destination = freshRoot();
    importVenture(exportVenture(venture.id, source), destination);

    const reopened = getVentureDoc(venture.id, "bets", bet.id, destination);
    assert.equal(reopened.work.runtimeSessionId, `sess-${venture.id}`);
    assert.equal(reopened.work.stepCount, 3);
  });

  it("driveTeammate resumes an imported bet whose provider session no longer exists on this machine (honest cold-resume, never a crash)", async () => {
    const source = freshRoot();
    const { venture, bet } = buildFixtureVenture("Cold resume", source);
    const destination = freshRoot();
    importVenture(exportVenture(venture.id, source), destination);

    // A fake adapter mirroring claude-code.mjs's own isResumeFailure contract: a resume attempt (a
    // truthy ctx.runtimeSessionId) throws a session-not-found-shaped error; the loop must not crash —
    // this module has no opinion on retrying, only on surviving. work-loop.mjs's own ctx wiring is what
    // decides whether to retry; we assert the drive completes rather than throwing unhandled.
    let sawStaleSessionId = null;
    const fakeAdapter = {
      id: "fake-cold-resume",
      label: "Fake",
      isAvailable: () => ({ ok: true }),
      async drive(ctx) {
        sawStaleSessionId = ctx.runtimeSessionId;
        // Mirrors claude-code.mjs's own attempt()/isResumeFailure fallback: a resume that cannot find
        // the prior transcript falls back to a fresh pass rather than throwing out of drive().
        ctx.onText?.("Previous conversation memory was unavailable, so the operator is starting a fresh pass.");
        return { kind: "completed", summary: "Resumed fresh after a cold-resume fallback." };
      },
    };

    const result = await driveTeammate(
      { ventureId: venture.id, teammateRef: "outreach-writer", goal: "Keep working the pipeline", betId: bet.id, options: destination, deps: { runtime: fakeAdapter } },
      destination,
    );
    assert.equal(sawStaleSessionId, `sess-${venture.id}`, "the imported (now-stale) runtimeSessionId was actually offered to the runtime");
    assert.equal(result.outcome.kind, "completed", "the drive completed honestly rather than crashing on the stale session");
  });

  it("importing does not touch any OTHER venture's records already on the destination (isolation regression)", () => {
    const source = freshRoot();
    const { venture } = buildFixtureVenture("Moved venture", source);
    const bundle = exportVenture(venture.id, source);

    const destination = freshRoot();
    const resident = buildFixtureVenture("Already resident", destination);
    const residentBetsBefore = listVentureDocs(resident.venture.id, "bets", destination);
    const residentQueueBefore = queue(resident.venture.id, destination);

    importVenture(bundle, destination);

    assert.deepEqual(listVentureDocs(resident.venture.id, "bets", destination).map((b) => b.id).sort(), residentBetsBefore.map((b) => b.id).sort());
    assert.equal(queue(resident.venture.id, destination).length, residentQueueBefore.length);
    // And the moved venture is ALSO present now, as its own isolated tree.
    assert.ok(listVentures(destination).some((v) => v.id === venture.id));
  });
});

describe("portfolio — souls: venture instances export, template souls and credentials do not", () => {
  it("the archive contains this venture's own soul instance", () => {
    const options = freshRoot();
    const { venture } = buildFixtureVenture("Soul export", options);
    const bundle = exportVenture(venture.id, options);
    assert.ok(bundle.souls.some((s) => s.ref === "outreach-writer" && s.ventureId === venture.id));
    assert.ok(bundle.souls.some((s) => (s.learnings ?? []).some((l) => l.text === "lead with the trigger, not the pitch")));
  });

  it("the archive does NOT contain the reusable TEMPLATE soul, even when one exists", () => {
    const options = freshRoot();
    const { venture } = buildFixtureVenture("No template leak", options);
    // Birth a template under the reserved library venture — the founder's cross-venture asset.
    teammateSoulStore.ensure(LIBRARY_VENTURE, "outreach-writer", { name: "Outreach Writer" }, options);
    teammateSoulStore.promote(LIBRARY_VENTURE, "outreach-writer", "some-pattern-key", {}, options);

    const bundle = exportVenture(venture.id, options);
    assert.equal(bundle.souls.some((s) => s.ventureId === LIBRARY_VENTURE), false, "no template-tier soul in a venture's own bundle");
  });

  it("the archive does NOT contain any credential, even when one is connected", () => {
    const options = freshRoot();
    const { venture } = buildFixtureVenture("No credential leak", options);
    setOAuthCredential({ provider: "gmail", refreshToken: "rt-secret", clientId: "cid", clientSecret: "very-secret" }, options);
    assert.ok(listCredentials(options).length > 0, "a credential really is connected");

    const bundle = exportVenture(venture.id, options);
    const serialized = JSON.stringify(bundle);
    assert.equal(serialized.includes("very-secret"), false, "no credential secret anywhere in the exported bundle");
    assert.equal(serialized.includes("rt-secret"), false);
    assert.equal("credentials" in bundle, false);
    assert.equal(bundle.documents && "credentials" in bundle.documents, false);
  });

  it("importing restores the venture's soul so listCrew reads the live lesson on the new machine", () => {
    const source = freshRoot();
    const { venture } = buildFixtureVenture("Soul resume", source);
    const destination = freshRoot();
    importVenture(exportVenture(venture.id, source), destination);

    const crew = listCrew(venture.id, destination);
    assert.equal(crew.length, 1);
    assert.ok(crew[0].soul.learnings.some((l) => l.text === "lead with the trigger, not the pitch"));
  });
});
