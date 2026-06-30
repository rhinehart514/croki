// Close the loop from a real run back to the idea that spawned it.
//
// A GtmIdea is generated (ideation.mjs), graded by a separate bar (idea-bar.mjs), kept by the founder,
// and wired into a channel (idea-store.attachBuildWiring). The loop was open at the far end: once that
// channel ran to the gate, nothing wrote the real outcome back onto the idea, so the NEXT composeIdeas
// started from a blank page instead of from what actually converted. This module closes it.
//
// On run completion it finds the kept idea wired to the channel that ran, derives the run's real
// outcome (the founder's gate decisions — the only outcome signal before anything sends), and writes it
// to TWO places: onto the GtmIdea (idea-store.recordIdeaOutcome) so the durable idea carries its result,
// and into the crucible ledger (~/.claude/skills/crucible/bin/ledger.mjs) so the rising bar starts warm
// the next time ideas are generated for this domain.
//
// Read-derived GTM state: it records what happened, never sends, never grades, never blocks. The
// crucible append is resilient and optional — an absent ledger reports available:false, never throws.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { listGtmIdeas, recordIdeaOutcome } from "./idea-store.mjs";

// Derive a run's outcome from its gate decisions. Returns null when the run produced no gate at all —
// nothing measurable happened yet, so there is no outcome to write. The gate is the only real outcome
// before send, exactly as the rest of the system treats it.
export function deriveIdeaOutcome({ graph, result } = {}) {
  const nodes = result?.nodes ?? {};
  let gated = false;
  let approved = 0;
  let rejected = 0;
  for (const node of Object.values(nodes)) {
    if (node?.category !== "gate" || !Array.isArray(node.items)) continue;
    gated = true;
    for (const item of node.items) {
      if (item?.approvalStatus === "approved") approved += 1;
      else if (item?.approvalStatus === "rejected") rejected += 1;
    }
  }
  if (!gated) return null;
  return {
    channelId: graph?.id ?? result?.graphId ?? null,
    runId: result?.runId ?? null,
    reachedGate: true,
    approved,
    rejected,
    reviewed: approved + rejected,
    recordedAt: new Date().toISOString(),
  };
}

// Does a GtmIdea's buildWiring point at the channel that just ran? buildWiring is open — a bare channel
// id string, or an object carrying channelId / graphId (the shape attachBuildWiring stores).
function ideaMatchesChannel(idea, channelId) {
  const wiring = idea?.buildWiring;
  if (!wiring || !channelId) return false;
  if (typeof wiring === "string") return wiring === channelId;
  return wiring.channelId === channelId || wiring.graphId === channelId;
}

// The kept idea wired to a channel, newest first. A killed idea is never wired (idea-store refuses it),
// but we still skip one defensively — a dead idea does not get a fresh outcome.
function findIdeaForChannel(channelId, projectId, options) {
  const ideas = listGtmIdeas({ ...options, projectId });
  return ideas.find((idea) => !idea.killed && ideaMatchesChannel(idea, channelId)) ?? null;
}

// The crucible ledger CLI, the rising-bar store the /crucible and /ideate skills share. Configurable so
// a machine without the skill (or a test) points elsewhere; resilient when absent.
export function crucibleLedgerPath() {
  return process.env.CRUCIBLE_LEDGER_PATH
    || path.join(os.homedir(), ".claude", "skills", "crucible", "bin", "ledger.mjs");
}

// Append one outcome record to the crucible ledger via its `append <json>` command. The ledger stamps
// ts / prompt_hash / hash-chain itself; we hand it the idea and its real result. Resilient: an absent or
// failing ledger reports available:false rather than throwing.
export function appendIdeaOutcomeToCrucible(record, { ledgerPath = crucibleLedgerPath() } = {}) {
  if (!ledgerPath || !fs.existsSync(ledgerPath)) return { available: false };
  const proc = spawnSync(process.execPath, [ledgerPath, "append", JSON.stringify(record)], { encoding: "utf8" });
  if (proc.status !== 0 || !proc.stdout) return { available: false };
  try {
    return { available: true, ...JSON.parse(proc.stdout) };
  } catch {
    return { available: false };
  }
}

// The seam: on run completion, write the channel's run outcome back onto its kept idea AND into the
// crucible ledger. Returns null when no kept idea is wired to the channel or the run produced no gate —
// in either case there is nothing to close the loop on yet.
export function recordIdeaOutcomeFromRun({ projectId = "default", graph, result } = {}, options = {}) {
  const channelId = graph?.id ?? result?.graphId ?? null;
  if (!channelId) return null;
  const idea = findIdeaForChannel(channelId, projectId, options);
  if (!idea) return null;
  const outcome = deriveIdeaOutcome({ graph, result });
  if (!outcome) return null;

  const updated = recordIdeaOutcome(idea.id, outcome, options);

  // Feed the rising bar: the next composeIdeas for this domain starts from what converted, not blank.
  let crucible = null;
  try {
    crucible = appendIdeaOutcomeToCrucible({
      domain: "gtm",
      source: "gtm-ide",
      idea: idea.pitch,
      angle: idea.angle ?? null,
      goal: idea.goal ?? null,
      verdict: idea.verdict ?? null,
      barScore: idea.barScore ?? null,
      ideaId: idea.id,
      outcome,
    });
  } catch {
    crucible = null;
  }

  return { idea: updated, outcome, crucible };
}
