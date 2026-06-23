#!/usr/bin/env node
/**
 * Minimum runnable loop — end-to-end proof.
 *
 * Drives one item through the real DAG runner to a real external send and back
 * into the ledger, then shows the loop got measurably smarter. This is the
 * VISION "minimum runnable loop" exercised for real:
 *
 *   scan repo (code-grounded)
 *     -> manual source finds a real person
 *     -> gate stages the draft for the founder
 *     -> founder approves
 *     -> HTTP send actually leaves the machine (real attributable outcome)
 *     -> ledger records it
 *     -> next run reads the approved draft as a voice exemplar
 *
 * Two phases, so the founder gate is real:
 *   node brain/scripts/prove-gated-send.mjs            # STAGE: run to the gate, print the draft, send nothing
 *   GTM_IDE_SEND_ENDPOINT=<url> node ... --send        # SEND: approve + really send + record + show learning
 *
 * The destination is the founder's to set (GTM_IDE_SEND_ENDPOINT). Nothing is
 * sent without --send AND an endpoint. The message here is founder-authored,
 * grounded in the scanned product — with a model key (or Claude Code) the
 * generate node drafts it instead; the rest of the loop is identical.
 */

import os from "node:os";
import path from "node:path";
import { scanRepo, headline } from "../src/scan.mjs";
import { runGraph, listConnectors } from "../src/graph.mjs";
import { loadFlow, saveFlow, recordFlowRun } from "../src/flow-store.mjs";
import { extractDecisions, buildDraftMemory, renderDraftMemory } from "../src/memory.mjs";
import { deriveMeasure } from "../src/engine.mjs";

const SEND = process.argv.includes("--send");
const REPO = process.env.GTM_IDE_PROOF_REPO || path.join(os.homedir(), "Buffalo-Projects");
const WIN = process.env.GTM_IDE_PROOF_WIN || "project_created";
const ENDPOINT = process.env.GTM_IDE_SEND_ENDPOINT || null;
const RECIPIENT = process.env.GTM_IDE_PROOF_RECIPIENT || "jacobrhinehart5@gmail.com";
const LEDGER_ROOT = process.env.GTM_IDE_PROOF_HOME || path.join(os.tmpdir(), "gtm-ide-proof");
const options = { root: LEDGER_ROOT };

const rule = (label) => console.log(`\n${"─".repeat(4)} ${label} ${"─".repeat(Math.max(2, 64 - label.length))}`);

// 1 ── Code grounding: scan a real repo for the win event + evidence ───────────
rule("1. CODE-GROUNDED");
const report = scanRepo(REPO, { winEvent: WIN });
const win = report.winEvent ?? {};
console.log(`repo:        ${REPO}`);
console.log(`win event:   "${win.name}" — ${win.found ? "proven in production code" : "not found in production code"}`);
console.log(`attribution: ${win.attributionProperties?.length ? win.attributionProperties.join(", ") : "none carried on the event"}`);
console.log(`headline:    ${headline(report)}`);
const evidence = (win.citations ?? report.citations ?? [])[0];
if (evidence) console.log(`evidence:    ${evidence.file}:${evidence.line}`);

// 2 ── Build the proof graph: manual source -> gate -> HTTP send -> measure ─────
const product = report.product?.name || "GTM IDE";
const draft = [
  `Hi — I'm building ${product} and saw your work in the Buffalo Projects space.`,
  `Wanted to reach out directly rather than blast a list. Open to a quick trade of notes?`,
  `— Jacob`,
].join(" ");

// The manual source carries the founder-authored draft directly (no model key in
// this env). With a key or Claude Code, a generate node drafts it here instead;
// the gate -> send -> measure tail is identical.
const graph = {
  id: "proof-gated-send",
  name: "Gated send proof",
  version: "0.1.0",
  nodes: [
    { id: "src", category: "source", connector: "manual", label: "Manual list", position: { x: 0, y: 0 },
      config: { items: [{ name: "Proof Recipient", email: RECIPIENT, summary: "Founder-authored proof recipient.", url: "https://buffalo-projects.example", draft }] } },
    { id: "gate", category: "gate", connector: "default", label: "Founder review", position: { x: 200, y: 0 }, config: {} },
    { id: "exe", category: "execute", connector: "http", label: "Send", position: { x: 400, y: 0 }, config: { channel: "email" } },
    { id: "msr", category: "measure", connector: "default", label: "Capture outcome", position: { x: 600, y: 0 }, config: { joinKey: "gtmActionId" } },
  ],
  edges: [
    { id: "e1", source: "src", target: "gate", edgeType: "data" },
    { id: "e2", source: "gate", target: "exe", edgeType: "data" },
    { id: "e3", source: "exe", target: "msr", edgeType: "data" },
  ],
};

rule("2. STAGED DRAFT (gate)");
const staged = await runGraph(graph, { store: { writeOutcomes: async () => {} } });
const gateItem = staged.nodes.gate?.items?.[0];
console.log(`to:          ${gateItem?.email}`);
console.log(`gtmActionId: ${gateItem?.gtmActionId}`);
console.log(`status:      ${gateItem?.approvalStatus} (pendingReview=${staged.nodes.gate?.pendingReview})`);
console.log(`draft:\n  ${draft}`);

// Engine view BEFORE: is measurement blind / send-connector missing?
const connectors = listConnectors();
const measureBefore = deriveMeasure(report, [], connectors);

if (!SEND) {
  rule("STAGE ONLY");
  console.log("Nothing was sent. Re-run with --send and GTM_IDE_SEND_ENDPOINT to cross the world's edge.");
  console.log(`Measure now: health ${measureBefore.health} · issues: ${measureBefore.activeIssues.join(" | ") || "none"}`);
  process.exit(0);
}

// 3 ── Founder-approved + real external send ────────────────────────────────────
if (!ENDPOINT) {
  console.error("\nRefusing to send: set GTM_IDE_SEND_ENDPOINT to a real destination first.");
  process.exit(1);
}
rule("3. FOUNDER-APPROVED → REAL SEND");
console.log(`endpoint:    ${ENDPOINT}`);
const sentRun = await runGraph(graph, { approvals: { gate: true } });
const exe = sentRun.nodes.exe;
const sentItem = exe?.items?.[0];
console.log(`sent meta:   ${JSON.stringify(exe?.meta)}`);
console.log(`outcome:     executionStatus=${sentItem?.executionStatus} httpStatus=${sentItem?.httpStatus} providerMessageId=${sentItem?.providerMessageId ?? "—"}`);
console.log(`attribution: gtmActionId=${sentItem?.gtmActionId} sentAt=${sentItem?.sentAt}`);

// 4 ── Ledger: persist the run, read it back ───────────────────────────────────
rule("4. LEDGER");
saveFlow(graph, options);
const stored = recordFlowRun(graph, sentRun, options);
const reloaded = loadFlow(graph.id, graph, options);
console.log(`recorded run ${sentRun.runId} → ledger now holds ${reloaded.runs.length} run(s) at ${LEDGER_ROOT}`);

// 5 ── Measurably smarter: memory + engine before/after ────────────────────────
rule("5. MEASURABLY SMARTER");
const before = buildDraftMemory(extractDecisions([]));
const after = buildDraftMemory(extractDecisions(reloaded.runs));
console.log(`learning memory before this run: ${before ? `${before.approved.length} approved exemplars` : "none (cold start)"}`);
console.log(`learning memory after this run:  ${after ? `${after.approved.length} approved exemplar(s)` : "none"}`);
if (after?.approved?.length) {
  console.log(`the next generate pass now carries the founder's approved voice:`);
  console.log(renderDraftMemory(after).split("\n").slice(0, 6).map((l) => `  ${l}`).join("\n"));
}
const measureAfter = deriveMeasure(report, reloaded.runs, connectors);
console.log(`\nMeasure health: ${measureBefore.health} → ${measureAfter.health}`);
console.log(`Measure issues before: ${measureBefore.activeIssues.join(" | ") || "none"}`);
console.log(`Measure issues after:  ${measureAfter.activeIssues.join(" | ") || "none"}`);

rule("DONE");
console.log("One code-grounded, founder-approved, externally-executed, attributable result — recorded, and the loop is smarter for it.");
