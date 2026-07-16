import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  applyFirmConfiguration,
  applyFirmConfigurationProposal,
  getFirmConfiguration,
  proposeFirmConfiguration,
  restoreFirmConfiguration,
} from "../../src/firm/configuration.mjs";
import { summon, listCrew } from "../../src/firm/crew.mjs";
import {
  createVenture,
  exportVenture,
  getVentureDoc,
  importVenture,
  listVentureDocs,
} from "../../src/firm/venture-store.mjs";

function freshRoot() {
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), "firm-configuration-")) };
}

describe("firm configuration — readable compatibility seed", () => {
  it("seeds existing teammates once into a complete local configuration", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Configured firm" }, options);
    summon(venture.id, "operator", { name: "Yara" }, options);

    const configuration = getFirmConfiguration(venture.id, options);

    assert.equal(configuration.revision, 1);
    assert.equal(configuration.presentation.participant, "teammate");
    assert.equal(configuration.agents[0].ref, "operator");
    assert.equal(configuration.agents[0].name, "Yara");
    assert.deepEqual(configuration.coordination.protocols.slice(0, 3), ["direct", "consult", "relay"]);
    assert.equal(configuration.authority.outwardEffects, "wall");
    assert.deepEqual(getVentureDoc(venture.id, "configuration", "firm", options), configuration);
  });

  it("round-trips the configuration and its history with the venture", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Portable firm" }, options);
    const initial = getFirmConfiguration(venture.id, options);
    const changed = applyFirmConfiguration({
      ventureId: venture.id,
      expectedRevision: initial.revision,
      configuration: {
        ...initial,
        defaults: { ...initial.defaults, runtime: "codex", model: "gpt-5" },
      },
      summary: "Use Codex by default",
    }, options);

    const bundle = exportVenture(venture.id, options);
    const other = freshRoot();
    importVenture(bundle, other);

    assert.equal(getFirmConfiguration(venture.id, other).defaults.runtime, "codex");
    assert.equal(getFirmConfiguration(venture.id, other).revision, changed.configuration.revision);
    assert.equal(listVentureDocs(venture.id, "configuration", other).some((doc) => doc.type === "firm-configuration-change"), true);
  });
});

describe("firm configuration — founder versions and reversibility", () => {
  it("accepts every founder-facing participant presentation named by the firm spec", () => {
    for (const participant of ["direct-model", "specialist", "team", "automation"]) {
      const options = freshRoot();
      const venture = createVenture({ name: `${participant} firm` }, options);
      const initial = getFirmConfiguration(venture.id, options);
      const { configuration } = applyFirmConfiguration({
        ventureId: venture.id,
        expectedRevision: initial.revision,
        configuration: {
          ...initial,
          presentation: { ...initial.presentation, participant, participantLabel: participant },
        },
      }, options);
      assert.equal(configuration.presentation.participant, participant);
    }
  });

  it("applies the whole participant model, advances revision, syncs the lens roster, and records a receipt", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Dense firm" }, options);
    const initial = getFirmConfiguration(venture.id, options);

    const { configuration, receipt } = applyFirmConfiguration({
      ventureId: venture.id,
      expectedRevision: initial.revision,
      summary: "Form an evidence panel",
      configuration: {
        ...initial,
        presentation: {
          participant: "agent",
          participantLabel: "examiner",
          collectiveLabel: "panel",
        },
        defaults: { runtime: "claude-code", model: "claude-sonnet-4-5", maxSteps: 40 },
        organization: {
          shape: "company",
          instructions: "Use reporting lines only where the founder asks for them.",
          relationships: [],
        },
        coordination: {
          mode: "adaptive",
          protocols: ["direct", "panel", "debate", "synthesis"],
          stopWhen: ["another pass will not change the decision"],
        },
        authority: { outwardEffects: "wall" },
        agents: [{
          ref: "value-auditor",
          name: "Value Model Auditor",
          perspective: "Examines how value is created, distributed, and captured.",
          temperament: ["commercially skeptical", "evidence-sensitive"],
          contributes: ["observations", "challenges", "requests for other perspectives"],
          boundaries: ["does not treat revenue as proof of value"],
          activation: "direct-or-relevant",
          capabilities: { firmTools: true, additional: ["verification"] },
          context: { scope: "venture", instructions: "Read the artifact in front of you." },
          memory: { scope: "venture-soul" },
          runtime: { provider: "codex", model: "gpt-5" },
          budget: { maxSteps: 30, dailySpendUsd: 2 },
          authority: { outwardEffects: "wall" },
          evaluation: { signals: ["decision changed", "uncertainty reduced"] },
        }],
      },
    }, options);

    assert.equal(configuration.revision, 2);
    assert.equal(configuration.presentation.collectiveLabel, "panel");
    assert.equal(configuration.organization.shape, "company");
    assert.equal(configuration.agents[0].runtime.provider, "codex");
    assert.equal(configuration.agents[0].capabilities.additional[0], "verification");
    assert.equal(receipt.before.revision, 1);
    assert.equal(receipt.after.revision, 2);
    assert.deepEqual(listCrew(venture.id, options).map((entry) => entry.ref), ["value-auditor"]);
  });

  it("fails closed on stale writes and wall bypasses", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Safe firm" }, options);
    const initial = getFirmConfiguration(venture.id, options);
    const first = applyFirmConfiguration({
      ventureId: venture.id,
      expectedRevision: initial.revision,
      configuration: { ...initial, presentation: { ...initial.presentation, participant: "employee" } },
    }, options);

    assert.throws(() => applyFirmConfiguration({
      ventureId: venture.id,
      expectedRevision: initial.revision,
      configuration: first.configuration,
    }, options), /Stale firm configuration/);
    assert.throws(() => applyFirmConfiguration({
      ventureId: venture.id,
      expectedRevision: first.configuration.revision,
      configuration: { ...first.configuration, authority: { outwardEffects: "direct" } },
    }, options), /cannot bypass/);
    assert.throws(() => applyFirmConfiguration({
      ventureId: venture.id,
      expectedRevision: first.configuration.revision,
      configuration: { ...first.configuration, defaults: { ...first.configuration.defaults, maxSteps: -1 } },
    }, options), /Invalid numeric firm configuration/);
    assert.throws(() => applyFirmConfiguration({
      ventureId: venture.id,
      expectedRevision: first.configuration.revision,
      configuration: {
        ...first.configuration,
        coordination: { ...first.configuration.coordination, maxPasses: 1.5 },
      },
    }, options), /Invalid whole-number firm configuration/);
  });

  it("restores a prior version as a new version instead of erasing history", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Reversible firm" }, options);
    const initial = getFirmConfiguration(venture.id, options);
    const changed = applyFirmConfiguration({
      ventureId: venture.id,
      expectedRevision: initial.revision,
      configuration: { ...initial, presentation: { ...initial.presentation, collectiveLabel: "studio" } },
      summary: "Call the group a studio",
    }, options);

    const restored = restoreFirmConfiguration({
      ventureId: venture.id,
      expectedRevision: changed.configuration.revision,
      receiptId: changed.receipt.id,
    }, options);

    assert.equal(restored.configuration.revision, 3);
    assert.equal(restored.configuration.presentation.collectiveLabel, "crew");
    assert.equal(listVentureDocs(venture.id, "configuration", options).filter((doc) => doc.type === "firm-configuration-change").length, 2);
  });

  it("keeps user-defined organization lines open-ended but connected to real participants", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Configured organization" }, options);
    const initial = getFirmConfiguration(venture.id, options);
    const agents = [{ ref: "lead", name: "Lead" }, { ref: "researcher", name: "Researcher" }];
    const applied = applyFirmConfiguration({
      ventureId: venture.id,
      expectedRevision: initial.revision,
      configuration: {
        ...initial,
        agents,
        organization: {
          shape: "company",
          instructions: "The founder chose an employee model.",
          relationships: [{ from: "researcher", to: "lead", kind: "reports-to", label: "reports to" }],
        },
      },
    }, options);
    assert.deepEqual(applied.configuration.organization.relationships[0], {
      from: "researcher", to: "lead", kind: "reports-to", label: "reports to",
    });

    assert.throws(() => applyFirmConfiguration({
      ventureId: venture.id,
      expectedRevision: applied.configuration.revision,
      configuration: {
        ...applied.configuration,
        organization: { ...applied.configuration.organization, relationships: [{ from: "ghost", to: "lead", kind: "advises" }] },
      },
    }, options), /must connect configured participants/);
  });
});

describe("firm configuration — agent proposals, founder application", () => {
  it("lets a participant propose a partial change without applying it", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Proposed firm" }, options);
    summon(venture.id, "operator", { name: "Yara" }, options);
    const current = getFirmConfiguration(venture.id, options);

    const proposal = proposeFirmConfiguration({
      ventureId: venture.id,
      proposedBy: "operator",
      summary: "Present the participants as employees",
      rationale: "The founder asked for an operating-company frame.",
      changes: { presentation: { participant: "employee", participantLabel: "employee", collectiveLabel: "company" } },
    }, options);

    assert.equal(proposal.baseRevision, current.revision);
    assert.equal(proposal.proposed.presentation.participant, "employee");
    assert.equal(getFirmConfiguration(venture.id, options).presentation.participant, "teammate");

    const applied = applyFirmConfigurationProposal({
      ventureId: venture.id,
      proposalId: proposal.id,
      expectedRevision: current.revision,
    }, options);
    assert.equal(applied.configuration.presentation.participant, "employee");
    assert.equal(getVentureDoc(venture.id, "configuration", proposal.id, options).status, "applied");
  });

  it("refuses to apply a proposal after the configuration it examined has changed", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Stale proposal" }, options);
    summon(venture.id, "operator", {}, options);
    const current = getFirmConfiguration(venture.id, options);
    const proposal = proposeFirmConfiguration({
      ventureId: venture.id,
      proposedBy: "operator",
      summary: "Use a studio frame",
      changes: { presentation: { collectiveLabel: "studio" } },
    }, options);
    const changed = applyFirmConfiguration({
      ventureId: venture.id,
      expectedRevision: current.revision,
      configuration: { ...current, defaults: { ...current.defaults, runtime: "codex" } },
    }, options);

    assert.throws(() => applyFirmConfigurationProposal({
      ventureId: venture.id,
      proposalId: proposal.id,
      expectedRevision: changed.configuration.revision,
    }, options), /based on revision/);
  });
});
