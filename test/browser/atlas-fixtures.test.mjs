#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { buildArchitectureProjection } from "../../brain/src/firm/architecture-projection.mjs";
import { applyArchitectureMutations, getArchitecture } from "../../brain/src/firm/architecture.mjs";
import { setVentureDoc, venturePersistence } from "../../brain/src/firm/venture-store.mjs";

import {
  buildBuffaloAtlas,
  buildDenialShieldAtlas,
  createAtlasPortfolioFixture,
  createEmptyAtlasFixture,
} from "../fixtures/atlas-fixtures.mjs";

const roots = [];

function freshRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "drover-atlas-fixture-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function byRole(atlas, role) {
  return atlas.current.elements.filter((element) => element.role === role);
}

function assertOperationalReferences(atlas) {
  const ids = new Set(atlas.current.elements.map((element) => element.id));
  const systems = new Set(byRole(atlas, "system").map((element) => element.id));
  const motions = new Set(byRole(atlas, "motion").map((element) => element.id));
  const productLoops = new Set(byRole(atlas, "product-loop").map((element) => element.id));

  for (const motion of byRole(atlas, "motion")) {
    assert.ok(motion.systemIds.length > 0, `${motion.name} needs a reusable system`);
    assert.ok(motion.systemIds.every((id) => systems.has(id)), `${motion.name} has an unresolved system`);
    assert.ok(motion.productRefs.every((id) => productLoops.has(id)), `${motion.name} has an unresolved product loop`);
  }
  for (const campaign of byRole(atlas, "campaign")) {
    assert.ok(motions.has(campaign.primaryMotionId), `${campaign.name} has an unresolved primary motion`);
    assert.ok(campaign.motionIds.includes(campaign.primaryMotionId), `${campaign.name} omits its primary motion`);
    assert.ok(campaign.motionIds.every((id) => motions.has(id)), `${campaign.name} has an unresolved touched motion`);
    assert.ok(campaign.governingBetId, `${campaign.name} needs one governing bet`);
  }
  for (const connection of atlas.current.connections) {
    const architectureId = (ref) => ref.startsWith("architecture:") ? ref.slice("architecture:".length) : null;
    assert.ok(ids.has(architectureId(connection.fromRef)), `${connection.id} has an unresolved source`);
    assert.ok(ids.has(architectureId(connection.toRef)), `${connection.id} has an unresolved target`);
    assert.ok(connection.label.trim(), `${connection.id} must not become a generic executable arrow`);
    assert.ok(["tentative", "founder-asserted"].includes(connection.assertion));
  }
}

describe("living venture atlas fixtures", () => {
  it("models Buffalo as open architecture with one shared system identity", () => {
    const atlas = buildBuffaloAtlas();
    assertOperationalReferences(atlas);

    assert.equal(atlas.current.ventureId, "fixture-buffalo-projects");
    assert.deepEqual(
      ["concept", "product-loop", "system", "motion", "campaign"].map((role) => [role, byRole(atlas, role).length]),
      [["concept", 3], ["product-loop", 1], ["system", 3], ["motion", 3], ["campaign", 1]],
    );
    const sharedSystem = byRole(atlas, "system").find((system) => system.id === "arch-buffalo-system-proof");
    assert.ok(sharedSystem, "the work-proof system must exist once");
    assert.equal(atlas.current.elements.filter((element) => element.id === sharedSystem.id).length, 1);
    assert.deepEqual(
      byRole(atlas, "motion")
        .filter((motion) => motion.systemIds.includes(sharedSystem.id))
        .map((motion) => motion.id)
        .sort(),
      [
        "arch-buffalo-motion-flagship",
        "arch-buffalo-motion-graduate",
        "arch-buffalo-motion-institutional",
      ],
    );
    assert.equal(atlas.current.connections.every((connection) => connection.assertion === "tentative"), true);
    assert.equal(atlas.current.evidenceAnnotations[0].note.includes("does not establish"), true);
  });

  it("models an unrelated dental venture without a schema or role variant", () => {
    const buffalo = buildBuffaloAtlas();
    const denialShield = buildDenialShieldAtlas();
    assertOperationalReferences(denialShield);

    assert.equal(denialShield.current.ventureId, "fixture-denialshield");
    assert.deepEqual(
      new Set(denialShield.current.elements.map((element) => element.role)),
      new Set(["product-loop", "system", "motion", "campaign"]),
    );
    assert.deepEqual(
      new Set([...buffalo.current.elements, ...denialShield.current.elements].map((element) => element.role)),
      new Set(["concept", "product-loop", "system", "motion", "campaign"]),
    );
    const preflight = byRole(denialShield, "system").find((system) => system.id === "arch-denial-system-preflight");
    assert.equal(
      byRole(denialShield, "motion").filter((motion) => motion.systemIds.includes(preflight.id)).length,
      2,
      "product-led and consultant-led motions must share one preflight system",
    );
    assert.equal(denialShield.current.evidenceAnnotations[0].stance, "challenges");
    assert.equal(denialShield.current.evidenceAnnotations[0].basis, "captured-join");
  });

  it("keeps dense open material non-operational", () => {
    const dense = buildBuffaloAtlas({ dense: true });
    assert.equal(byRole(dense, "concept").length, 75);
    assert.equal(byRole(dense, "system").length, 3);
    assert.equal(byRole(dense, "motion").length, 3);
    assert.equal(byRole(dense, "campaign").length, 1);
  });

  it("persists two isolated ventures with exact release and outcome joins", () => {
    const root = freshRoot();
    const fixture = createAtlasPortfolioFixture({ root });
    const buffalo = buildArchitectureProjection(fixture.venture.id, { root });
    const denialShield = buildArchitectureProjection(fixture.unrelatedVenture.id, { root });

    assert.equal(buffalo.ventureId, fixture.venture.id);
    assert.equal(denialShield.ventureId, fixture.unrelatedVenture.id);
    assert.equal(buffalo.elements.some((element) => element.name === "Claim preflight"), false);
    assert.equal(denialShield.elements.some((element) => element.name === "Builder intake"), false);
    assert.deepEqual(buffalo.joins.work.map((work) => work.id).sort(), [
      "buffalo-work-project-drop-v1",
      "buffalo-work-project-drop-v2",
    ]);
    assert.equal(buffalo.joins.wall.filter((receipt) => receipt.decision === "release").length, 1);
    assert.equal(buffalo.joins.wall.filter((receipt) => receipt.decision == null).length, 1);
    assert.equal(buffalo.joins.outcomes[0].join.level, "exact");
    assert.equal(buffalo.joins.outcomes[0].join.causal, false);
    assert.equal(buffalo.pressure.some((pressure) => pressure.reason === "held-release"), true);

    const wrongVentureArchitecture = getArchitecture(fixture.unrelatedVenture.id, { root });
    assert.equal(wrongVentureArchitecture.elements.some((element) => element.id === fixture.expected.buffalo.sharedSystemId), false);
  });

  it("keeps placement disposable and semantic deletion impact explicit", () => {
    const root = freshRoot();
    const fixture = createAtlasPortfolioFixture({ root });
    const ventureId = fixture.venture.id;
    const before = getArchitecture(ventureId, { root });
    setVentureDoc(ventureId, "placement", "canvas", {
      positions: { "architecture:arch-buffalo-system-proof": { x: 120, y: 340 } },
      revision: 1,
    }, { root });
    assert.equal(venturePersistence({ root }, ventureId).delete("placement", "canvas"), true);
    assert.deepEqual(getArchitecture(ventureId, { root }), before, "deleting placement must not delete architecture meaning");

    assert.throws(
      () => applyArchitectureMutations({
        ventureId,
        baseRevision: before.revision,
        operations: [{ op: "remove-element", id: "arch-buffalo-system-proof" }],
        reason: "Try removing a shared system",
        actor: { authority: "founder", id: "jacob" },
      }, { root }),
      (error) => {
        assert.equal(error.code, "architecture_active_reference");
        assert.match(error.message, /still referenced.*detach or rewire/i);
        return true;
      },
    );
  });

  it("promotes an open concept without changing its identity or open connection", () => {
    const root = freshRoot();
    const fixture = createAtlasPortfolioFixture({ root });
    const ventureId = fixture.venture.id;
    const before = getArchitecture(ventureId, { root });
    const conceptId = "arch-buffalo-referral-engine";
    const result = applyArchitectureMutations({
      ventureId,
      baseRevision: before.revision,
      operations: [{
        op: "change-role",
        id: conceptId,
        role: "system",
        fields: {
          role: "system",
          does: "Turns visible work proof into a credible invitation for the next participant.",
          supportsProductRefs: ["arch-buffalo-loop-proof#step-return"],
          repositoryRefs: [],
        },
      }],
      reason: "Use referral as a reusable capability",
      actor: { authority: "founder", id: "jacob" },
    }, { root });
    const promoted = result.architecture.elements.find((element) => element.id === conceptId);
    assert.equal(promoted.role, "system");
    assert.equal(promoted.name, "Referral engine");
    assert.equal(result.architecture.connections.some((connection) => connection.fromRef === `architecture:${conceptId}`), true);
    assert.equal(result.receipt.before.elements.find((element) => element.id === conceptId).role, "concept");
    assert.equal(result.receipt.after.elements.find((element) => element.id === conceptId).role, "system");
  });

  it("projects an explicit empty atlas for an existing venture without architecture", () => {
    const root = freshRoot();
    const fixture = createEmptyAtlasFixture({ root });
    const projection = buildArchitectureProjection(fixture.venture.id, { root });
    assert.equal(projection.revision, 0);
    assert.deepEqual(projection.elements, []);
    assert.deepEqual(projection.connections, []);
    assert.equal(projection.document.intent.statement, "");
    assert.deepEqual(projection.joins, { bets: [], work: [], wall: [], outcomes: [] });
  });
});
