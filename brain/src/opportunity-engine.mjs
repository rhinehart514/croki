import crypto from "node:crypto";
import { buildProductUnderstanding } from "./product-understanding.mjs";
import { loadProject, saveProject } from "./project-store.mjs";

function idFor(type, value) {
  const slug = String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 54);
  return `${type}-${slug || crypto.randomBytes(4).toString("hex")}`;
}

function evidenceArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function channelOpportunity(input) {
  return {
    id: idFor("channel", input.title),
    type: "channel",
    origin: input.origin,
    status: "proposed",
    title: input.title,
    objective: input.objective,
    rationale: input.rationale,
    confidence: input.confidence,
    evidence: evidenceArray(input.evidence),
    input: input.input ?? { type: "manual", label: "Manual or CSV input" },
    output: input.output ?? { type: "manual", label: "Stage for manual execution" },
    selectedAgentIds: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function agentOpportunity(input) {
  const ref = idFor("gtm", input.title).replace(/^agent-/, "");
  return {
    id: idFor("agent", input.title),
    type: "agent",
    origin: input.origin,
    status: "proposed",
    title: input.title,
    objective: input.objective,
    rationale: input.rationale,
    confidence: input.confidence,
    evidence: evidenceArray(input.evidence),
    provider: input.provider ?? "claude",
    model: input.model ?? "",
    ref,
    prompt: input.prompt,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// Honest blank default: with no ideation runtime wired, generate nothing rather than
// fabricate. Mirrors the blank defaults in step-runners.mjs.
const blankIdeate = async () => ({ ok: true, items: [], meta: { blank: true } });

const ORIGINS = new Set(["derived", "speculative"]);
const CONFIDENCE = new Set(["high", "medium", "low"]);

// Normalize one raw ideation proposal into a stored opportunity. The host owns the shape
// (ids, status, timestamps, field whitelist); the model owns the content. A "derived"
// proposal must carry real evidence — if the model claims derived with no citation, it is
// demoted to speculative so the truth/bet line never blurs.
function normalizeProposal(raw) {
  if (!raw || typeof raw !== "object") return null;
  const type = raw.type === "agent" ? "agent" : raw.type === "channel" ? "channel" : null;
  if (!type) return null;
  const title = String(raw.title || "").trim();
  if (!title) return null;
  const evidence = evidenceArray(raw.evidence);
  let origin = ORIGINS.has(raw.origin) ? raw.origin : (evidence.length ? "derived" : "speculative");
  if (origin === "derived" && evidence.length === 0) origin = "speculative";
  const confidence = CONFIDENCE.has(raw.confidence) ? raw.confidence : (origin === "derived" ? "high" : "medium");
  const common = {
    title,
    objective: String(raw.objective || "").trim(),
    rationale: String(raw.rationale || "").trim(),
    origin,
    confidence,
    evidence,
  };
  if (type === "agent") {
    return agentOpportunity({
      ...common,
      provider: raw.provider === "codex" ? "codex" : "claude",
      model: typeof raw.model === "string" ? raw.model : "",
      prompt: String(raw.prompt || "").trim(),
    });
  }
  return channelOpportunity({
    ...common,
    input: raw.input && typeof raw.input === "object" ? raw.input : undefined,
    output: raw.output && typeof raw.output === "object" ? raw.output : undefined,
  });
}

// Ideate the opportunity set. No taxonomy, no fixed channels — the injected ideator reads
// the grounded reality and the real repo and proposes channels/agents with zero shape baked
// in. The host only grounds, normalizes, and (later) gates.
export async function generateOpportunities(report, { ideate = blankIdeate, market = null } = {}) {
  const understanding = buildProductUnderstanding(report);
  // grounding = the code reality; market = the buyer/outside reality. The ideator does outside
  // product thinking from `market` (and live web research) so channels are buyer-shaped.
  const result = await ideate({ grounding: understanding, repo: understanding.repository, market });
  const rawItems = Array.isArray(result?.items) ? result.items : [];
  const items = rawItems.map(normalizeProposal).filter(Boolean);
  return {
    understanding,
    generatedAt: new Date().toISOString(),
    ideation: {
      ok: result?.ok !== false,
      blank: !!result?.meta?.blank,
      error: result?.error ?? null,
      proposed: rawItems.length,
      kept: items.length,
    },
    items,
  };
}

export async function saveGeneratedOpportunities(report, options = {}) {
  const project = loadProject(options);
  // The buyer/market grounding the founder has stored (if any); fed to the ideator so it does
  // outside product thinking instead of only reading the repo. Empty is fine — it researches live.
  const sc = project.sharedContext ?? {};
  const market = (sc.icp && Object.keys(sc.icp).length) || (sc.positioning && Object.keys(sc.positioning).length)
    ? { icp: sc.icp ?? {}, positioning: sc.positioning ?? {} }
    : null;
  const generated = await generateOpportunities(report, { ideate: options.ideate, market: options.market ?? market });
  const prior = new Map((project.opportunities?.items ?? []).map((item) => [item.id, item]));
  const items = generated.items.map((item) => {
    const existing = prior.get(item.id);
    return existing
      ? { ...item, status: existing.status, selectedAgentIds: existing.selectedAgentIds ?? item.selectedAgentIds, updatedAt: new Date().toISOString() }
      : item;
  });
  const saved = saveProject({
    ...project,
    opportunities: {
      generatedAt: generated.generatedAt,
      sourceContextVersion: project.sharedContext.version,
      understanding: generated.understanding,
      ideation: generated.ideation,
      items,
    },
  }, options);
  return saved.opportunities;
}

export function updateOpportunity(opportunityId, patch, options = {}) {
  const project = loadProject(options);
  const allowed = new Set([
    "status", "title", "objective", "rationale", "provider", "model", "prompt", "ref",
    "input", "output", "selectedAgentIds",
  ]);
  const unknown = Object.keys(patch ?? {}).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(`Unsupported opportunity fields: ${unknown.join(", ")}`);
  let found = false;
  const items = (project.opportunities?.items ?? []).map((item) => {
    if (item.id !== opportunityId) return item;
    found = true;
    const next = { ...item, ...structuredClone(patch), updatedAt: new Date().toISOString() };
    if (!["proposed", "accepted", "rejected", "deferred"].includes(next.status)) {
      throw new Error(`Invalid opportunity status: ${next.status}`);
    }
    return next;
  });
  if (!found) throw new Error(`Opportunity not found: ${opportunityId}`);
  const saved = saveProject({
    ...project,
    opportunities: { ...(project.opportunities ?? {}), items },
  }, options);
  return saved.opportunities.items.find((item) => item.id === opportunityId);
}

export function getOpportunityStudio(options = {}) {
  const project = loadProject(options);
  return project.opportunities ?? { generatedAt: null, sourceContextVersion: null, understanding: null, items: [] };
}
