import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { describe, it } from "node:test";

import { getArchitectureState } from "../../src/firm/architecture.mjs";
import { proposeArchitectureChange } from "../../src/firm/architecture-proposals.mjs";
import { acceptSystemProposal } from "../../src/firm/architecture-system-assembly.mjs";
import { buildArchitectureWorkLoopTools } from "../../src/firm/architecture-work-loop-tools.mjs";
import { listConversation } from "../../src/firm/conversation.mjs";
import { createVenture, listVentureDocs, setVentureDoc } from "../../src/firm/venture-store.mjs";

function fixture() {
  const options = { root: fs.mkdtempSync(path.join(os.tmpdir(), "drover-system-assembly-")) };
  const venture = createVenture({ name: "Whole system", repository: process.cwd() }, options);
  return { options, venture };
}

function systemOperations(campaignCount = 5) {
  const operations = [
    { op: "create-element", element: { id: "system-research", role: "system", name: "Account research", does: "Grounds outreach in a buyer's real context." } },
    ...["plg", "outbound", "partners"].map((id) => ({
      op: "create-element",
      element: {
        id: `motion-${id}`,
        role: "motion",
        name: `${id} motion`,
        actor: "Founder",
        entry: "A grounded opening",
        value: "A useful conversation",
        repeatabilityClaim: "The opening can be repeated while its evidence remains true.",
        systemIds: ["system-research"],
        productRefs: [],
      },
    })),
  ];
  for (let index = 0; index < campaignCount; index += 1) {
    const motionId = ["motion-plg", "motion-outbound", "motion-partners"][index % 3];
    operations.push({
      op: "create-element",
      element: {
        id: `campaign-${index + 1}`,
        role: "campaign",
        name: `Campaign ${index + 1}`,
        audience: `Audience ${index + 1}`,
        objective: `Learn whether opening ${index + 1} earns a response`,
        primaryMotionId: motionId,
        motionIds: [motionId],
        governingBetSeed: `Opening ${index + 1} earns a useful response from its named audience`,
        supportingBetIds: [],
        measurement: { observation: "A response in the audience's own language", window: "Within fourteen days" },
      },
    });
  }
  return operations;
}

describe("whole-system proposal acceptance", () => {
  it("keeps a multi-motion proposal ghosted, then creates every governing bet in one compensated acceptance", () => {
    const { options, venture } = fixture();
    const proposed = proposeArchitectureChange({
      ventureId: venture.id,
      baseRevision: 0,
      intent: "Stage three motions and five campaigns",
      operations: systemOperations(),
      proposedBy: { authority: "agent", id: "operator", configurationRevision: 4 },
    }, options);

    assert.equal(proposed.proposal.status, "pending");
    assert.equal(listVentureDocs(venture.id, "bets", options).length, 0);
    assert.equal(getArchitectureState(venture.id, options).current.revision, 0);

    const accepted = acceptSystemProposal({
      ventureId: venture.id,
      proposalId: proposed.proposal.id,
      actor: { authority: "founder", id: "jacob" },
    }, options);

    assert.equal(accepted.revision, 1);
    assert.equal(accepted.receipt.source, "proposal-system-acceptance");
    assert.equal(accepted.proposal.status, "accepted");
    assert.equal(accepted.atomicity, "compensated-acceptance");
    assert.equal(accepted.bets.length, 5);
    assert.equal(accepted.campaigns.length, 5);
    assert.equal(listVentureDocs(venture.id, "bets", options).length, 5);
    assert.ok(accepted.campaigns.every((campaign) => accepted.bets.some((bet) => bet.id === campaign.governingBetId)));
    assert.ok(accepted.bets.every((bet) => bet.staged.length === 0));
    assert.equal(listVentureDocs(venture.id, "decisions", options).length, 0);
    const state = getArchitectureState(venture.id, options);
    assert.equal(state.revisions.length, 1, "the whole system is one architecture receipt");
    assert.equal(state.storageRevision, 2, "proposal decision and architecture revision share the acceptance CAS");
  });

  it("compensates every already persisted bet when acceptance cannot finish", () => {
    const { options, venture } = fixture();
    const proposed = proposeArchitectureChange({
      ventureId: venture.id,
      baseRevision: 0,
      intent: "Stage a system that will hit a persistence refusal",
      operations: systemOperations(3),
      proposedBy: { authority: "agent", id: "operator" },
    }, options);
    let persisted = 0;
    assert.throws(() => acceptSystemProposal({
      ventureId: venture.id,
      proposalId: proposed.proposal.id,
      actor: { authority: "founder", id: "jacob" },
    }, options, {
      persistBet(bet) {
        persisted += 1;
        if (persisted === 3) throw new Error("injected bet-store refusal");
        setVentureDoc(venture.id, "bets", bet.id, bet, options);
      },
    }), /injected bet-store refusal/);

    assert.equal(listVentureDocs(venture.id, "bets", options).length, 0);
    const state = getArchitectureState(venture.id, options);
    assert.equal(state.current.revision, 0);
    assert.equal(state.proposals[0].status, "pending");
  });

  it("reuses untouched seeded bets after process death and cannot mint duplicates on retry", () => {
    const { options, venture } = fixture();
    const proposed = proposeArchitectureChange({
      ventureId: venture.id,
      baseRevision: 0,
      intent: "Stage a crash-safe five-campaign system",
      operations: systemOperations(),
      proposedBy: { authority: "agent", id: "operator", configurationRevision: 4 },
    }, options);
    const serviceUrl = pathToFileURL(path.resolve("src/firm/architecture-system-assembly.mjs")).href;
    const storeUrl = pathToFileURL(path.resolve("src/firm/venture-store.mjs")).href;
    const crashed = spawnSync(process.execPath, ["--input-type=module", "-e", `
      import { acceptSystemProposal } from ${JSON.stringify(serviceUrl)};
      import { setVentureDoc } from ${JSON.stringify(storeUrl)};
      const options = { root: process.env.CRASH_ROOT };
      let persisted = 0;
      acceptSystemProposal({
        ventureId: process.env.CRASH_VENTURE_ID,
        proposalId: process.env.CRASH_PROPOSAL_ID,
        actor: { authority: "founder", id: "jacob" },
      }, options, {
        persistBet(bet) {
          setVentureDoc(process.env.CRASH_VENTURE_ID, "bets", bet.id, bet, options);
          persisted += 1;
          if (persisted === 5) process.exit(91);
        },
      });
    `], {
      cwd: path.resolve("."),
      env: {
        ...process.env,
        CRASH_ROOT: options.root,
        CRASH_VENTURE_ID: venture.id,
        CRASH_PROPOSAL_ID: proposed.proposal.id,
      },
      encoding: "utf8",
    });
    assert.equal(crashed.status, 91, crashed.stderr);

    const afterCrash = listVentureDocs(venture.id, "bets", options);
    assert.equal(afterCrash.length, 5);
    assert.equal(getArchitectureState(venture.id, options).current.revision, 0);
    const crashedIds = new Set(afterCrash.map((bet) => bet.id));

    const accepted = acceptSystemProposal({
      ventureId: venture.id,
      proposalId: proposed.proposal.id,
      actor: { authority: "founder", id: "jacob" },
    }, options);

    const afterRetry = listVentureDocs(venture.id, "bets", options);
    assert.equal(afterRetry.length, 5, "retry must not mint a second governing bet for any campaign");
    assert.deepEqual(new Set(afterRetry.map((bet) => bet.id)), crashedIds);
    assert.deepEqual(new Set(accepted.bets.map((bet) => bet.id)), crashedIds);
    for (const bet of afterRetry) {
      assert.equal(bet.refs.length, 1);
      assert.equal(bet.refs[0].type, "architecture-system-acceptance");
      assert.deepEqual(JSON.parse(bet.refs[0].id), [proposed.proposal.id, bet.campaignId]);
      assert.equal(bet.staged.length, 0);
      assert.equal(bet.evidence.length, 0);
    }
    const state = getArchitectureState(venture.id, options);
    assert.equal(state.current.revision, 1);
    assert.equal(state.revisions.length, 1);
    assert.equal(state.proposals[0].status, "accepted");
  });
});

describe("proposal assembly receipts", () => {
  it("appends one ordered validated-operation batch after whole-list validation", async () => {
    const { options, venture } = fixture();
    const consultedNames = new Set();
    const tools = buildArchitectureWorkLoopTools({
      ventureId: venture.id,
      teammateRef: "operator",
      configurationRevision: 3,
      options,
      consultedNames,
      trackCall(name) { consultedNames.add(name); },
    });
    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    await byName.get("read_venture_architecture").run();
    const operations = systemOperations(1);
    const result = await byName.get("propose_architecture_change").run({
      baseRevision: 0,
      intent: "Stage one bounded campaign",
      operations,
    });
    const [message] = listConversation(venture.id, options);
    assert.equal(message.kind, "proposal-assembly");
    assert.equal(message.proposalAssembly.proposalId, result.proposalId);
    assert.equal(message.proposalAssembly.events.length, operations.length);
    assert.deepEqual(message.proposalAssembly.events.map((event) => event.operationIndex), operations.map((_, index) => index));
    assert.ok(message.proposalAssembly.events.every((event) => event.validated && !Number.isNaN(Date.parse(event.at))));
    assert.equal(result.assemblyEvents.length, operations.length);
  });

  it("emits no validated assembly receipt when the whole operation list is invalid", async () => {
    const { options, venture } = fixture();
    const consultedNames = new Set();
    const tools = buildArchitectureWorkLoopTools({
      ventureId: venture.id,
      teammateRef: "operator",
      configurationRevision: 1,
      options,
      consultedNames,
      trackCall(name) { consultedNames.add(name); },
    });
    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    await byName.get("read_venture_architecture").run();
    await assert.rejects(() => byName.get("propose_architecture_change").run({
      baseRevision: 0,
      intent: "Invalid partial assembly",
      operations: [
        { op: "create-element", element: { id: "concept-valid", role: "concept", name: "Valid first operation" } },
        { op: "create-element", element: { id: "motion-invalid", role: "motion", name: "Invalid", actor: "A", entry: "E", value: "V", repeatabilityClaim: "R", systemIds: ["missing"], productRefs: [] } },
      ],
    }), (error) => error.code === "architecture_role_invariant");
    assert.deepEqual(listConversation(venture.id, options), []);
  });
});
