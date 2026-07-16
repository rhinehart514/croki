// work-loop.test.mjs — F2 acceptance: a teammate drives real work through the runtime adapters
// directly, forks divergent bets, stages drafts with taste consulted, and parks an outward send at
// the wall — with zero imports from FIRM-SPEC.md's Dies list. Uses a fake Anthropic-shaped client
// (client.messages.create), the same injection convention brain/test/runtimes.test.mjs uses for the
// anthropic adapter, so selectRuntime resolves to a real adapter without touching a network or a
// subscription CLI.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { driveTeammate, getAgentDailySpend } from "../../src/firm/work-loop.mjs";
import { createVenture, getVentureDoc, listVentureDocs, setVentureDoc } from "../../src/firm/venture-store.mjs";
import { runtimeForModel } from "../../src/runtimes/index.mjs";
import { listCrew } from "../../src/firm/crew.mjs";
import { createBet } from "../../src/firm/bet.mjs";
import { listConversation } from "../../src/firm/conversation.mjs";
import { applyFirmConfiguration, getFirmConfiguration } from "../../src/firm/configuration.mjs";
import { getArchitectureState } from "../../src/firm/architecture.mjs";

function freshRoot() {
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), "firm-work-loop-")) };
}

// A fake Anthropic-shaped client: each entry in `turns` is one model turn, returned in order.
// Mirrors fakeCtx()'s client double in brain/test/runtimes.test.mjs.
function fakeClient(turns) {
  let index = 0;
  return {
    messages: {
      async create() {
        const response = turns[index];
        index += 1;
        if (!response) throw new Error("Unexpected extra model turn.");
        return response;
      },
    },
  };
}

// One model turn calling one or more tools — the anthropic adapter runs every tool_use block in a
// turn's content array before asking for the next turn, so several tool calls in the same round
// belong in one turn(), not one each.
function turn(...calls) {
  return { content: calls.map(([id, name, input = {}]) => ({ type: "tool_use", id, name, input })) };
}
function text(t) {
  return { content: [{ type: "text", text: t }] };
}

describe("driveTeammate — conversation is the real drive, not a parallel authority", () => {
  it("forms the first participant even when the untouched configuration was read before the first drive", async () => {
    const options = freshRoot();
    const venture = createVenture({ name: "First configured participant" }, options);
    assert.equal(getFirmConfiguration(venture.id, options).agents.length, 0);

    await driveTeammate({
      ventureId: venture.id,
      teammateRef: "founding-teammate",
      goal: "Find the first repeatable channel",
      options,
      deps: { client: fakeClient([text("ready")]) },
    });

    const configured = getFirmConfiguration(venture.id, options);
    assert.equal(configured.revision, 2);
    assert.equal(configured.agents[0].ref, "founding-teammate");
  });

  it("grounds the venture's first direction in exact repository evidence", async () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Repository-grounded start" }, options);
    let received;
    const runtime = {
      id: "capturing-runtime",
      label: "Capturing runtime",
      async drive(context) {
        received = context;
        return { kind: "completed", summary: "grounded" };
      },
    };

    await driveTeammate({
      ventureId: venture.id,
      teammateRef: "founding-teammate",
      goal: "Find the first useful outcome",
      options,
      deps: { runtime },
    });

    assert.match(received.system, /first direction/i);
    assert.match(received.system, /cite the exact file and line/i);
    assert.match(received.system, /fork only bets grounded in that evidence/i);
  });

  it("does not silently repopulate a founder-authored empty firm", async () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Intentionally empty firm" }, options);
    const initial = getFirmConfiguration(venture.id, options);
    applyFirmConfiguration({
      ventureId: venture.id,
      expectedRevision: initial.revision,
      configuration: { ...initial, presentation: { ...initial.presentation, collectiveLabel: "empty studio" }, agents: [] },
    }, options);

    await assert.rejects(() => driveTeammate({
      ventureId: venture.id,
      teammateRef: "uninvited",
      goal: "Join anyway",
      options,
      deps: { client: fakeClient([text("should not run")]) },
    }), /not in this venture's firm configuration/);
    assert.equal(listCrew(venture.id, options).length, 0, "a rejected participant cannot leak onto the canvas roster");
  });

  it("records founder direction, explicit speech, and a text-only runtime answer without duplication", async () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Conversation proof" }, options);
    const bet = createBet({ ventureId: venture.id, intent: "Test the sharpest segment", teammateRef: "sable" });
    setVentureDoc(venture.id, "bets", bet.id, bet, options);

    await driveTeammate({
      ventureId: venture.id,
      teammateRef: "sable",
      goal: "Find our first buyer",
      betId: bet.id,
      initiatedBy: "founder",
      options,
      deps: { client: fakeClient([
        turn(["speak-1", "speak", { betId: bet.id, text: "I found three segments worth testing." }]),
        text("done"),
      ]) },
    });

    await driveTeammate({
      ventureId: venture.id,
      teammateRef: "sable",
      goal: "Continue the bet automatically",
      betId: bet.id,
      options,
      deps: { client: fakeClient([text("continued")]) },
    });

    assert.deepEqual(listConversation(venture.id, options).map(({ role, content }) => ({ role, content })), [
      { role: "founder", content: "Find our first buyer" },
      { role: "teammate", content: "I found three segments worth testing." },
      { role: "teammate", content: "continued" },
    ]);
    const teammateMessages = listConversation(venture.id, options).filter((message) => message.role === "teammate");
    assert.equal(teammateMessages[0].runtime.id, "anthropic");
    assert.equal(teammateMessages[1].runtime.id, "anthropic");
    assert.equal(teammateMessages[1].runtime.configurationRevision, 1);
  });

  it("turns a natural-language configuration request into an unapplied, attributable proposal", async () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Configuration conversation" }, options);
    await driveTeammate({
      ventureId: venture.id,
      teammateRef: "operator",
      goal: "Treat the participants as employees and call the group a company",
      initiatedBy: "founder",
      options,
      deps: { client: fakeClient([
        turn(["config-1", "propose_firm_configuration", {
          summary: "Present the firm as a company",
          rationale: "This matches the founder's chosen frame.",
          changes: { presentation: { participant: "employee", participantLabel: "employee", collectiveLabel: "company" } },
        }]),
        text("proposed for review"),
      ]) },
    });

    const configuration = getVentureDoc(venture.id, "configuration", "firm", options);
    assert.equal(configuration.presentation.participant, "teammate", "a participant cannot apply its own proposal");
    const proposal = listVentureDocs(venture.id, "configuration", options)
      .find((doc) => doc.type === "firm-configuration-proposal");
    assert.equal(proposal.proposed.presentation.participant, "employee");
    const proposalMessage = listConversation(venture.id, options)
      .find((message) => message.kind === "configuration-proposal");
    assert.equal(proposalMessage.teammateRef, "operator");
    assert.equal(proposalMessage.configurationProposal.id, proposal.id);
  });

  it("reads current architecture before staging an unapplied whole-venture proposal", async () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Proposed venture system" }, options);
    let proposalToolResult;
    const runtime = {
      id: "architecture-proposal-runtime",
      label: "Architecture proposal runtime",
      async drive(context) {
        assert.match(context.system, /read_venture_architecture, then propose_architecture_change/i);
        await assert.rejects(
          () => context.runTool({
            name: "propose_architecture_change",
            input: { baseRevision: 0, intent: "Propose blind", operations: [{ op: "update-intent", value: { statement: "Blind" } }] },
          }),
          (error) => error.code === "architecture_not_read",
        );
        const read = await context.runTool({ name: "read_venture_architecture", input: {} });
        assert.equal(read.result.revision, 0);
        const staged = await context.runTool({
          name: "propose_architecture_change",
          input: {
            baseRevision: read.result.revision,
            intent: "Stage a grounded outbound motion for founder review",
            operations: [
              { op: "update-intent", value: { statement: "Turn product truth into qualified demand" } },
              { op: "create-element", element: { id: "system-research", role: "system", name: "Account research", does: "Grounds a possible buyer in product and market truth." } },
              { op: "create-element", element: { id: "motion-outbound", role: "motion", name: "Founder-led outbound", actor: "Founder", entry: "Qualified account", value: "Relevant conversation", repeatabilityClaim: "Grounded account research can repeatedly open relevant conversations.", systemIds: ["system-research"], productRefs: [] } },
            ],
            unresolvedAssumptions: ["The founder has not confirmed the first audience."],
            expectedExecutionEffect: "Semantic proposal only; no campaign or outward act starts.",
          },
        });
        proposalToolResult = staged.result;
        context.onText("The venture system is staged for your review; no work has started.");
        return { kind: "completed", summary: "proposal staged" };
      },
    };

    const result = await driveTeammate({
      ventureId: venture.id,
      teammateRef: "operator",
      goal: "Give this venture a founder-led outbound motion, but stage it for review",
      initiatedBy: "founder",
      options,
      deps: { runtime },
    });

    const state = getArchitectureState(venture.id, options);
    assert.equal(state.current.revision, 0);
    assert.equal(state.current.elements.length, 0);
    assert.equal(state.proposals.length, 1);
    assert.equal(state.proposals[0].id, proposalToolResult.proposalId);
    assert.equal(state.proposals[0].status, "pending");
    assert.equal(state.proposals[0].proposedBy.id, "operator");
    assert.equal(state.proposals[0].proposedBy.authority, "agent");
    assert.equal(proposalToolResult.applied, false);
    assert.deepEqual(result.consultedTools, ["read_venture_architecture", "propose_architecture_change"]);
    assert.equal(listVentureDocs(venture.id, "bets", options).length, 0);
    assert.equal(listVentureDocs(venture.id, "decisions", options).length, 0);
  });
});

describe("driveTeammate — configured participants can involve one another without a routing table", () => {
  it("returns a focused peer contribution to the caller and enforces the shared pass budget", async () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Deliberative firm" }, options);
    const initial = getFirmConfiguration(venture.id, options);
    applyFirmConfiguration({
      ventureId: venture.id,
      expectedRevision: initial.revision,
      configuration: {
        ...initial,
        coordination: {
          ...initial.coordination,
          coordinatorRef: "coordinator",
          maxPasses: 2,
          protocols: ["consult"],
        },
        agents: [
          { ref: "coordinator", name: "Coordinator", perspective: "integrates without erasing disagreement" },
          { ref: "auditor", name: "Value Auditor", perspective: "tests whether claimed value is evidenced" },
          { ref: "strategist", name: "Strategist", perspective: "tests routes to capture", activation: "relevant" },
          { ref: "writer", name: "Writer", activation: "direct" },
          { ref: "sentinel", name: "Sentinel", activation: "watch" },
        ],
      },
    }, options);

    let returnedContribution;
    let strategistRan = false;
    const runtime = {
      id: "deliberation-runtime",
      label: "Deliberation runtime",
      async drive(context) {
        if (context.system.includes("You are Value Auditor")) {
          assert.match(context.system, /requested by coordinator using consult/i);
          context.onText("The value claim needs independent evidence before it can carry the decision.");
          return { kind: "completed", summary: "evidence needed" };
        }
        if (context.system.includes("You are Strategist")) {
          strategistRan = true;
          return { kind: "completed", summary: "should not run" };
        }
        assert.match(context.system, /Other configured participants: Value Auditor/);
        const involvement = context.tools.find((tool) => tool.name === "involve_participant");
        assert.ok(involvement);
        assert.deepEqual(
          involvement.input_schema.properties.targetRef.enum.sort(),
          ["auditor", "strategist"],
          "direct-only and dormant watch participants are not silently auto-involved",
        );
        const first = await context.runTool({
          name: "involve_participant",
          input: {
            targetRef: "auditor",
            protocol: "consult",
            question: "Is the current value claim evidenced strongly enough?",
          },
        });
        returnedContribution = first.result;
        await assert.rejects(() => context.runTool({
          name: "involve_participant",
          input: {
            targetRef: "strategist",
            protocol: "consult",
            question: "Can we capture the value?",
          },
        }), /used its configured 2 coordination passes/);
        context.onText(`I incorporated the audit: ${first.result.contribution}`);
        return { kind: "completed", summary: "coordinated" };
      },
    };

    const result = await driveTeammate({
      ventureId: venture.id,
      teammateRef: "coordinator",
      goal: "Examine the current value model",
      initiatedBy: "founder",
      options,
      deps: { runtime },
    });

    assert.equal(returnedContribution.participantRef, "auditor");
    assert.equal(returnedContribution.protocol, "consult");
    assert.match(returnedContribution.contribution, /needs independent evidence/);
    assert.equal(returnedContribution.passesUsed, 2);
    assert.equal(returnedContribution.passesRemaining, 0);
    assert.equal(strategistRan, false, "the host refuses a pass beyond the configured budget before runtime dispatch");
    assert.equal(result.messages.length, 1, "the coordinator does not claim the consulted participant's message");
    assert.equal(result.messages[0].teammateRef, "coordinator");

    const messages = listConversation(venture.id, options);
    const audit = messages.find((message) => message.teammateRef === "auditor");
    assert.equal(audit.runtime.id, "deliberation-runtime");
    assert.deepEqual(audit.coordination, {
      requestedBy: "coordinator",
      protocol: "consult",
      question: "Is the current value claim evidenced strongly enough?",
    });
    assert.match(messages.at(-1).content, /incorporated the audit/);
  });

  it("keeps watch participants dormant until an enabled watch interaction wakes them", async () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Watch activation" }, options);
    const initial = getFirmConfiguration(venture.id, options);
    applyFirmConfiguration({
      ventureId: venture.id,
      expectedRevision: initial.revision,
      configuration: {
        ...initial,
        coordination: { ...initial.coordination, maxPasses: 2, protocols: ["consult", "watch"] },
        agents: [
          { ref: "coordinator", name: "Coordinator", activation: "direct" },
          { ref: "sentinel", name: "Sentinel", activation: "watch" },
        ],
      },
    }, options);

    let sentinelRuns = 0;
    const runtime = {
      id: "watch-runtime",
      label: "Watch runtime",
      async drive(context) {
        if (context.system.includes("You are Sentinel")) {
          sentinelRuns += 1;
          context.onText("The watched condition is now relevant.");
          return { kind: "completed", summary: "watch fired" };
        }
        await assert.rejects(() => context.runTool({
          name: "involve_participant",
          input: { targetRef: "sentinel", protocol: "consult", question: "Wake without the watch condition" },
        }), /dormant.*watch protocol/i);
        const watched = await context.runTool({
          name: "involve_participant",
          input: { targetRef: "sentinel", protocol: "watch", question: "The configured condition is relevant" },
        });
        context.onText(watched.result.contribution);
        return { kind: "completed", summary: "watch incorporated" };
      },
    };

    await driveTeammate({
      ventureId: venture.id,
      teammateRef: "coordinator",
      goal: "Check the standing watch only if relevant",
      options,
      deps: { runtime },
    });

    assert.equal(sentinelRuns, 1);
    const message = listConversation(venture.id, options).find((entry) => entry.teammateRef === "sentinel");
    assert.equal(message.coordination.protocol, "watch");
  });

  it("keeps a caller runtime override local while the involved participant uses its own configured runtime", async () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Cross-runtime deliberation" }, options);
    const initial = getFirmConfiguration(venture.id, options);
    applyFirmConfiguration({
      ventureId: venture.id,
      expectedRevision: initial.revision,
      configuration: {
        ...initial,
        coordination: { ...initial.coordination, maxPasses: 2, protocols: ["consult"] },
        agents: [
          { ref: "coordinator", name: "Coordinator", runtime: { provider: "codex" } },
          { ref: "auditor", name: "Auditor", runtime: { provider: "codex" } },
        ],
      },
    }, options);

    const selections = [];
    const claude = {
      id: "claude-code",
      label: "Claude Code (test)",
      costReporting: "usd",
      async drive(context) {
        const consulted = await context.runTool({
          name: "involve_participant",
          input: { targetRef: "auditor", protocol: "consult", question: "Check this independently" },
        });
        context.onText(`Coordinator received: ${consulted.result.contribution}`);
        return { kind: "completed", summary: "integrated" };
      },
    };
    const codex = {
      id: "codex",
      label: "Codex (test)",
      async drive(context) {
        context.onText("Codex supplied the independent audit.");
        return { kind: "completed", summary: "audited" };
      },
    };
    const runtimeById = { "claude-code": claude, codex };
    const selectRuntime = ({ forced }) => {
      selections.push(forced);
      return { adapter: runtimeById[forced], auth: forced === "codex" ? "chatgpt-login" : "oauth-login" };
    };

    const result = await driveTeammate({
      ventureId: venture.id,
      teammateRef: "coordinator",
      goal: "Use the selected Claude runtime, then consult the configured auditor",
      runtime: "claude-code",
      options,
      deps: { selectRuntime },
    });

    assert.deepEqual(selections, ["claude-code", "codex"]);
    assert.equal(result.runtime.id, "claude-code");
    const messages = listConversation(venture.id, options);
    assert.equal(messages.find((message) => message.teammateRef === "auditor").runtime.id, "codex");
    assert.equal(messages.find((message) => message.teammateRef === "auditor").runtime.auth, "chatgpt-login");
    assert.equal(messages.at(-1).runtime.id, "claude-code");
    assert.equal(messages.at(-1).runtime.auth, "oauth-login");
  });
});

describe("driveTeammate — forks divergent bets, stages drafts, parks an outward send", () => {
  it("forks two bets with distinct intents, stages a draft on each (taste consulted first), and parks one outward send", async () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Work loop acceptance" }, options);
    const parked = [];

    const client = fakeClient([
      turn(
        ["t1", "get_taste", { question: "cold outbound" }],
        ["t2", "fork_bet", { intent: "cold email to ops leads" }],
        ["t3", "fork_bet", { intent: "LinkedIn DM to ops leads" }],
      ),
      text("diverged into two genuinely different angles"),
    ]);

    const outcome1 = await driveTeammate({
      ventureId: venture.id,
      teammateRef: "outreach-writer",
      goal: "Land the first pilot for LocalSeoData",
      options,
      deps: { client },
    });
    assert.equal(outcome1.outcome.kind, "completed");
    assert.equal(outcome1.handoff.kind, "handoff");
    assert.equal(outcome1.handoff.role, "system");
    assert.equal(outcome1.handoff.changes.openedBetIds.length, 2);
    assert.equal(listCrew(venture.id, options)[0].ref, "outreach-writer", "driving a new ref summons it onto the crew");

    const bets = listVentureDocs(venture.id, "bets", options);
    assert.equal(bets.length, 2, "two divergent bets were forked");
    const intents = bets.map((b) => b.intent).sort();
    assert.deepEqual(intents, ["LinkedIn DM to ops leads", "cold email to ops leads"]);
    assert.ok(bets.every((b) => b.forkedFrom === null), "both are fresh forks from the goal, not chained to each other");
    assert.ok(bets.every((b) => b.configurationRevision === 1), "each bet records the firm definition that produced it");

    // Stage a draft on each bet (a second drive per bet), taste consulted first in the SAME turn as
    // the stage_artifact call.
    for (const bet of bets) {
      const stageClient = fakeClient([
        turn(
          ["s1", "get_taste", {}],
          ["s2", "stage_artifact", { betId: bet.id, content: "Hey — noticed your team is scaling ops..." }],
        ),
        text("staged"),
      ]);
      const staged = await driveTeammate({
        ventureId: venture.id,
        teammateRef: "outreach-writer",
        goal: "Draft outreach for this bet",
        betId: bet.id,
        options,
        deps: { client: stageClient },
      });
      assert.equal(staged.outcome.kind, "completed");
    }

    const restaged = listVentureDocs(venture.id, "bets", options);
    for (const bet of restaged) {
      assert.equal(bet.staged.length, 1, `bet ${bet.id} carries exactly one staged draft`);
      assert.equal(bet.staged[0].configurationRevision, 1);
    }

    // Park one outward send at the wall via an injected park() double — never executes.
    const outwardClient = fakeClient([
      turn(
        ["o1", "get_taste", {}],
        ["o2", "stage_outward", { betId: restaged[0].id, effect: { external: true } }],
      ),
      text("parked at the wall"),
    ]);
    const outwardResult = await driveTeammate({
      ventureId: venture.id,
      teammateRef: "outreach-writer",
      goal: "Send the outreach",
      betId: restaged[0].id,
      options,
      deps: {
        client: outwardClient,
        park: async (item) => { parked.push(item); return { id: "queue-1", ...item }; },
      },
    });
    assert.equal(outwardResult.outcome.kind, "paused");
    assert.equal(parked.length, 1, "exactly one outward effect reached the wall queue");
    assert.equal(parked[0].betId, restaged[0].id);
    assert.equal(parked[0].configurationRevision, 1);
    assert.equal(parked[0].effect.external, true);
  });
});

describe("driveTeammate — a staged draft that never consulted taste is refused", () => {
  it("stage_artifact throws when get_taste was never called first, and stages nothing", async () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Consult guard" }, options);
    const client = fakeClient([turn(["b1", "fork_bet", { intent: "cold outbound to fintech ops" }]), text("forked")]);
    await driveTeammate({
      ventureId: venture.id,
      teammateRef: "outreach-writer",
      goal: "Try cold outbound",
      options,
      deps: { client },
    });
    const [bet] = listVentureDocs(venture.id, "bets", options);
    assert.ok(bet);

    // A second drive stages a draft WITHOUT ever calling get_taste first.
    const badClient = fakeClient([
      turn(["s1", "stage_artifact", { betId: bet.id, content: "no taste consulted" }]),
      text("tried to stage without consulting taste"),
    ]);
    await driveTeammate({
      ventureId: venture.id,
      teammateRef: "outreach-writer",
      goal: "Stage without consulting taste",
      betId: bet.id,
      options,
      deps: { client: badClient },
    });
    // The tool call throws inside runTool; the anthropic adapter records that as a tool error and
    // keeps going rather than crashing the drive — assert the bet stayed unstaged and the refusal
    // was recorded, not silently swallowed.
    const reloaded = getVentureDoc(venture.id, "bets", bet.id, options);
    assert.equal((reloaded.staged ?? []).length, 0, "no draft was staged — the consult guard refused it");
    const events = reloaded.events ?? [];
    assert.ok(
      events.some((e) => e.type === "tool_failed" && /moat|taste/i.test(e.detail)),
      "the refusal is recorded as a tool failure event",
    );
  });
});

describe("driveTeammate — tool names matching FORBIDDEN_TOOL are refused at the seam", () => {
  it("the real firm tool set carries nothing FORBIDDEN_TOOL matches, and the seam refuses one that would", async () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Tool safety" }, options);
    const { buildToolSet } = await import("../../src/firm/work-loop-tools.mjs");
    const taste = await import("../../src/firm/taste.mjs");
    const ventureStore = await import("../../src/firm/venture-store.mjs");
    assert.doesNotThrow(() => buildToolSet({
      ventureId: venture.id, teammateRef: "x", options, taste, ventureStore, deps: {},
    }), "the real firm tool set carries no forbidden-shaped name today");

    // Prove the seam itself refuses a forbidden-shaped name if one ever appeared.
    const { filterSafeTools } = await import("../../src/tool-safety.mjs");
    assert.throws(() => filterSafeTools([{ name: "send_outreach" }]), /outbound\/approval verb/);
    assert.throws(() => filterSafeTools([{ name: "approve_bet" }]), /outbound\/approval verb/);
  });

  it("enforces configured capability and authority restrictions at the host tool boundary", async () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Configured tool boundary" }, options);
    await driveTeammate({
      ventureId: venture.id,
      teammateRef: "auditor",
      goal: "Initialize",
      options,
      deps: { client: fakeClient([text("initialized")]) },
    });
    const current = getFirmConfiguration(venture.id, options);
    applyFirmConfiguration({
      ventureId: venture.id,
      expectedRevision: current.revision,
      configuration: {
        ...current,
        authority: { outwardEffects: "blocked" },
        agents: current.agents.map((agent) => ({
          ...agent,
          capabilities: { firmTools: true, additional: ["verification"] },
          authority: { outwardEffects: "blocked" },
        })),
      },
    }, options);
    let toolNames;
    const runtime = {
      id: "capturing-runtime",
      label: "Capturing runtime",
      async drive(context) {
        toolNames = context.tools.map((tool) => tool.name);
        return { kind: "completed", summary: "inspected" };
      },
    };
    await driveTeammate({
      ventureId: venture.id,
      teammateRef: "auditor",
      goal: "Inspect available capabilities",
      options,
      deps: { runtime },
    });

    assert.equal(toolNames.includes("stage_outward"), false, "blocked authority removes even the wall-staging tool");
    assert.equal(toolNames.includes("read_truth"), true);
    assert.equal(toolNames.includes("verification"), false, "a configured label cannot manufacture a host capability");
  });
});

describe("driveTeammate — resume: a paused drive resumes from runtimeSessionId state only", () => {
  it("persists runtimeSessionId/stepCount/spentUsd/pausedFor on pause, and resumes from exactly that", async () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Resume" }, options);
    const client = fakeClient([turn(["f1", "fork_bet", { intent: "try a cold call" }]), text("forked")]);
    await driveTeammate({ ventureId: venture.id, teammateRef: "closer", goal: "Try a cold call", options, deps: { client } });
    const bet = listVentureDocs(venture.id, "bets", options)[0];

    // Exhaust the step budget mid-goal — the honest "budget" pause kind (a real founder-facing pause
    // would come from stage_outward/ask_founder parking; either way the resume contract is the same:
    // only the persisted work record carries state across the pause).
    const pausingClient = fakeClient([turn(["g1", "get_taste", {}])]);
    const drive1 = await driveTeammate({
      ventureId: venture.id,
      teammateRef: "closer",
      goal: "Stage a draft",
      betId: bet.id,
      options,
      deps: { client: pausingClient, maxSteps: 1 },
    });
    assert.equal(drive1.outcome.kind, "budget");
    const afterFirst = getVentureDoc(venture.id, "bets", bet.id, options);
    assert.equal(afterFirst.work.stepCount, 1, "step count persisted across the pause");

    // Resume: a fresh client sees a fresh conversation (initialMessages is always null in this loop),
    // proving resume rides on the persisted work record rather than any replayed transcript.
    const resumeClient = fakeClient([text("done after resume")]);
    const drive2 = await driveTeammate({
      ventureId: venture.id,
      teammateRef: "closer",
      goal: "Stage a draft",
      betId: bet.id,
      options,
      deps: { client: resumeClient },
    });
    assert.equal(drive2.outcome.kind, "completed");
    const afterResume = getVentureDoc(venture.id, "bets", bet.id, options);
    assert.equal(afterResume.work.stepCount, 2, "the step count continued from where it paused, not reset to 0");
    assert.equal(afterResume.work.pausedFor, null, "a completed drive clears the pause marker");
  });

  it("carries the new founder direction and the prior pause context into a resumed conversation", async () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Directed resume" }, options);
    const client = fakeClient([turn(["f1", "fork_bet", { intent: "test the first angle" }]), text("forked")]);
    await driveTeammate({ ventureId: venture.id, teammateRef: "operator", goal: "Find an angle", options, deps: { client } });
    const bet = listVentureDocs(venture.id, "bets", options)[0];
    setVentureDoc(venture.id, "bets", bet.id, {
      ...bet,
      work: {
        runtimeSessionId: "capturing-runtime:session-1",
        stepCount: 1,
        spentUsd: 0,
        pausedFor: "Waiting for the founder's answer.",
      },
    }, options);

    let received;
    const runtime = {
      id: "capturing-runtime",
      label: "Capturing runtime",
      async drive(ctx) {
        received = ctx;
        return { kind: "completed", summary: "redirected" };
      },
    };
    await driveTeammate({
      ventureId: venture.id,
      teammateRef: "operator",
      goal: "Lead with the operational pain instead",
      betId: bet.id,
      options,
      deps: { runtime },
    });

    assert.equal(received.runtimeSessionId, "session-1");
    assert.match(received.resumePrompt, /Prior pause context: Waiting for the founder's answer\./);
    assert.match(received.resumePrompt, /New founder direction: Lead with the operational pain instead/);
  });
});

describe("driveTeammate — runtimeForModel routes unchanged", () => {
  it("gpt-* routes to codex and claude-* routes to claude-code (existing behavior untouched)", () => {
    assert.equal(runtimeForModel("gpt-5.5-codex"), "codex");
    assert.equal(runtimeForModel("claude-opus-4-8"), "claude-code");
    assert.equal(runtimeForModel("unknown-model"), null);
  });
});

describe("driveTeammate — runtime identity is not a model name", () => {
  it("treats a legacy claude-code model value as a runtime selection and keeps model Auto", async () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Legacy runtime value" }, options);
    let received;
    const runtime = {
      id: "capturing-runtime",
      label: "Capturing runtime",
      async drive(context) {
        received = context;
        return { kind: "completed", summary: "normalized" };
      },
    };
    await driveTeammate({
      ventureId: venture.id,
      teammateRef: "operator",
      goal: "Use the available runtime",
      model: "claude-code",
      options,
      deps: { runtime },
    });
    assert.equal(received.model, null);
  });

  it("leaves the model unset when Auto selects a local runtime", async () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Runtime identity" }, options);
    let received;
    const runtime = {
      id: "fake-local",
      label: "Fake local",
      async drive(ctx) {
        received = ctx;
        return { kind: "completed", summary: "done" };
      },
    };
    const result = await driveTeammate({
      ventureId: venture.id,
      teammateRef: "operator",
      goal: "Find a useful bet",
      options,
      deps: { runtime },
    });
    assert.equal(received.model, null);
    assert.equal(received.cwd, venture.repository);
    assert.equal(result.runtime.id, "fake-local");
  });

  it("binds the configured model and step budget and returns the actual runtime provenance", async () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Configured runtime" }, options);
    const initialDrive = await driveTeammate({
      ventureId: venture.id,
      teammateRef: "operator",
      goal: "Initialize",
      options,
      deps: { client: fakeClient([text("initialized")]) },
    });
    const current = getFirmConfiguration(venture.id, options);
    applyFirmConfiguration({
      ventureId: venture.id,
      expectedRevision: current.revision,
      configuration: {
        ...current,
        organization: { ...current.organization, instructions: "The auditor advises the synthesizer with evidence." },
        coordination: { ...current.coordination, mode: "adaptive panel" },
        agents: current.agents.map((agent) => agent.ref === "operator" ? {
          ...agent,
          capabilities: { ...agent.capabilities, additional: ["independent verification"] },
          context: { ...agent.context, instructions: "Ground claims in the current venture." },
          memory: { ...agent.memory, instructions: "Carry forward only observed lessons." },
          runtime: { provider: null, model: "gpt-5.5-codex" },
          budget: { ...agent.budget, maxSteps: 37 },
          evaluation: {
            signals: ["uncertainty reduced"],
            instructions: "State what evidence would change the conclusion.",
          },
        } : agent),
      },
    }, options);
    let received;
    const runtime = {
      id: "real-adapter-id",
      label: "Real adapter label",
      async drive(context) {
        received = context;
        return { kind: "completed", summary: "configured" };
      },
    };

    const result = await driveTeammate({
      ventureId: venture.id,
      teammateRef: "operator",
      goal: "Use the configured runtime settings",
      options,
      deps: { runtime },
    });

    assert.equal(initialDrive.runtime.configurationRevision, 1);
    assert.equal(received.model, "gpt-5.5-codex");
    assert.equal(received.maxSteps, 37);
    assert.match(received.system, /configured capabilities: independent verification/i);
    assert.match(received.system, /auditor advises the synthesizer with evidence/i);
    assert.match(received.system, /Coordination mode: adaptive panel/i);
    assert.match(received.system, /Ground claims in the current venture/i);
    assert.match(received.system, /Carry forward only observed lessons/i);
    assert.match(received.system, /Evaluate the work against: uncertainty reduced/i);
    assert.match(received.system, /State what evidence would change the conclusion/i);
    assert.deepEqual(result.runtime, {
      id: "real-adapter-id",
      label: "Real adapter label",
      auth: null,
      model: "gpt-5.5-codex",
      configurationRevision: 2,
    });
  });
});

describe("driveTeammate — configured daily spend is a host-enforced rail", () => {
  async function configuredVenture(cap) {
    const options = freshRoot();
    const venture = createVenture({ name: "Agent budget" }, options);
    await driveTeammate({
      ventureId: venture.id,
      teammateRef: "operator",
      goal: "Initialize",
      options,
      deps: { client: fakeClient([text("initialized")]) },
    });
    const current = getFirmConfiguration(venture.id, options);
    applyFirmConfiguration({
      ventureId: venture.id,
      expectedRevision: current.revision,
      configuration: {
        ...current,
        agents: current.agents.map((agent) => agent.ref === "operator" ? {
          ...agent,
          budget: { ...agent.budget, dailySpendUsd: cap },
        } : agent),
      },
    }, options);
    return { options, venture };
  }

  it("passes the remaining configured dollars to a reporting runtime and persists real cost", async () => {
    const { options, venture } = await configuredVenture(0.4);
    const seen = [];
    const runtime = {
      id: "metered",
      label: "Metered",
      costReporting: "usd",
      async drive(ctx) {
        seen.push(ctx.maxBudgetUsd);
        ctx.onCost(seen.length === 1 ? 0.3 : 0.1);
        return { kind: "completed", summary: "done" };
      },
    };

    await driveTeammate({ ventureId: venture.id, teammateRef: "operator", goal: "First", options, deps: { runtime } });
    await driveTeammate({ ventureId: venture.id, teammateRef: "operator", goal: "Second", options, deps: { runtime } });

    assert.ok(Math.abs(seen[0] - 0.4) < 1e-9);
    assert.ok(Math.abs(seen[1] - 0.1) < 1e-9);
    assert.ok(Math.abs(getAgentDailySpend(venture.id, "operator", { options }).spentUsd - 0.4) < 1e-9);
    await assert.rejects(
      driveTeammate({ ventureId: venture.id, teammateRef: "operator", goal: "Third", options, deps: { runtime } }),
      (error) => error?.code === "agent_daily_spend_exhausted" && error?.status === 409,
    );
    assert.equal(seen.length, 2, "the host refuses the drive before invoking the runtime");
  });

  it("charges a conservative estimate for an unmeasured runtime and resets on the next UTC day", async () => {
    const { options, venture } = await configuredVenture(0.25);
    let calls = 0;
    const runtime = {
      id: "unmeasured",
      label: "Unmeasured",
      async drive() {
        calls += 1;
        return { kind: "completed", summary: "done" };
      },
    };
    const dayOne = Date.parse("2026-07-14T12:00:00Z");
    const dayTwo = Date.parse("2026-07-15T00:01:00Z");

    await driveTeammate({ ventureId: venture.id, teammateRef: "operator", goal: "First", options, deps: { runtime, nowMs: dayOne } });
    assert.equal(getAgentDailySpend(venture.id, "operator", { options, nowMs: dayOne }).spentUsd, 0.25);
    await assert.rejects(
      driveTeammate({ ventureId: venture.id, teammateRef: "operator", goal: "Second", options, deps: { runtime, nowMs: dayOne } }),
      /configured \$0\.25 daily spend limit/,
    );
    await driveTeammate({ ventureId: venture.id, teammateRef: "operator", goal: "Next day", options, deps: { runtime, nowMs: dayTwo } });

    assert.equal(calls, 2);
    assert.equal(getAgentDailySpend(venture.id, "operator", { options, nowMs: dayTwo }).spentUsd, 0.25);
  });

  it("accounts for reported cost even when the provider turn fails", async () => {
    const { options, venture } = await configuredVenture(0.2);
    let calls = 0;
    const runtime = {
      id: "metered-failure",
      label: "Metered failure",
      costReporting: "usd",
      async drive(ctx) {
        calls += 1;
        ctx.onCost(0.2);
        throw new Error("provider failed after billing");
      },
    };

    await assert.rejects(
      driveTeammate({ ventureId: venture.id, teammateRef: "operator", goal: "First", options, deps: { runtime } }),
      /provider failed after billing/,
    );
    assert.equal(getAgentDailySpend(venture.id, "operator", { options }).spentUsd, 0.2);
    await assert.rejects(
      driveTeammate({ ventureId: venture.id, teammateRef: "operator", goal: "Retry", options, deps: { runtime } }),
      (error) => error?.code === "agent_daily_spend_exhausted",
    );
    assert.equal(calls, 1);
  });
});
