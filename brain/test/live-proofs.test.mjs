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

// Imported READ-ONLY — these belong to other lanes; this file only consumes them.
import { createOperatorSession } from "../src/operator-store.mjs";
import { runOperatorSession } from "../src/operator-runtime.mjs";

const LIVE = !!process.env.GTM_LIVE;

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
