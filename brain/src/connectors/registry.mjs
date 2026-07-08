// Headless connector registry — GTM IDE.
// Venture doctrine: connectors declare capabilities (allowed/blocked/approvalRequired).
// Resource nodes are visual declarations; the runner skips them.
// All other node categories have runnable connectors.

import * as exaResource from "./resource/exa.mjs";
import * as clayResource from "./resource/clay.mjs";
import * as claudeResource from "./resource/claude.mjs";
import * as gmailResource from "./resource/gmail.mjs";

import * as icpContext from "./context/icp.mjs";
import * as productContext from "./context/product.mjs";

import * as exaFind from "./find/exa.mjs";
import * as apolloFind from "./find/apollo.mjs";
import * as manualFind from "./find/manual.mjs";
import * as csvFind from "./find/csv.mjs";
import * as apiFind from "./find/api.mjs";

import * as clayEnrich from "./enrich/clay.mjs";
import * as clearbitEnrich from "./enrich/clearbit.mjs";

import * as defaultScore from "./score/default.mjs";

import * as claudeDraft from "./draft/claude.mjs";
import * as openaiDraft from "./draft/openai.mjs";

import * as defaultGate from "./gate/default.mjs";
import * as localExecute from "./execute/local.mjs";
import * as httpExecute from "./execute/http.mjs";
import * as artifactExecute from "./execute/artifact.mjs";
import * as deployExecute from "./execute/deploy.mjs";
import * as gmailExecute from "./execute/gmail.mjs";

import * as defaultMeasure from "./measure/default.mjs";

// Registry shape: { [category]: { [connectorId]: { meta, run } } }
const REGISTRY = {
  resource:  { exa: exaResource, clay: clayResource, claude: claudeResource, gmail: gmailResource },
  context:   { icp: icpContext, product: productContext },
  source:    { exa: exaFind, apollo: apolloFind, manual: manualFind, csv: csvFind, api: apiFind },
  enrich:    { clay: clayEnrich, clearbit: clearbitEnrich },
  filter:    { default: defaultScore },
  generate:  { claude: claudeDraft, openai: openaiDraft },
  gate:      { default: defaultGate },
  execute:   { local: localExecute, http: httpExecute, artifact: artifactExecute, deploy: deployExecute, gmail: gmailExecute },
  measure:   { default: defaultMeasure },
};

export function getConnector(categoryOrType, id = "default") {
  return REGISTRY[categoryOrType]?.[id] ?? null;
}

export function listConnectors() {
  const seen = new Set();
  const result = [];
  for (const [category, connectors] of Object.entries(REGISTRY)) {
    for (const [id, { meta }] of Object.entries(connectors)) {
      const key = `${category}:${id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({
        ...meta,
        category,
        type: meta.type ?? category,  // backward compat
        configured: meta.envKey ? !!process.env[meta.envKey] : true,
      });
    }
  }
  return result;
}

// ─── Default graph template — Cold Outbound ───────────────────────────────────
// Venture doctrine: complete structure, partial activation, local state.
// Feedback edges: measure → context/source (output over time feeds input).

export function defaultGraphTemplate() {
  const DRAFT_PROMPT = `Write a short, warm, personalized cold outreach email.

Sender: {senderName}
Product: {productContext}
Prospect: {prospectName}
What I know: {prospectSummary}
Their site: {prospectUrl}

Rules:
- Under 100 words
- Open with something specific to them — not a compliment, something real
- One clear reason they would care about {productContext}
- Sign as {senderName}
- No subject line, no em-dashes, no bullet points, no corporate speak

Return only the message body.`;

  return {
    id: "cold-outbound-v1",
    name: "Cold outbound",
    version: "0.1.0",
    nodes: [
      // Resource nodes (far left x≈0) — visual declarations
      { id: "r-exa",    category: "resource", connector: "exa",    label: "Exa Search API",      position: { x: 0,   y: 100 }, config: {} },
      { id: "r-clay",   category: "resource", connector: "clay",   label: "Clay Enrichment",     position: { x: 0,   y: 240 }, config: {} },
      { id: "r-claude", category: "resource", connector: "claude", label: "Claude (Anthropic)",  position: { x: 0,   y: 380 }, config: {} },

      // Context nodes (floating top x≈420-620) — ICP and product referenced by score + generate
      {
        id: "ctx-icp",
        category: "context",
        connector: "icp",
        label: "ICP",
        position: { x: 420, y: 0 },
        config: {
          query: "early-stage SaaS founders building B2B products who track product analytics",
          geography: "Buffalo, NY",
          industry: "SaaS",
          keywords: ["founder", "startup", "saas", "analytics", "b2b"],
        },
      },
      {
        id: "ctx-product",
        category: "context",
        connector: "product",
        label: "Product context",
        position: { x: 640, y: 0 },
        config: {
          name: "Drover",
          description: "A local workbench that proves your GTM funnel with code evidence and runs AI-powered outreach",
          valueProps: ["attribution from code not guesswork", "founder-gated, never blasts", "runs on your machine"],
        },
      },

      // Source node (left x≈220)
      {
        id: "src-find",
        category: "source",
        connector: "exa",
        label: "Find prospects",
        position: { x: 220, y: 180 },
        config: { limit: 10 },
        agentPrompt: "",
        sourceOfTruth: ["contacts"],
      },

      // Enrich node (center-left x≈440)
      {
        id: "enr-clay",
        category: "enrich",
        connector: "clay",
        label: "Enrich with Clay",
        position: { x: 440, y: 180 },
        config: {},
        sourceOfTruth: ["contacts"],
      },

      // Filter node (center x≈660)
      {
        id: "fil-score",
        category: "filter",
        connector: "default",
        label: "Score ICP fit",
        position: { x: 660, y: 180 },
        config: { minFitScore: 0.3, keywords: ["founder", "startup", "saas", "analytics", "b2b"] },
      },

      // Generate node (center-right x≈880)
      {
        id: "gen-draft",
        category: "generate",
        connector: "claude",
        label: "Draft outreach",
        position: { x: 880, y: 180 },
        config: { senderName: "Jacob", model: "claude-opus-4-8" },
        agentPrompt: DRAFT_PROMPT,
      },

      // Gate node (right x≈1100)
      {
        id: "gate-review",
        category: "gate",
        connector: "default",
        label: "Founder review",
        position: { x: 1100, y: 180 },
        config: {},
      },

      // Execute node (far right x≈1320)
      {
        id: "exe-email",
        category: "execute",
        connector: "local",
        label: "Stage approved drafts",
        position: { x: 1320, y: 100 },
        config: { channel: "email" },
      },

      // Measure node (far right x≈1320-1540)
      {
        id: "msr-outcomes",
        category: "measure",
        connector: "default",
        label: "Capture outcomes",
        position: { x: 1320, y: 280 },
        config: { joinKey: "email" },
        sourceOfTruth: ["outcomes"],
      },
    ],
    edges: [
      // Resource → Source (data: Exa feeds find)
      { id: "e-r-exa-src",    source: "r-exa",         target: "src-find",    edgeType: "data" },
      // ICP → Source (context: prospect search uses the ICP query)
      { id: "e-icp-src",      source: "ctx-icp",       target: "src-find",    edgeType: "context" },
      // Source → Enrich (data)
      { id: "e-src-enr",      source: "src-find",      target: "enr-clay",    edgeType: "data" },
      // Resource → Enrich (data: Clay feeds enrich)
      { id: "e-r-clay-enr",   source: "r-clay",        target: "enr-clay",    edgeType: "data" },
      // Enrich → Filter (data)
      { id: "e-enr-fil",      source: "enr-clay",      target: "fil-score",   edgeType: "data" },
      // ICP → Filter (context: score reads ICP)
      { id: "e-icp-fil",      source: "ctx-icp",       target: "fil-score",   edgeType: "context" },
      // Filter → Generate (data)
      { id: "e-fil-gen",      source: "fil-score",     target: "gen-draft",   edgeType: "data" },
      // ICP → Generate (context: draft reads ICP for targeting language)
      { id: "e-icp-gen",      source: "ctx-icp",       target: "gen-draft",   edgeType: "context" },
      // Product → Generate (context: draft uses product description)
      { id: "e-prod-gen",     source: "ctx-product",   target: "gen-draft",   edgeType: "context" },
      // Resource → Generate (data: Claude API powers draft)
      { id: "e-r-claude-gen", source: "r-claude",      target: "gen-draft",   edgeType: "data" },
      // Generate → Gate (data)
      { id: "e-gen-gate",     source: "gen-draft",     target: "gate-review", edgeType: "data" },
      // Gate → Execute (data: approved items go to send)
      { id: "e-gate-exe",     source: "gate-review",   target: "exe-email",   edgeType: "data" },
      // Execute → Measure (data)
      { id: "e-exe-msr",      source: "exe-email",     target: "msr-outcomes", edgeType: "data" },
      // FEEDBACK EDGES — output over time feeds input
      // Measure → ICP (feedback: who replied informs ICP refinement)
      { id: "fb-msr-icp",     source: "msr-outcomes",  target: "ctx-icp",     edgeType: "feedback", label: "reply patterns" },
      // Measure → Source (feedback: outcome signals refine find queries)
      { id: "fb-msr-src",     source: "msr-outcomes",  target: "src-find",    edgeType: "feedback", label: "convert signals" },
    ],
    store: { path: ".gtm", runs: 0 },
  };
}

