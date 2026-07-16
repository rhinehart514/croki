import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { buildLens } from "../../src/firm/lens.mjs";
import { queue } from "../../src/firm/wall.mjs";
import { listVentureDocs } from "../../src/firm/venture-store.mjs";
import {
  DENSE_FIXTURE_LONG_COPY,
  createDenseVentureFixture,
  createOvernightVentureFixture,
} from "../../../test/fixtures/firm-fixtures.mjs";

const roots = [];

function freshRoot(label) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `drover-${label}-`));
  roots.push(root);
  return root;
}

function forkDepth(bet, byId) {
  let depth = 0;
  let current = bet;
  const visited = new Set();
  while (current?.forkedFrom) {
    assert.equal(visited.has(current.id), false, `fixture fork cycle at ${current.id}`);
    visited.add(current.id);
    current = byId.get(current.forkedFrom);
    assert.ok(current, `missing fixture parent ${bet.forkedFrom}`);
    depth += 1;
  }
  return depth;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("production UX acceptance fixtures", () => {
  it("seeds the overnight return contract without releasing anything", () => {
    const root = freshRoot("overnight-fixture");
    const fixture = createOvernightVentureFixture({ root });
    const options = { root };
    const bets = listVentureDocs(fixture.venture.id, "bets", options);
    const outcomes = listVentureDocs(fixture.venture.id, "outcomes", options);
    const wall = queue(fixture.venture.id, options);

    assert.equal(bets.flatMap((bet) => bet.events ?? []).length, fixture.expected.inwardEvents);
    assert.equal(bets.flatMap((bet) => bet.staged ?? []).length, fixture.expected.stagedArtifacts);
    assert.equal(wall.length, fixture.expected.wallItems);
    assert.deepEqual([...new Set(wall.map((item) => item.purpose))].sort(), fixture.expected.wallPurposes);
    assert.equal(wall.filter((item) => item.purpose === "release").length, fixture.expected.heldOutwardActs);
    assert.ok(wall.every((item) => item.decision === null && item.releasedAt === null));
    assert.equal(outcomes.filter((outcome) => outcome.joined).length, 1);
    assert.equal(outcomes.filter((outcome) => outcome.attribution === "unattributed").length, 1);
    assert.equal(bets.filter((bet) => (
      bet.staged?.length && bet.events?.some((event) => event.type === "tool_failed")
    )).length, fixture.expected.failedPartialTurns);
    assert.deepEqual(bets.map((bet) => bet.id).sort(), [
      "overnight-bet-counterexample",
      "overnight-bet-evidence",
      "overnight-bet-message",
      "overnight-bet-partial",
    ]);
  });

  it("seeds the dense canvas contract with fixed scale and mixed fork depth", () => {
    const root = freshRoot("dense-fixture");
    const fixture = createDenseVentureFixture({ root });
    const options = { root };
    const lens = buildLens(fixture.venture.id, options);
    const outcomes = listVentureDocs(fixture.venture.id, "outcomes", options);
    const wall = queue(fixture.venture.id, options);
    const byId = new Map(lens.bets.map((bet) => [bet.id, bet]));
    const depths = lens.bets.map((bet) => forkDepth(bet, byId));

    assert.equal(lens.crew.length, fixture.expected.teammates);
    assert.equal(lens.bets.length, fixture.expected.bets);
    assert.equal(outcomes.length, fixture.expected.outcomes);
    assert.equal(wall.length, fixture.expected.wallItems);
    assert.equal(Math.max(...depths), fixture.expected.maxForkDepth);
    assert.ok(new Set(depths).size > 3, "fixture needs meaningfully mixed fork depth");
    assert.ok(lens.bets.every((bet) => bet.intent.includes(DENSE_FIXTURE_LONG_COPY)));
    assert.ok(wall.every((item) => item.decision === null));
  });
});
