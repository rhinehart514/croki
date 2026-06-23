#!/usr/bin/env node
// Live gate proof — drive ONE real run through the real engine, on the founder's subscription,
// with the context substrate assembling the prompt, and stop at a founder gate. Sends nothing:
// the gate is the wall. Proves the loop closes once and that assembled context reaches the model.
//
// Usage: node scripts/live-gate-run.mjs [repo-path] [--win <event>]

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { scanRepo } from "../src/scan.mjs";
import { buildProductUnderstanding } from "../src/product-understanding.mjs";
import { extractDecisions, buildDraftMemory } from "../src/memory.mjs";
import { runGraph } from "../src/graph.mjs";
import { liveStepRuntime, runClaudeQuery } from "../src/agent-bridge.mjs";

const repo = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : path.join(os.homedir(), "gtm-ide");
const winFlag = process.argv.indexOf("--win");
const winEvent = winFlag !== -1 ? process.argv[winFlag + 1] : "project_created";

// ── 1. Cheap subscription probe (1 turn) — never fire a full run blind ────────
console.log("Probing subscription (1 turn)…");
const probe = await runClaudeQuery({ prompt: "Reply with exactly the single word: READY", maxTurns: 1 });
if (probe.error) {
  console.error(`\nSubscription unavailable: [${probe.error.kind}] ${probe.error.message}`);
  console.error("No quota spent on a full run. Retry when the subscription has headroom.");
  process.exit(1);
}
console.log(`Subscription OK (probe said: ${JSON.stringify((probe.text || "").trim()).slice(0, 40)})\n`);

// ── 2. Real grounding for the substrate ───────────────────────────────────────
const understanding = buildProductUnderstanding(scanRepo(repo, { winEvent }));
const flowsDir = path.join(os.homedir(), ".gtm-ide", "flows");
let allRuns = [];
try {
  for (const f of fs.readdirSync(flowsDir)) {
    if (!f.endsWith(".json")) continue;
    const s = JSON.parse(fs.readFileSync(path.join(flowsDir, f), "utf8"));
    if (Array.isArray(s.runs)) allRuns = allRuns.concat(s.runs);
  }
} catch { /* cold start, fine */ }
const memory = buildDraftMemory(extractDecisions(allRuns));

// ── 3. A minimal REAL graph: manual input → draft agent → founder gate ────────
// The input is a founder-supplied placeholder target (manual source), not an invented finding.
const graph = {
  id: "live-gate-proof",
  name: "Live gate proof",
  nodes: [
    {
      id: "input",
      category: "source",
      connector: "manual",
      label: "Manual target",
      config: { items: [{ name: "Placeholder target (founder-supplied input)", summary: "Manual input item for the gate-proof run. Replace with a real target." }] },
    },
    {
      id: "draft",
      kind: "agent",
      category: "generate",
      ref: "gtm-channel-artifact-drafter",
      label: "Draft outreach",
      agentPrompt: "Draft ONE short, specific outreach message to the input person, grounded in the product context you were given. No em-dashes. Not a pitch — earn their time. Sign it Jacob. Return a JSON array with one object: { \"name\", \"draft\" }.",
      config: { maxTurns: 6 },
    },
    { id: "gate", category: "gate", connector: "default", label: "Founder review" },
  ],
  edges: [
    { id: "e1", source: "input", target: "draft", edgeType: "data" },
    { id: "e2", source: "draft", target: "gate", edgeType: "data" },
  ],
};

console.log(`Running real graph on subscription (grounding: ${understanding.productName}, taste: ${memory ? "present" : "none"})…\n`);
const result = await runGraph(graph, {
  grounding: understanding,
  runs: allRuns,
  memory,
  stepRuntime: liveStepRuntime({ cwd: repo }),
});

// ── 4. Report: did we reach a gate, with assembled context? ───────────────────
console.log("=".repeat(72));
console.log(`RUN ${result.runId} — ok=${result.ok}, pendingGates=${JSON.stringify(result.pendingGates)}`);
console.log("=".repeat(72));

const draftNode = result.nodes.draft;
console.log(`\ndraft step: ok=${draftNode?.ok}${draftNode?.error ? `, error=${draftNode.error}` : ""}`);
if (draftNode?.meta?.contextManifest) {
  const m = draftNode.meta.contextManifest;
  console.log(`context assembled for the draft: ${m.contributingProviders}/${m.providers.length} providers, ${m.totalChars} chars`);
  console.log("  " + m.providers.map((p) => `${p.name}:${p.contributed ? p.chars + "ch" : "blank"}`).join("  "));
}

const gateNode = result.nodes.gate;
if (gateNode?.pendingReview) {
  console.log(`\n✓ REACHED THE GATE — ${gateNode.meta.awaitingReview} item(s) staged for founder review, sent nothing:`);
  for (const item of gateNode.items) {
    console.log(`\n  to: ${item.name}\n  draft: ${String(item.draft || item.message || "(no draft field)").slice(0, 500)}`);
  }
} else {
  console.log(`\n✗ Did not reach a pending gate. Gate node: ${JSON.stringify(gateNode?.meta ?? gateNode?.error ?? "n/a")}`);
}
