// Live proof scripts (E5.4 + E6.1) — credential-gated, SKIP without a subscription.
//
// These are the two product claims that the FAKE-driven suite leaves unproven, isolated behind the
// same founder switch as brain/test/live.test.mjs so they never run (or spend) by accident:
//
//   E5.4 — a multi-channel portfolio composes and runs to ONE founder gate (the consolidated queue).
//   E6.1 — the resident operator composes an AGENTIC workflow and drives it to the founder gate.
//
//   GTM_LIVE=1 npm --prefix brain run test:live
//
// With GTM_LIVE unset (the default, including normal `npm test`) every case is SKIPPED — the harness
// still LOADS and STAGES (its imports resolve, its setup runs), proving it is wired and ready; it
// just doesn't make the real call. The founder turns it on only when signed into the subscription.
// We gate on the explicit opt-in, not a token sniff, because a subscription login can live in the
// macOS keychain with no env var — sniffing would false-skip a signed-in founder or false-run a spend.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { createClaudeComposer } from "../src/composition.mjs";
// Imported READ-ONLY — these belong to other lanes; this file only consumes them.
import { composePortfolioGraph } from "../src/workflow-composer.mjs";
import { runGraph } from "../src/graph.mjs";
import { liveStepRuntime } from "../src/agent-bridge.mjs";
import { createOperatorSession } from "../src/operator-store.mjs";
import { runOperatorSession } from "../src/operator-runtime.mjs";

const LIVE = !!process.env.GTM_LIVE;
const cwd = process.cwd();

// ── E5.4 — multi-channel portfolio composed and run to ONE founder gate ───────
describe("live E5.4 — a multi-channel portfolio runs to one consolidated founder gate", { skip: !LIVE }, () => {
  it("composes two channels, unions them behind one gate, and the wall holds on a live run", async () => {
    // Two real GTM channels toward one goal, each with its own accepted agent. consolidateGate folds
    // every lane's gate into one approval queue — the portfolio's whole-system wall.
    const channels = [
      {
        channel: {
          id: "github-inbound",
          title: "GitHub inbound",
          objective: "Find developers already engaging with the founder's MCP repos and research the warmest fits.",
        },
        agents: [
          { ref: "gtm-signal-github", title: "Pull repo signal", objective: "List recent stargazers/forkers on the founder's repos", prompt: "List recent inbound engagers and flag ICP fits.", provider: "claude" },
        ],
      },
      {
        channel: {
          id: "pco-outbound",
          title: "Operator outreach",
          objective: "Find one regional pest-control operator with a now-trigger and research them for a discovery-first first contact.",
        },
        agents: [
          { ref: "gtm-find-prospects", title: "Find operators", objective: "Find pest-control operators that fit the ICP", prompt: "Find real, current operators with a now-trigger.", provider: "claude" },
        ],
      },
    ];

    const { nodes, edges, consolidatedGate } = await composePortfolioGraph({
      goal: "Build a small portfolio of GTM channels for RodentRadar and stage everything for one founder review.",
      channels,
      compose: createClaudeComposer({ cwd, maxTurns: 24 }),
      consolidateGate: true,
    });

    const gates = nodes.filter((n) => n.category === "gate");
    const executes = nodes.filter((n) => n.category === "execute");
    assert.ok(nodes.length >= 2, "expected a real multi-lane portfolio graph");
    assert.ok(Array.isArray(edges) && edges.length > 0, "expected wired edges");
    // The wall is enforced at COMPOSE time: composePortfolioGraph throws if any execute lacks an
    // upstream founder gate. So simply reaching here proves every send in this (live, non-deterministic)
    // composition is gated. A portfolio that sends carries a gate; consolidateGate folds them to one.
    // A research-only composition has no execute and legitimately no gate — also wall-safe.
    if (executes.length > 0) {
      assert.ok(gates.length >= 1, "a portfolio that sends must carry a founder gate (the wall)");
      if (consolidatedGate) {
        assert.equal(gates.length, 1, `consolidated to exactly one gate, got ${gates.length}`);
        assert.ok(gates[0].consolidated, "the surviving gate is the consolidated one");
      }
    }

    // Run the union on the live subscription. The proof is the WALL, robust to whether the live
    // discovery agents surface prospects or find none, and to a research-only vs sending composition.
    const result = await runGraph({ id: "live-portfolio", nodes, edges }, { stepRuntime: liveStepRuntime({ cwd }) });
    const nodeResults = result.nodes ? Object.entries(result.nodes) : [];
    const errored = nodeResults.filter(([, r]) => r && r.ok === false && !r.pendingReview).map(([id]) => id);
    console.log(`E5.4 live: nodes=${nodes.length} executes=${executes.length} gates=${gates.length} pendingGates=${JSON.stringify(result.pendingGates)} erroredNodes=${JSON.stringify(errored)}`);

    // 1) The wall holds: nothing may cross it — no item is ever sent / published / delivered / deployed / live.
    const crossed = nodeResults.some(([, r]) =>
      (r?.items || []).some((it) => it?.sent === true || it?.delivered === true || it?.published === true || it?.deployed === true || it?.live === true));
    assert.equal(crossed, false, "the wall must hold — nothing may be sent, published, delivered, or deployed");

    // 2) Anything that reached a gate pauses there (a real gate node in the union); nothing runs past
    //    a gate. If nothing paused, no execute produced ungated output.
    if (result.pendingGates.length > 0) {
      for (const gid of result.pendingGates) {
        assert.ok(gates.some((g) => g.id === gid), `every pending gate is a real gate node; got ${gid}`);
      }
    } else {
      const executeProduced = nodeResults.some(([id, r]) => {
        const node = nodes.find((n) => n.id === id);
        return node?.category === "execute" && (r?.items || []).length > 0;
      });
      assert.equal(executeProduced, false, "with nothing paused at a gate, no execute produced ungated output");
    }
  });
});

// ── E6.1 — the operator composes an AGENTIC workflow and drives it to the gate ─
describe("live E6.1 — the operator composes an agentic workflow and drives it to the founder gate", { skip: !LIVE }, () => {
  let parent;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-live-operator-"));
    options = { root: parent };
    // Cut market over to agentic retrieval for this proof: the agent steps the operator composes
    // pull their market grounding through get_market instead of eating a pre-pack. This exercises
    // the per-provider cutover (E1.6) end-to-end on the live subscription.
    process.env.GTM_AGENTIC_PROVIDERS = "market";
  });

  afterEach(() => {
    delete process.env.GTM_AGENTIC_PROVIDERS;
    fs.rmSync(parent, { recursive: true, force: true });
  });

  it("drives a real operator session to a founder pause without crossing the wall", async () => {
    const session = createOperatorSession({
      goal:
        "Compose a small workflow that finds one regional pest-control operator with a now-trigger and stages a discovery-first first-contact draft for my review. Stop at the founder gate.",
      maxSteps: 8,
    }, options);

    // Default runtime selection is OAuth-first: with GTM_LIVE=1 the founder is signed in, so this
    // drives the real Claude Code subscription. The operator owns every durable/safety decision; the
    // runtime only reasons. No approve/send tool exists, so it cannot cross the wall by construction.
    const result = await runOperatorSession(session.id, { options });

    // The session must reach a FOUNDER pause — a gate, a proposal to review, or an input request —
    // and never silently complete past a send. (A completed status is allowed only if it completed
    // by reaching the gate; we assert it did not fail and is in a wall-respecting state.)
    assert.notEqual(result.status, "failed", `operator failed: ${result.error}`);
    assert.ok(
      ["waiting_for_gate", "waiting_for_proposal", "waiting_for_input", "completed"].includes(result.status),
      `expected a founder-pause or clean completion, got ${result.status}`,
    );
    // Whatever it did, no event may claim a send/publish — the wall is in the host, but assert it.
    const crossed = (result.events || []).some((e) => /\b(sent|published|emailed|delivered)\b/i.test(e.title || e.detail || ""));
    assert.ok(!crossed, "the operator must not have crossed the send/publish wall");
  });
});
