import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { createBet } from "../../src/firm/bet.mjs";
import {
  applyArchitectureMutations,
  getArchitecture,
  getArchitectureState,
} from "../../src/firm/architecture.mjs";
import { buildArchitectureContext, architectureContextPrompt } from "../../src/firm/architecture-context.mjs";
import { buildArchitectureProjection } from "../../src/firm/architecture-projection.mjs";
import { decideArchitectureProposal, proposeArchitectureChange } from "../../src/firm/architecture-proposals.mjs";
import { startArchitectureCampaign } from "../../src/firm/architecture-campaign.mjs";
import { clearPlacement } from "../../src/firm/lens.mjs";
import { driveTeammate } from "../../src/firm/work-loop.mjs";
import { listConversation } from "../../src/firm/conversation.mjs";
import { createVentureTransfer, importVentureTransfer } from "../../src/firm/venture-transfer.mjs";
import { createVenture, getVentureDoc, setVentureDoc } from "../../src/firm/venture-store.mjs";

function directory(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function fixture(name = "Architecture fixture") {
  const options = { root: directory("drover-architecture-") };
  const repository = directory("drover-architecture-repo-");
  const venture = createVenture({ name, repository }, options);
  const governing = createBet({ ventureId: venture.id, intent: "Project-first entry produces qualified demand" });
  const supporting = createBet({ ventureId: venture.id, intent: "Free entry produces enough demand" });
  setVentureDoc(venture.id, "bets", governing.id, governing, options);
  setVentureDoc(venture.id, "bets", supporting.id, supporting, options);
  return { options, repository, venture, governing, supporting };
}

function atlasOperations({ governing, supporting }) {
  return [
    { op: "create-element", element: { id: "loop-proof", role: "product-loop", name: "Work becomes proof", actor: "Builder", entry: "Has real work", steps: [{ id: "describe", label: "Describes work" }, { id: "prove", label: "Leaves proof" }], value: "Credible proof", intendedChange: "Work begins before identity", provenance: { kind: "founder-authored" } } },
    { op: "create-element", element: { id: "system-proof", role: "system", name: "Work record", does: "Turns atomic work into reusable proof.", provenance: { kind: "founder-authored" } } },
    { op: "create-element", element: { id: "system-intake", role: "system", name: "Builder intake", does: "Captures useful work before identity ceremony.", provenance: { kind: "founder-authored" } } },
    { op: "create-element", element: { id: "motion-project", role: "motion", name: "Project-first entry", actor: "Builder", entry: "Has a project", value: "Working group and proof", systemIds: ["system-intake", "system-proof"], productRefs: ["loop-proof"], repeatabilityClaim: "Builders enter through work and leave proof.", provenance: { kind: "founder-authored" } } },
    { op: "create-element", element: { id: "motion-public", role: "motion", name: "Public proof entry", actor: "Potential collaborator", entry: "Sees credible work", value: "A useful project to join", systemIds: ["system-proof"], productRefs: ["loop-proof"], repeatabilityClaim: "Visible proof attracts another participant.", provenance: { kind: "founder-authored" } } },
    { op: "create-element", element: { id: "campaign-drops", role: "campaign", name: "First project drops", audience: "Recent graduates", objective: "Collect qualified work before profiles", primaryMotionId: "motion-project", motionIds: ["motion-project"], governingBetId: governing.id, supportingBetIds: [supporting.id], measurement: { observation: "Qualified project before profile", window: "First twenty accepted drops" }, bounds: { startsAt: "2026-07-15T00:00:00.000Z", endsAt: null }, provenance: { kind: "founder-authored" } } },
    { op: "create-element", element: { id: "concept-champions", role: "concept", name: "Department champions", statement: "Possible human bridge.", provenance: { kind: "founder-authored" } } },
    { op: "create-connection", connection: { id: "connection-champions", fromRef: "architecture:concept-champions", toRef: "architecture:motion-project", label: "may open the door to", assertion: "tentative" } },
    { op: "create-group", group: { id: "group-door", name: "Campus door", memberRefs: ["architecture:concept-champions", "architecture:motion-project"] } },
  ];
}

function seedAtlas(fx) {
  return applyArchitectureMutations({
    ventureId: fx.venture.id,
    baseRevision: 0,
    operations: atlasOperations(fx),
    reason: "Define the first operating architecture",
    actor: { authority: "founder", id: "jacob" },
  }, fx.options);
}

describe("living venture architecture domain", () => {
  it("loads an explicit empty compatible document for an existing venture", () => {
    const fx = fixture();
    const architecture = getArchitecture(fx.venture.id, fx.options);
    assert.equal(architecture.schemaVersion, 1);
    assert.equal(architecture.ventureId, fx.venture.id);
    assert.equal(architecture.revision, 0);
    assert.deepEqual(architecture.elements, []);
  });

  it("applies one founder revision with open material and the operational kernel", () => {
    const fx = fixture();
    const result = seedAtlas(fx);
    assert.equal(result.revision, 1);
    assert.equal(result.receipt.actor.id, "jacob");
    assert.equal(result.architecture.elements.length, 7);
    assert.equal(result.architecture.connections[0].assertion, "tentative");
    assert.equal(getArchitectureState(fx.venture.id, fx.options).revisions.length, 1);
    const system = result.architecture.elements.find((entry) => entry.id === "system-proof");
    assert.equal(system.status, undefined);
    assert.equal(system.health, undefined);
  });

  it("rejects stale edits and invalid operational references", () => {
    const fx = fixture();
    seedAtlas(fx);
    assert.throws(
      () => applyArchitectureMutations({ ventureId: fx.venture.id, baseRevision: 0, operations: [{ op: "create-element", element: { id: "late", role: "concept", name: "Late" } }], actor: { authority: "founder" } }, fx.options),
      (error) => error.code === "architecture_stale_revision" && error.currentRevision === 1,
    );
    assert.throws(
      () => applyArchitectureMutations({ ventureId: fx.venture.id, baseRevision: 1, operations: [{ op: "create-element", element: { id: "bad-motion", role: "motion", name: "Bad", actor: "A", entry: "E", value: "V", repeatabilityClaim: "R", systemIds: ["missing"], productRefs: ["loop-proof"] } }], actor: { authority: "founder" } }, fx.options),
      (error) => error.code === "architecture_role_invariant",
    );
  });

  it("keeps open connections descriptive and builds bounded operational context", () => {
    const fx = fixture();
    seedAtlas(fx);
    const concept = buildArchitectureContext(fx.venture.id, { id: "concept-champions", revision: 1 }, fx.options);
    assert.equal(concept.descriptiveOnly, true);
    assert.equal(concept.openConnections[0].label, "may open the door to");
    assert.equal(concept.live.bets.length, 0, "an open connection does not create campaign semantics");
    const motion = buildArchitectureContext(fx.venture.id, { id: "motion-project", revision: 1 }, fx.options);
    assert.equal(motion.descriptiveOnly, false);
    assert.deepEqual(new Set(motion.relatedElements.map((entry) => entry.id)), new Set(["loop-proof", "system-intake", "system-proof"]));
    assert.match(architectureContextPrompt(motion), /grants no tool or outward authority/);
  });

  it("starts a campaign by creating a real governing bet without a parallel task record", () => {
    const fx = fixture();
    const operations = atlasOperations(fx).filter((entry) => entry.element?.role !== "campaign");
    applyArchitectureMutations({ ventureId: fx.venture.id, baseRevision: 0, operations, actor: { authority: "founder", id: "jacob" } }, fx.options);
    const started = startArchitectureCampaign({
      ventureId: fx.venture.id,
      baseRevision: 1,
      motionId: "motion-project",
      campaign: { name: "Graduate project drops", audience: "Recent graduates", objective: "Get useful work before identity", measurement: { observation: "A qualified project is described", window: "First twenty accepted drops" } },
      bet: { intent: "Project drop converts better than profile creation" },
      actor: { authority: "founder", id: "jacob" },
    }, fx.options);
    assert.equal(started.revision, 2);
    assert.equal(started.campaign.governingBetId, started.bet.id);
    assert.equal(started.bet.architectureTarget.id, started.campaign.id);
    assert.equal(getVentureDoc(fx.venture.id, "bets", started.bet.id, fx.options).campaignId, started.campaign.id);
  });

  it("changes real teammate context and captures the architecture revision on work and conversation", async () => {
    const fx = fixture();
    seedAtlas(fx);
    let runtimeContext;
    const runtime = {
      id: "architecture-capture",
      label: "Architecture capture",
      supportsAbort: true,
      costReporting: "none",
      async drive(context) {
        runtimeContext = context;
        return { kind: "completed", summary: "Architecture bounded." };
      },
    };
    const result = await driveTeammate({
      ventureId: fx.venture.id,
      teammateRef: "operator",
      goal: "Prepare the next exact release",
      betId: fx.governing.id,
      initiatedBy: "founder",
      target: { architectureId: "motion-project", architectureRevision: 1, teammateRefs: [] },
      options: fx.options,
      deps: { runtime },
    });
    assert.match(runtimeContext.system, /Selected venture architecture \(motion\): Project-first entry/);
    assert.match(runtimeContext.system, /Omitted from this bounded slice/);
    assert.equal(result.work.architectureRevision, 1);
    assert.equal(result.work.architectureTarget.id, "motion-project");
    const founderMessage = listConversation(fx.venture.id, fx.options).find((entry) => entry.role === "founder");
    assert.equal(founderMessage.target.architectureId, "motion-project");
    assert.equal(founderMessage.target.architectureRevision, 1);
  });

  it("projects shared systems, campaign work, wall pressure, and non-causal outcomes", () => {
    const fx = fixture();
    seedAtlas(fx);
    const work = { id: "work-release", title: "Project drop", stagedAt: "2026-07-15T12:00:00.000Z", architectureRevision: 1 };
    setVentureDoc(fx.venture.id, "bets", fx.governing.id, { ...fx.governing, architectureRevision: 1, staged: [work] }, fx.options);
    setVentureDoc(fx.venture.id, "decisions", "wall-release", { id: "wall-release", ventureId: fx.venture.id, betId: fx.governing.id, workRef: work.id, purpose: "release", decision: null, parkedAt: "2026-07-15T13:00:00.000Z", architectureRevision: 1 }, fx.options);
    setVentureDoc(fx.venture.id, "outcomes", "outcome-return", { id: "outcome-return", ventureId: fx.venture.id, betId: fx.governing.id, workRef: work.id, outcomeKind: "reply", body: "Six useful drops", source: "captured", observedAt: "2026-07-15T14:00:00.000Z", attribution: "joined", architectureRevision: 1 }, fx.options);
    const projection = buildArchitectureProjection(fx.venture.id, fx.options);
    const shared = projection.elements.find((entry) => entry.id === "system-proof");
    assert.equal(shared.live.shared, true);
    assert.deepEqual(new Set(shared.live.motionIds), new Set(["motion-project", "motion-public"]));
    assert.equal(projection.joins.work[0].exact, true);
    assert.equal(projection.joins.outcomes[0].join.level, "contextual");
    assert.equal(projection.joins.outcomes[0].join.causal, false);
    assert.ok(projection.pressure.some((entry) => entry.reason === "held-release"));
  });

  it("requires founder evidence authority and preserves evidence basis", () => {
    const fx = fixture();
    seedAtlas(fx);
    setVentureDoc(fx.venture.id, "outcomes", "outcome-proof", { id: "outcome-proof", ventureId: fx.venture.id, betId: fx.governing.id, attribution: "joined" }, fx.options);
    assert.throws(
      () => applyArchitectureMutations({ ventureId: fx.venture.id, baseRevision: 1, operations: [{ op: "apply-evidence", evidence: { subjectRef: "architecture:motion-project", evidenceRef: "outcome:outcome-proof", stance: "supports", basis: "captured-join", note: "Observed for this sample only." } }], actor: { authority: "agent", id: "agent" } }, fx.options),
      (error) => error.code === "architecture_authority_denied",
    );
    const result = applyArchitectureMutations({ ventureId: fx.venture.id, baseRevision: 1, operations: [{ op: "apply-evidence", evidence: { id: "evidence-proof", subjectRef: "architecture:motion-project", evidenceRef: "outcome:outcome-proof", stance: "supports", basis: "captured-join", note: "Observed for this sample only." } }], actor: { authority: "founder", id: "jacob" } }, fx.options);
    assert.equal(result.architecture.evidenceAnnotations[0].appliedBy.authority, "founder");
  });

  it("keeps agent proposals out of current truth until a founder accepts", () => {
    const fx = fixture();
    seedAtlas(fx);
    const proposed = proposeArchitectureChange({ ventureId: fx.venture.id, baseRevision: 1, intent: "Preserve referrals", operations: [{ op: "create-element", element: { id: "concept-referral", role: "concept", name: "Referral" } }], expectedExecutionEffect: "Descriptive only", proposedBy: { authority: "agent", id: "researcher", configurationRevision: 3 } }, fx.options);
    assert.equal(proposed.revision, 1);
    assert.equal(getArchitecture(fx.venture.id, fx.options).elements.some((entry) => entry.id === "concept-referral"), false);
    const decided = decideArchitectureProposal({ ventureId: fx.venture.id, proposalId: proposed.proposal.id, decision: "accept", actor: { authority: "founder", id: "jacob" } }, fx.options);
    assert.equal(decided.revision, 2);
    assert.equal(decided.proposal.status, "accepted");
    assert.equal(decided.receipt.source, "proposal-acceptance");
    assert.equal(decided.receipt.proposalId, proposed.proposal.id);
    assert.equal(getArchitecture(fx.venture.id, fx.options).elements.some((entry) => entry.id === "concept-referral"), true);
  });

  it("validates proposal semantics before persistence", () => {
    const fx = fixture();
    seedAtlas(fx);
    assert.throws(
      () => proposeArchitectureChange({
        ventureId: fx.venture.id,
        baseRevision: 1,
        intent: "Add an ungrounded motion",
        operations: [{
          op: "create-element",
          element: {
            id: "motion-invalid",
            role: "motion",
            name: "Invalid motion",
            actor: "Buyer",
            entry: "Need",
            value: "Value",
            repeatabilityClaim: "Repeatable",
            systemIds: ["system-missing"],
            productRefs: ["loop-proof"],
          },
        }],
        proposedBy: { authority: "agent", id: "researcher" },
      }, fx.options),
      (error) => error.code === "architecture_role_invariant",
    );
    assert.equal(getArchitectureState(fx.venture.id, fx.options).proposals.length, 0);
  });

  it("refuses to apply a proposal after current architecture advances", () => {
    const fx = fixture();
    seedAtlas(fx);
    const proposed = proposeArchitectureChange({
      ventureId: fx.venture.id,
      baseRevision: 1,
      intent: "Preserve a possible partner door",
      operations: [{ op: "create-element", element: { id: "concept-partner", role: "concept", name: "Partner door" } }],
      proposedBy: { authority: "agent", id: "researcher" },
    }, fx.options);
    applyArchitectureMutations({
      ventureId: fx.venture.id,
      baseRevision: 1,
      operations: [{ op: "create-element", element: { id: "concept-newer", role: "concept", name: "Newer truth" } }],
      actor: { authority: "founder", id: "jacob" },
    }, fx.options);

    assert.throws(
      () => decideArchitectureProposal({
        ventureId: fx.venture.id,
        proposalId: proposed.proposal.id,
        decision: "accept",
        actor: { authority: "founder", id: "jacob" },
      }, fx.options),
      (error) => error.code === "architecture_stale_revision"
        && error.baseRevision === 1
        && error.currentRevision === 2,
    );
    const state = getArchitectureState(fx.venture.id, fx.options);
    assert.equal(state.proposals.find((entry) => entry.id === proposed.proposal.id).status, "pending");
    assert.equal(state.current.elements.some((entry) => entry.id === "concept-partner"), false);
  });

  it("keeps proposal creation agent-only and links a founder's partial acceptance receipt", () => {
    const fx = fixture();
    seedAtlas(fx);
    const operations = [
      { op: "create-element", element: { id: "concept-left", role: "concept", name: "Left door" } },
      { op: "create-element", element: { id: "concept-right", role: "concept", name: "Right door" } },
    ];
    assert.throws(
      () => proposeArchitectureChange({
        ventureId: fx.venture.id,
        baseRevision: 1,
        intent: "Founder bypass",
        operations,
        proposedBy: { authority: "founder", id: "jacob" },
      }, fx.options),
      (error) => error.code === "architecture_proposal_authority",
    );
    const proposed = proposeArchitectureChange({
      ventureId: fx.venture.id,
      baseRevision: 1,
      intent: "Keep one possible door",
      operations,
      proposedBy: { authority: "agent", id: "researcher" },
    }, fx.options);
    assert.throws(
      () => decideArchitectureProposal({
        ventureId: fx.venture.id,
        proposalId: proposed.proposal.id,
        decision: "accept",
        actor: { authority: "agent", id: "researcher" },
      }, fx.options),
      (error) => error.code === "architecture_authority_denied",
    );

    const decided = decideArchitectureProposal({
      ventureId: fx.venture.id,
      proposalId: proposed.proposal.id,
      decision: "partial",
      operations: [operations[0]],
      reason: "Keep the left door open for now.",
      actor: { authority: "founder", id: "jacob" },
    }, fx.options);
    assert.equal(decided.proposal.status, "partially-accepted");
    assert.equal(decided.receipt.source, "proposal-partial-acceptance");
    assert.equal(decided.receipt.proposalId, proposed.proposal.id);
    assert.equal(decided.architecture.elements.some((entry) => entry.id === "concept-left"), true);
    assert.equal(decided.architecture.elements.some((entry) => entry.id === "concept-right"), false);
  });

  it("venture isolation rejects a campaign that tries to bind another venture's bet", () => {
    const left = fixture("Left");
    const right = fixture("Right");
    assert.throws(
      () => applyArchitectureMutations({ ventureId: right.venture.id, baseRevision: 0, operations: atlasOperations({ governing: left.governing, supporting: right.supporting }), actor: { authority: "founder" } }, right.options),
      (error) => error.code === "architecture_role_invariant",
    );
  });

  it("placement deletion loses no architecture meaning", () => {
    const fx = fixture();
    seedAtlas(fx);
    setVentureDoc(fx.venture.id, "placement", "canvas", { positions: { "architecture:motion-project": { x: 10, y: 20 } }, revision: 1 }, fx.options);
    clearPlacement(fx.venture.id, fx.options);
    assert.equal(getVentureDoc(fx.venture.id, "placement", "canvas", fx.options), null);
    assert.equal(getArchitecture(fx.venture.id, fx.options).elements.length, 7);
  });

  it("transfer round-trips architecture and rejects cross-scope semantic refs", () => {
    const fx = fixture();
    seedAtlas(fx);
    const transfer = createVentureTransfer(fx.venture.id, fx.options);
    const destinationRoot = directory("drover-architecture-import-");
    const destinationRepository = directory("drover-architecture-import-repo-");
    importVentureTransfer(transfer, { root: destinationRoot, repository: destinationRepository });
    assert.equal(getArchitecture(fx.venture.id, { root: destinationRoot }).elements.length, 7);

    const poisoned = structuredClone(transfer);
    poisoned.venture.manifest.id = `${fx.venture.id}-poisoned`;
    poisoned.venture.documents.architecture[0].ventureId = "another-venture";
    assert.throws(
      () => importVentureTransfer(poisoned, { root: directory("drover-architecture-poisoned-"), repository: directory("drover-architecture-poisoned-repo-") }),
      (error) => error.code === "venture_transfer_cross_scope" && error.status === 404,
    );
  });
});
