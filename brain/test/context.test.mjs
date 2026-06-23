import { test } from "node:test";
import assert from "node:assert/strict";

import { assembleContext } from "../src/context/assembler.mjs";
import {
  createProductProvider,
  createMarketProvider,
  createTasteProvider,
  createStateProvider,
  createSignalProvider,
  providersFromContext,
} from "../src/context/providers.mjs";
import { buildAgentPrompt, classifyAgentError } from "../src/agent-bridge.mjs";
import { extractDecisions, buildTasteProfile, renderTasteProfile } from "../src/memory.mjs";

const UNDERSTANDING = {
  productName: "RodentRadar",
  headline: "Rodent activity intelligence for pest-control operators",
  stack: ["node", "firestore"],
  winEvent: { name: "project_created" },
  evidenceState: "blind",
  evidence: [{ file: "src/win.js", line: 10 }],
  blindSpots: [{ title: "Win event has no source attribution" }],
};

// A run ledger whose gate node recorded one approval, one rejection, and one edit.
function ledgerWithDecisions() {
  return [
    {
      id: "run-1",
      createdAt: "2026-06-20T12:00:00.000Z",
      ok: true,
      targetNodeId: "gate-1",
      pendingGates: ["gate-1"],
      result: {
        nodes: {
          "gate-1": {
            category: "gate",
            items: [
              { name: "Acme", draft: "Approved warm note", approvalStatus: "approved", editedFrom: "Original cold note" },
              { name: "Beta", draft: "Salesy blast", approvalStatus: "rejected" },
            ],
          },
        },
      },
    },
  ];
}

test("assembles a layered base map from contributing providers and records a manifest", () => {
  const decisions = extractDecisions(ledgerWithDecisions());
  const taste = buildTasteProfile(decisions);
  const { text, manifest, layers } = assembleContext({
    intent: "ideate channels",
    providers: [
      createProductProvider(UNDERSTANDING),
      createTasteProvider(taste),
      createStateProvider(ledgerWithDecisions()),
      createSignalProvider(null),
    ],
  });

  assert.match(text, /Intent: ideate channels/);
  assert.match(text, /--- Grounded context ---/);
  assert.match(text, /\[product\]/);
  assert.match(text, /attribution BLIND/); // honest about the blind win event
  assert.match(text, /\[taste\]/);
  assert.match(text, /\[state\]/);

  // Manifest is the instrument: product, taste, state contributed; signal stayed an honest blank.
  assert.equal(manifest.contributingProviders, 3);
  const byName = Object.fromEntries(manifest.providers.map((p) => [p.name, p]));
  assert.equal(byName.product.contributed, true);
  assert.equal(byName.product.meta.evidenceState, "blind");
  assert.equal(byName.taste.contributed, true);
  assert.equal(byName.state.meta.totalRuns, 1);
  assert.equal(byName.signal.contributed, false); // no signal source wired
  assert.ok(manifest.totalChars > 0);
  assert.equal(layers.length, 3);
});

test("toggling a provider off is a real ablation: it leaves the map and the manifest", () => {
  const taste = buildTasteProfile(extractDecisions(ledgerWithDecisions()));
  const providers = [createProductProvider(UNDERSTANDING), createTasteProvider(taste)];

  const full = assembleContext({ providers });
  const ablated = assembleContext({ providers, toggles: { taste: false } });

  assert.match(full.text, /\[taste\]/);
  assert.doesNotMatch(ablated.text, /\[taste\]/);
  assert.ok(ablated.text.length < full.text.length);

  const tasteEntry = ablated.manifest.providers.find((p) => p.name === "taste");
  assert.equal(tasteEntry.enabled, false);
  assert.equal(tasteEntry.contributed, false);
});

test("an all-blank assembly returns empty text, not a fabricated layer", () => {
  const { text, manifest } = assembleContext({
    providers: [
      createProductProvider(null),
      createTasteProvider(null),
      createStateProvider([]),
      createSignalProvider(null),
    ],
  });
  assert.equal(text, "");
  assert.equal(manifest.contributingProviders, 0);
  assert.ok(manifest.providers.every((p) => p.contributed === false));
});

test("a throwing provider is caught and recorded, never crashing the assembly", () => {
  const bomb = { name: "bomb", layer: "base", contribute() { throw new Error("boom"); } };
  const { text, manifest } = assembleContext({
    providers: [bomb, createProductProvider(UNDERSTANDING)],
  });
  const entry = manifest.providers.find((p) => p.name === "bomb");
  assert.equal(entry.contributed, false);
  assert.match(entry.error, /boom/);
  assert.match(text, /\[product\]/); // the good provider still lands
});

test("taste profile carries counts and renders the founder's edits as directional signal", () => {
  const decisions = extractDecisions(ledgerWithDecisions());
  const profile = buildTasteProfile(decisions);
  assert.equal(profile.counts.approved, 1);
  assert.equal(profile.counts.rejected, 1);
  assert.equal(profile.counts.edits, 1);

  const block = renderTasteProfile(profile);
  assert.doesNotMatch(block, /^\n/); // leading blank lines stripped for clean nesting
  assert.match(block, /APPROVED/);
  assert.match(block, /REJECTED/);
  assert.match(block, /before: Original cold note/);
  assert.match(block, /after: Approved warm note/);
});

test("buildTasteProfile returns null on a cold ledger with no decisions", () => {
  assert.equal(buildTasteProfile(extractDecisions([])), null);
  assert.equal(renderTasteProfile(null), "");
});

// ─── The live wiring: run context → providers → assembled agent prompt ────────

test("providersFromContext builds providers only for the grounding the run carries", () => {
  const none = providersFromContext({});
  assert.equal(none.length, 0); // honest blank: no sources, no stub providers

  const some = providersFromContext({
    grounding: UNDERSTANDING,
    market: { buyer: "pest-control operator", trigger: "spring rush" },
    __memory: { approved: ["a warm note"], rejected: [], edits: [] },
    __state: ledgerWithDecisions(),
    __run: { runId: "x" }, // unrecognized — must NOT become a provider
  });
  assert.deepEqual(some.map((p) => p.name), ["product", "market", "taste", "state"]);
});

test("market provider carries outside-the-codebase buyer reality, blank when absent", () => {
  const filled = createMarketProvider({
    buyer: "pest-control operator running commercial accounts",
    trigger: "spring rodent surge",
    channels: ["regional PCO associations", "trade shows"],
    competitors: ["clipboard + spreadsheet"],
  }).contribute();
  assert.match(filled.text, /Buyer: pest-control operator/);
  assert.match(filled.text, /Now-trigger: spring rodent surge/);
  assert.match(filled.text, /Where they are: regional PCO associations/);
  assert.match(filled.text, /Competing with: clipboard/);

  // Honest blank: no buyer/market intel → no layer (the ideator researches it live instead).
  assert.equal(createMarketProvider(null).contribute(), null);
  assert.equal(createMarketProvider({}).contribute(), null);
});

test("buildAgentPrompt assembles recognized context and passes the rest through as JSON", () => {
  const { prompt, manifest } = buildAgentPrompt({
    ref: "gtm-find-prospects",
    prompt: "find operators with a now-trigger",
    items: [],
    context: {
      grounding: UNDERSTANDING,
      __memory: { approved: ["Saw your second branch opened — worth a swap of notes?"], rejected: [], edits: [] },
      __run: { runId: "run-9", graphId: "find-clients" },
    },
  });

  // Recognized grounding is assembled into the prompt, not dumped as raw JSON.
  assert.match(prompt, /Grounded context:/);
  assert.match(prompt, /\[product\]/);
  assert.match(prompt, /\[taste\]/);
  assert.match(prompt, /attribution BLIND/);
  // Unrecognized context (the __run marker) is preserved as JSON, never lost.
  assert.match(prompt, /Additional workflow context \(JSON\):/);
  assert.match(prompt, /run-9/);
  // The manifest rides along for the UI inspector.
  assert.equal(manifest.contributingProviders, 2);
});

test("classifyAgentError turns a raw cutoff into a clear, retriable reason", () => {
  const limit = classifyAgentError({ is_error: true, result: "You've hit your session limit · resets 3:30am" });
  assert.equal(limit.kind, "limit");
  assert.equal(limit.retriable, true);
  assert.match(limit.message, /quota limit, not a product failure/);

  const turns = classifyAgentError({ subtype: "error_max_turns" });
  assert.equal(turns.kind, "max_turns");
  assert.equal(turns.retriable, true);

  const unknown = classifyAgentError({ is_error: true, result: "" });
  assert.equal(unknown.kind, "error");
  assert.equal(unknown.retriable, false);
});
