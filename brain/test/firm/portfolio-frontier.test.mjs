import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  groupedPortfolioWall,
  portfolioFrontierEligibility,
  PORTFOLIO_PROOF_ENV,
  requirePortfolioFrontierProof,
} from "../../src/firm/portfolio-frontier.mjs";
import { createVenture } from "../../src/firm/venture-store.mjs";
import { park } from "../../src/firm/wall.mjs";

function options() {
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), "drover-portfolio-frontier-")) };
}

describe("portfolio frontier proof gate", () => {
  it("stays proof-required for missing, malformed, impossible, or future evidence dates", () => {
    assert.equal(portfolioFrontierEligibility({}, "2026-07-14").status, "proof-required");
    assert.equal(portfolioFrontierEligibility({ [PORTFOLIO_PROOF_ENV]: "yesterday" }, "2026-07-14").status, "proof-required");
    assert.equal(portfolioFrontierEligibility({ [PORTFOLIO_PROOF_ENV]: "2026-02-31" }, "2026-07-14").status, "proof-required");
    assert.equal(portfolioFrontierEligibility({ [PORTFOLIO_PROOF_ENV]: "2026-07-15" }, "2026-07-14").status, "proof-required");
    assert.throws(
      () => requirePortfolioFrontierProof({}),
      (error) => error.code === "portfolio_frontier_proof_required" && error.status === 409,
    );
  });

  it("becomes eligible only for an explicit dated evidence marker", () => {
    const env = { [PORTFOLIO_PROOF_ENV]: "2026-07-14" };
    const eligibility = portfolioFrontierEligibility(env, "2026-07-14");
    assert.equal(eligibility.status, "eligible");
    assert.equal(eligibility.proofDate, "2026-07-14");
    assert.equal(requirePortfolioFrontierProof(env).status, "eligible");
  });
});

describe("cross-venture pending wall projection", () => {
  it("groups only pending founder decisions by venture identity with canonical context", () => {
    const store = options();
    const first = createVenture({ name: "First venture" }, store);
    const second = createVenture({ name: "Second venture" }, store);
    createVenture({ name: "No pending decisions" }, store);
    const firstItem = park({
      ventureId: first.id,
      betId: null,
      effect: { kind: "outcome", outcome: { id: "outcome-first" } },
    }, store);
    const secondItem = park({
      ventureId: second.id,
      betId: null,
      effect: { kind: "send", outcomeId: "outcome-second" },
    }, store);

    const groups = groupedPortfolioWall(store);
    assert.deepEqual(groups.map((group) => group.venture), [
      { id: first.id, name: first.name },
      { id: second.id, name: second.name },
    ]);
    assert.equal(groups[0].items[0].id, firstItem.id);
    assert.deepEqual(groups[0].items[0].context, {
      ventureId: first.id,
      betId: null,
      outcomeId: "outcome-first",
    });
    assert.equal(groups[1].items[0].id, secondItem.id);
    assert.equal(groups[1].items[0].context.outcomeId, "outcome-second");
    assert.equal("metrics" in groups[0], false);
  });
});
