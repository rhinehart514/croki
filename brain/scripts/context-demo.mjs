#!/usr/bin/env node
// Context substrate diagnostic — assemble real context for a scanned product and the founder's
// real run ledgers, print exactly what a model call would receive, then run an ablation.
//
// Usage: node scripts/context-demo.mjs <repo-path> [--win <event>]
// Reads flow ledgers from ~/.gtm-ide/flows so the taste bank is built from real gate decisions.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { scanRepo } from "../src/scan.mjs";
import { buildProductUnderstanding } from "../src/product-understanding.mjs";
import { extractDecisions, buildTasteProfile } from "../src/memory.mjs";
import {
  assembleContext,
  createProductProvider,
  createTasteProvider,
  createStateProvider,
  createSignalProvider,
} from "../src/context/index.mjs";

const repo = process.argv[2] || ".";
const winFlag = process.argv.indexOf("--win");
const winEvent = winFlag !== -1 ? process.argv[winFlag + 1] : "project_created";

// Real grounding: scan the product.
const report = scanRepo(repo, { winEvent });
const understanding = buildProductUnderstanding(report);

// Real run state: every flow ledger the founder has actually produced. Taste is cross-flow
// (the founder's accumulated judgment), so we aggregate runs across all flows.
const flowsDir = path.join(os.homedir(), ".gtm-ide", "flows");
let allRuns = [];
try {
  for (const file of fs.readdirSync(flowsDir)) {
    if (!file.endsWith(".json")) continue;
    const stored = JSON.parse(fs.readFileSync(path.join(flowsDir, file), "utf8"));
    if (Array.isArray(stored.runs)) allRuns = allRuns.concat(stored.runs);
  }
} catch {
  // no ledgers yet — taste and state stay honest blanks
}

const decisions = extractDecisions(allRuns);
const taste = buildTasteProfile(decisions);

const intent = "ideate go-to-market channels for this product";
const providers = [
  createProductProvider(understanding),
  createTasteProvider(taste),
  createStateProvider(allRuns),
  createSignalProvider(null),
];

const full = assembleContext({ intent, providers });

console.log("=".repeat(72));
console.log("WHAT CLAUDE WOULD RECEIVE (assembled base-layer context)");
console.log("=".repeat(72));
console.log(full.text || "(empty — every provider was an honest blank)");

console.log("\n" + "=".repeat(72));
console.log("MANIFEST (the instrument)");
console.log("=".repeat(72));
console.log(JSON.stringify(full.manifest, null, 2));

// Ablation: drop the taste bank and measure the delta.
const ablated = assembleContext({ intent, providers, toggles: { taste: false } });
console.log("\n" + "=".repeat(72));
console.log("ABLATION — taste bank OFF");
console.log("=".repeat(72));
console.log(`full context:    ${full.text.length} chars, ${full.manifest.contributingProviders} providers`);
console.log(`taste ablated:   ${ablated.text.length} chars, ${ablated.manifest.contributingProviders} providers`);
console.log(`taste contributed: ${full.text.length - ablated.text.length} chars of the founder's accumulated judgment`);
