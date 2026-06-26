// Live spine smoke test — the credential-gated proof of checks 2, 3, 4 running for real.
//
// The rest of the suite drives composition and agent steps with FAKES, which keeps CI green
// while leaving the actual product claim — the model composes the graph, an agent step runs
// live on the founder's subscription, and the run stops at the founder gate — unproven. This
// file is that proof, isolated behind a credential switch so it never runs (or spends) by
// accident.
//
//   GTM_LIVE=1 npm --prefix brain run test:live
//
// With GTM_LIVE unset (the default, including normal `npm test`) every case is SKIPPED, so the
// suite stays green and offline. The founder turns it on only when signed into the subscription
// — exactly the credential decision the build loop is told to stop at.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createClaudeComposer } from "../src/composition.mjs";
import { composeGraphForChannel } from "../src/workflow-composer.mjs";
import { runGraph } from "../src/graph.mjs";
import { liveStepRuntime } from "../src/agent-bridge.mjs";
import { claudeCodeRuntime } from "../src/runtimes/claude-code.mjs";

// Founder-controlled switch. We gate on an explicit opt-in rather than sniffing for a token,
// because a subscription login can live in the macOS keychain with no env var or creds file —
// sniffing would false-skip a signed-in founder and could false-run a spend. GTM_LIVE=1 means
// "I am signed in and I want the real call." The agent bridge is OAuth-first and strips any raw
// key, so a live run bills the subscription.
const LIVE = !!process.env.GTM_LIVE;
const cwd = process.cwd();

describe("live spine — model composes, agent runs on the subscription, gate holds", { skip: !LIVE }, () => {
  // Check 2: the MODEL composes a real graph from a goal — not a host template. We hand the real
  // composer two accepted agent refs and assert it returns a multi-node graph that wires them in
  // and survives the host's gate wall (composeGraphForChannel throws if an execute escapes a gate).
  it("composes a real graph from a plain-language goal (the model, not a template)", async () => {
    const channel = {
      title: "RodentRadar pilot",
      objective:
        "Find one regional pest-control operator with commercial food-facility accounts and draft a discovery-first first-contact email for the founder to approve.",
    };
    const agents = [
      { ref: "gtm-find-prospects", title: "Find operators", objective: "Find pest-control operators that fit the ICP", prompt: "Find real, current operators with a now-trigger.", provider: "claude" },
      { ref: "operator-pilot-drafter", title: "Draft outreach", objective: "Draft a discovery-first email", prompt: "Draft a personal, non-selling first-contact email.", provider: "claude" },
    ];

    const { nodes, edges } = await composeGraphForChannel({
      channel,
      agents,
      grounding: null,
      compose: createClaudeComposer({ cwd, maxTurns: 24 }),
    });

    assert.ok(nodes.length >= 3, `expected a real multi-node graph, got ${nodes.length}`);
    const agentNodes = nodes.filter((n) => n.kind === "agent");
    assert.ok(agentNodes.length >= 1, "expected the model to wire in at least one agent node");
    // The model was told to use the exact refs — at least one must survive into the graph.
    const refs = new Set(agentNodes.map((n) => n.ref));
    assert.ok(
      refs.has("gtm-find-prospects") || refs.has("operator-pilot-drafter"),
      `expected an accepted agent ref in the graph, got ${[...refs].join(", ")}`,
    );
    // If the model composed any outward node, the host wall already guaranteed a gate upstream
    // (composeGraphForChannel calls assertGateWall and would have thrown otherwise).
    assert.ok(Array.isArray(edges), "expected wired edges");
  });

  // Checks 3 + 4: an agent step executes LIVE on the subscription, and the run pauses at the
  // founder gate. Minimal 3-node graph (one seed item → enrich agent → gate) keeps the spend
  // bounded; the cap on turns keeps it fast. We assert the agent node actually ran (real items
  // or an honest result, with the live invoker's meta) and that the gate is pending.
  it("executes an agent step on the subscription and stops at the founder gate", async () => {
    const graph = {
      id: "live-spine",
      nodes: [
        { id: "seed", category: "source", connector: "manual", label: "Seed", position: { x: 0, y: 0 }, config: { items: [{ id: "acme", name: "Acme Pest Control", url: "https://example.com" }] } },
        { id: "enrich", kind: "agent", ref: "gtm-enrich", label: "Enrich", position: { x: 220, y: 0 }, config: { maxTurns: 6 }, agentPrompt: "Briefly research this one company from public sources and return it enriched as a JSON array." },
        { id: "gate", category: "gate", connector: "default", label: "Founder review", position: { x: 440, y: 0 }, config: {} },
      ],
      edges: [
        { id: "e1", source: "seed", target: "enrich", edgeType: "data" },
        { id: "e2", source: "enrich", target: "gate", edgeType: "data" },
      ],
    };

    const result = await runGraph(graph, { stepRuntime: liveStepRuntime({ cwd }) });

    const enrich = result.nodes.enrich;
    assert.ok(enrich, "enrich node did not run");
    assert.equal(enrich.kind, "agent");
    // The live invoker tags its meta with the ref it invoked — proof the real bridge ran, not a
    // fake. A quota/turn-budget cutoff is an honest failure, not a product bug, so we only require
    // that the real invoker was reached (meta.invoked set), not that the model found something.
    assert.equal(enrich.meta?.invoked ?? enrich.meta?.ref, "gtm-enrich", `expected the live invoker to run gtm-enrich; meta=${JSON.stringify(enrich.meta)}`);
    // The wall: the run must be paused at the gate, nothing past it.
    assert.ok(result.pendingGates.includes("gate"), `expected the run to pause at the gate; pending=${JSON.stringify(result.pendingGates)}`);
  });

  // Check 5: the subscription runtime REMEMBERS its chat across drives. Drive once with a codeword,
  // capture the SDK session id, then resume that session and ask for the codeword back. The model
  // can only answer if the prior conversation was actually reloaded — proof the resume is real, not
  // a fresh start. No MCP tools, no gate; this isolates the session-continuity mechanism.
  it("resumes the same conversation on the subscription (it remembers your chat)", async () => {
    const CODEWORD = "GTM-ORANGE-42";
    let runtimeSessionId = null;
    const baseCtx = (extra) => ({
      model: process.env.GTM_IDE_OPERATOR_MODEL || "claude-sonnet-4-6",
      system: "You are a terse test assistant. Answer in as few words as possible.",
      tools: [],
      env: process.env,
      options: { cwd },
      maxSteps: 2,
      stepCount: 0,
      isCancelled: () => false,
      currentStatus: () => "running",
      onText: () => {},
      onToolStart: () => {},
      onToolError: () => {},
      onTurn: () => 1,
      onRuntimeSession: (sid) => { runtimeSessionId = sid; },
      ...extra,
    });

    const first = await claudeCodeRuntime.drive(baseCtx({
      goal: `Remember this codeword for later: ${CODEWORD}. Reply with just the word "ok".`,
      runtimeSessionId: null,
      resumePrompt: null,
    }));
    assert.equal(first.kind, "completed", `first drive should complete; got ${JSON.stringify(first)}`);
    assert.ok(runtimeSessionId, "the runtime should have captured and reported an SDK session id");

    const second = await claudeCodeRuntime.drive(baseCtx({
      goal: "unused on resume",
      stepCount: 1,
      runtimeSessionId,
      resumePrompt: "What was the codeword I gave you? Reply with ONLY the codeword.",
    }));
    assert.equal(second.kind, "completed", `resume drive should complete; got ${JSON.stringify(second)}`);
    assert.match(second.summary, new RegExp(CODEWORD), `the resumed conversation should recall the codeword; got: ${second.summary}`);
  });
});
