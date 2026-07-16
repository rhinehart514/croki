// anti-cage.test.mjs (firm) — static guards for the firm core, pinned to FIRM-SPEC.md's enduring
// minimality and authority invariants. The Living Venture Atlas deliberately adds one semantic
// architecture document; these guards prevent that document from regrowing the retired object graph.
//
//   GUARD A — brain/src/firm/ imports old code only through the keep-list. No file here may import a
//     module named in FIRM-SPEC.md §Deletion ledger "Dies" — those are the object-graph, executable-
//     graph, session-machine, woven-projection, board/plan, goal-authority, and composition/ideation
//     systems this rebuild deletes. Port, never reference.
//
//   GUARD B — the bet record carries no kind/status/stage field. A bet's position is a pure function
//     of the loop (positionOf), never a stored lifecycle. Storing one is the exact cage this rebuild
//     exists to remove one layer up from the old object-graph/session machinery.
//
//   GUARD C — teammate records carry no role/seniority/hierarchy/manager field. Teammates are souls
//     and lessons, not the venture's structural model.
//
//   GUARD D — architecture stays one document with exactly the five intentional semantic roles.
//     It has no executable edge taxonomy, campaign lifecycle, release duplicate, or placement truth.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const FIRM_SRC = path.resolve(import.meta.dirname, "../../src/firm");

function readFirmSrc(filename) {
  return fs.readFileSync(path.join(FIRM_SRC, filename), "utf8");
}

function firmSrcFiles() {
  return fs.readdirSync(FIRM_SRC).filter((entry) => entry.endsWith(".mjs"));
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

// ─── Guard A: new core imports old code only through the keep-list ────────────

// The exact "Dies" module basenames from FIRM-SPEC.md §The deletion ledger. Any import of one of
// these from brain/src/firm/ is a re-creation of the taxonomy this rebuild deletes.
const DIES_MODULES = [
  "object-graph-store.mjs",
  "object-graph-operations.mjs",
  "object-graph-projection.mjs",
  "object-funnel.mjs",
  "graph.mjs",
  "channel-graph.mjs",
  "flow-store.mjs",
  "contracts.mjs",
  "graph-operations.mjs",
  "step-runners.mjs",
  "workflow-composer.mjs",
  "candidate-composer.mjs",
  "board.mjs",
  "motion-plan.mjs",
  "promote-motion.mjs",
  "path-portfolio.mjs",
  "program-projection.mjs",
  "signal-weights-store.mjs",
  "reallocation.mjs",
  "reallocation-tunables-store.mjs",
  "run-compare.mjs",
  "run-compile.mjs",
  "run-derivation.mjs",
  "run-summary.mjs",
  "goal-store.mjs",
  "goal-conflicts.mjs",
  "goal-conflict-decision-store.mjs",
  "work-artifact-store.mjs",
  "canvas-structure-history.mjs",
  "canvas-proposal.mjs",
  "open-canvas-projection.mjs",
  "ideation.mjs",
  "idea-bar.mjs",
  "idea-store.mjs",
  "idea-derivation.mjs",
  "composer-router.mjs",
  "composer-briefing.mjs",
  "microproduct-composer.mjs",
  "woven-graph.mjs",
  "operating-view.mjs",
];

describe("anti-cage (firm): brain/src/firm/ imports old code only through the keep-list", () => {
  for (const filename of firmSrcFiles()) {
    it(`${filename} imports no module named in FIRM-SPEC.md §Dies`, () => {
      const src = stripComments(readFirmSrc(filename));
      const hits = DIES_MODULES.filter((died) => src.includes(died));
      assert.deepEqual(
        hits,
        [],
        `${filename} imports a "Dies" module: [${hits.join(", ")}]. FIRM-SPEC.md's deletion ledger ` +
        `retires these; new core code may only reach old code through the keep-list (docs/firm-build/00-INDEX.md rule 4).`,
      );
    });
  }
});

// ─── Guard B: the bet record carries no kind/status/stage field ──────────────

describe("anti-cage (firm): the bet record has no kind, status, or stage field", () => {
  it("bet.mjs never assigns a kind/status/stage field onto a bet", () => {
    const src = stripComments(readFirmSrc("bet.mjs"));
    const BANNED_FIELD_WRITES = [
      /\bkind\s*:/,
      /\bstatus\s*:/,
      /\bstage\s*:/,
    ];
    const hits = BANNED_FIELD_WRITES.filter((pattern) => pattern.test(src));
    assert.deepEqual(
      hits,
      [],
      `bet.mjs writes a kind/status/stage field (${hits.map((p) => p.toString()).join(", ")}). ` +
      `FIRM-SPEC.md: "A bet has no required fields, no kind, no stage, and no schema." Position is ` +
      `derived by positionOf(), never stored.`,
    );
  });

  it("a created bet's own keys never include kind, status, or stage", async () => {
    const { createBet } = await import("../../src/firm/bet.mjs");
    const bet = createBet({ ventureId: "v1", intent: "try a colder subject line" });
    for (const banned of ["kind", "status", "stage"]) {
      assert.equal(banned in bet, false, `a created bet carries a "${banned}" field — that is the stage cage regrowing`);
    }
  });

  it("positionOf derives all three positions from the loop, never a stored field", async () => {
    const { createBet, end, positionOf } = await import("../../src/firm/bet.mjs");
    const live = createBet({ ventureId: "v1", intent: "try a colder subject line" });
    assert.equal(positionOf(live, []), "live");

    const atWall = createBet({ ventureId: "v1", intent: "ship a landing page" });
    assert.equal(positionOf(atWall, [{ betId: atWall.id }]), "at-wall");

    const ended = end(createBet({ ventureId: "v1", intent: "cold outbound to fintech ops" }), "founder", { learning: "too cold" });
    assert.equal(positionOf(ended, []), "ended");
    // Being simultaneously queued at the wall never overrides "ended" — the founder's kill is final.
    assert.equal(positionOf(ended, [{ betId: ended.id }]), "ended");
  });
});

// ─── Guard C: teammate records carry no role/seniority/hierarchy/manager field ─

describe("anti-cage (firm): teammate records carry no role, seniority, or manager field", () => {
  it("crew.mjs never assigns a role/seniority/hierarchy/manager field onto a teammate", () => {
    const src = stripComments(readFirmSrc("crew.mjs"));
    const BANNED_FIELD_WRITES = [
      /\brole\s*:/,
      /\bseniority\s*:/,
      /\bhierarchy\s*:/,
      /\bmanager\s*:/,
      /\breportsTo\s*:/,
    ];
    const hits = BANNED_FIELD_WRITES.filter((pattern) => pattern.test(src));
    assert.deepEqual(
      hits,
      [],
      `crew.mjs writes an org-chart field (${hits.map((p) => p.toString()).join(", ")}). ` +
      `FIRM-SPEC.md: "No roles, no seniority, no org chart, no manager agents — souls and lessons, nothing structural."`,
    );
  });

  it("a summoned teammate's roster entry and soul carry no role/seniority/hierarchy/manager key", async () => {
    const fs2 = await import("node:fs");
    const os = await import("node:os");
    const path2 = await import("node:path");
    const { summon, listCrew } = await import("../../src/firm/crew.mjs");
    const { createVenture } = await import("../../src/firm/venture-store.mjs");
    // Opt out of the founding-crew seed: this guard checks the SHAPE of a single summoned teammate's
    // roster entry and soul, so it wants a venture holding only the one teammate it summons.
    const options = { root: fs2.mkdtempSync(path2.join(os.tmpdir(), "firm-anticage-crew-")), seedFoundingCrew: false };
    const venture = createVenture({ name: "Roster shape check" }, options);
    summon(venture.id, "outreach-writer", {}, options);
    const crew = listCrew(venture.id, options);
    assert.equal(crew.length, 1);
    for (const banned of ["role", "seniority", "hierarchy", "manager", "reportsTo"]) {
      assert.equal(banned in crew[0], false, `the roster entry carries a "${banned}" field`);
      assert.equal(banned in (crew[0].soul ?? {}), false, `the teammate soul carries a "${banned}" field`);
    }
  });
});

// ─── Guard D: the architecture layer is semantic, singular, and non-executable ───────────────────

describe("anti-cage (firm): venture architecture stays a minimal semantic layer", () => {
  it("has exactly five roles and does not turn releases, outcomes, bets, or teammates into architecture roles", async () => {
    const { ARCHITECTURE_ROLES } = await import("../../src/firm/architecture.mjs");
    assert.deepEqual(
      ARCHITECTURE_ROLES,
      ["concept", "product-loop", "system", "motion", "campaign"],
      "changing the durable ontology requires an explicit FIRM-SPEC decision, not an incidental schema addition",
    );
  });

  it("keeps architecture in one document instead of per-role stores", () => {
    const forbiddenStores = firmSrcFiles().filter((filename) => (
      /^(system|motion|campaign|product-loop|concept|graph)-(store|repository)\.mjs$/.test(filename)
    ));
    assert.deepEqual(
      forbiddenStores,
      [],
      `architecture grew parallel role stores: ${forbiddenStores.join(", ")}. ` +
      "FIRM-SPEC requires one revisioned architecture document inside the venture store.",
    );
  });

  it("offers semantic edit operations, never an executable graph or lifecycle machine", async () => {
    const { ARCHITECTURE_OPERATIONS } = await import("../../src/firm/architecture.mjs");
    const executableVerb = /(?:execute|run|advance|transition|compile|schedule|dispatch|stage)/i;
    assert.deepEqual(
      ARCHITECTURE_OPERATIONS.filter((operation) => executableVerb.test(operation)),
      [],
      "architecture connections describe venture meaning; work-loop and wall events remain execution truth",
    );
  });

  it("stores no placement, health, score, stage, or generic status in current architecture truth", async () => {
    const { emptyArchitecture } = await import("../../src/firm/architecture.mjs");
    const document = emptyArchitecture("venture-minimality");
    for (const forbidden of ["placement", "health", "score", "stage", "status"]) {
      assert.equal(forbidden in document, false, `architecture document carries forbidden ${forbidden} truth`);
    }
    assert.deepEqual(
      Object.keys(document).sort(),
      ["connections", "elements", "evidenceAnnotations", "groups", "intent", "revision", "schemaVersion", "updatedAt", "updatedBy", "ventureId"].sort(),
      "the architecture root grew an unreviewed authority or lifecycle field",
    );
  });
});

// ─── Guard E: market.mjs surfaces no aggregate/count/score field — the market speaks, it never scores ─
//
// FIRM-SPEC.md "What stays open": "What the market's outcome says. It speaks in language or it is
// silent — no sentiment scores, no aggregate numbers surfaced to the founder." outcome-ingest.mjs's
// outcomeReport/deriveMotionEfficiency scoreboards are explicitly NOT ported (firm-build/06-F5-
// market-speaks.md). This guards both the source (no scoreboard field literally written) and the real
// shape (a recorded outcome and its wall item carry no count/score/rate field anywhere in their keys).

describe("anti-cage (firm): market.mjs surfaces no aggregate/count/score field", () => {
  it("market.mjs never assigns a count/score/rate/total/aggregate field onto anything it returns", () => {
    const src = stripComments(readFirmSrc("market.mjs"));
    const BANNED_FIELD_WRITES = [
      /\bcount\s*:/,
      /\bscore\s*:/,
      /\brate\s*:/,
      /\btotal\s*:/,
      /\baggregate\s*:/,
      /\bsentiment\s*:/,
    ];
    const hits = BANNED_FIELD_WRITES.filter((pattern) => pattern.test(src));
    assert.deepEqual(
      hits,
      [],
      `market.mjs writes a scoreboard-shaped field (${hits.map((p) => p.toString()).join(", ")}). ` +
      `FIRM-SPEC.md: "no sentiment scores, no aggregate numbers surfaced to the founder."`,
    );
  });

  it("a recorded outcome and its parked wall item carry no count/score/rate/total key at any depth", async () => {
    const fs2 = await import("node:fs");
    const os = await import("node:os");
    const path2 = await import("node:path");
    const { recordOutcome } = await import("../../src/firm/market.mjs");
    const { createVenture, setVentureDoc, getVentureDoc } = await import("../../src/firm/venture-store.mjs");
    const { createBet } = await import("../../src/firm/bet.mjs");
    const options = { root: fs2.mkdtempSync(path2.join(os.tmpdir(), "firm-anticage-market-")) };
    const venture = createVenture({ name: "No scoreboard" }, options);
    const bet = createBet({ ventureId: venture.id, intent: "cold outbound to fintech ops" });
    setVentureDoc(venture.id, "bets", bet.id, bet, options);

    const { outcome, queued } = recordOutcome(
      { ventureId: venture.id, joinKey: bet.joinKey, outcomeKind: "reply", body: "tell me more", source: "connected-account" },
      options,
    );
    const bannedKeys = ["count", "score", "rate", "total", "aggregate", "sentiment"];
    function assertNoScoreboardKeys(value, label) {
      if (!value || typeof value !== "object") return;
      for (const [key, nested] of Object.entries(value)) {
        assert.equal(bannedKeys.includes(key.toLowerCase()), false, `${label}.${key} is a scoreboard-shaped field`);
        assertNoScoreboardKeys(nested, `${label}.${key}`);
      }
    }
    assertNoScoreboardKeys(outcome, "outcome");
    assertNoScoreboardKeys(queued, "queued wall item");
    assertNoScoreboardKeys(getVentureDoc(venture.id, "bets", bet.id, options), "bet");
  });
});

// ─── Guard F: the smallness ceiling (FIRM-SPEC.md §New anti-cage guards) ───────────────────────────
//
// "The new core stays within a named file budget; adding a store or a noun fails the guard until this
// spec is amended first." F9's deletion pass (docs/firm-build/F9-DELETION-MANIFEST.md) is what actually
// shrinks brain/src/ — as of this guard landing, only ambient-scheduler.mjs has been retired (fully
// superseded by firm/heat.mjs) and one file (connectors/measure/gmail-thread.mjs) was split OUT of
// inbox-reader.mjs to decouple market-poll.mjs from the Dies-listed object-graph/path-portfolio chain —
// a pure extraction, net +0 behavior, +1 file. The bulk of the ~40 Dies-listed modules plus their own
// dependents (see the manifest's "remaining deletion" section) are still in the tree, blocked on two
// real couplings the manifest's static Guard-A scan could not see on its own (transitive reach through
// a keep-list file, not a firm-file's own direct import): product-model-generator.mjs (keep-list truth)
// still needs run-grounding.mjs's Dies-coupled slices until that split is proven byte-identical, and the
// routes collapse (brain/src/routes/) hasn't happened yet, so several otherwise-Dies-clean leaf modules
// (idea-derivation.mjs, composer-router.mjs, run-compare.mjs, run-summary.mjs, motion-plan.mjs,
// goal-conflict-decision-store.mjs, canvas-proposal.mjs, open-canvas-projection.mjs, woven-graph.mjs)
// are still reachable from server.mjs's live ROUTE_GROUPS through routes still wired in.
//
// The ceiling below is set to the count HONESTLY reached tonight (see this guard's own comment date),
// not the post-deletion target — FIRM-SPEC.md's "reads in an afternoon" target for the full harness
// (new core + ported keep-list + connectors/runtimes) is closer to ~150 once the routes collapse and
// the run-grounding split both land; that number is NOT claimed here until this repo actually reaches
// it. This guard's job tonight is only to stop the count from silently climbing back toward the old
// ~222-225 baseline while the remaining deletion work is still pending — raise the ceiling deliberately,
// with a comment naming what grew it, never let it drift up unnoticed.
describe("anti-cage (firm): brain/src/ stays within the smallness ceiling", () => {
  it("brain/src/ file count is at or under the current honest ceiling", () => {
    const BRAIN_SRC = path.resolve(import.meta.dirname, "../../src");
    function countMjsFiles(dir) {
      let count = 0;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) count += countMjsFiles(path.join(dir, entry.name));
        else if (entry.name.endsWith(".mjs")) count += 1;
      }
      return count;
    }
    // Set 2026-07-14 (F9 execution night) at the actual count reached: ambient-scheduler.mjs retired,
    // gmail-thread.mjs split out. NOT the ~150 post-deletion target — see this guard's own header.
    const CEILING = 230;
    const count = countMjsFiles(BRAIN_SRC);
    assert.ok(
      count <= CEILING,
      `brain/src/ has grown to ${count} .mjs files, past the ${CEILING} ceiling. Either this is the ` +
      `Dies-list deletion pass finally landing (lower the ceiling to match, with a comment) or a new ` +
      `file was added without a corresponding deletion (FIRM-SPEC.md: "adding a store or a noun fails ` +
      `the guard until this spec is amended first" — stop and report, don't raise the number to make ` +
      `this pass).`,
    );
  });
});
