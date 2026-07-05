import crypto from "node:crypto";
import { channelIdFor, cloneChannelGraph, createBlankChannelGraph } from "./channel-graph.mjs";
import { persistence, storeRoot, PROJECT_COLLECTION, PROJECT_KEY } from "./persistence.mjs";
// Side-effect import: arms the SQLite auto-migration boot hook (registerAutoMigrator) so a fresh,
// empty DB imports any legacy ~/.gtm-ide JSON the first time a provider opens it. project-store is on
// every boot path, so importing the migrator here guarantees the hook is live before the first open.
import "./migrate-to-sqlite.mjs";
import { loadFlow, saveFlow, summarizeRunResult } from "./flow-store.mjs";
import { defaultTeamId } from "./team-store.mjs";
import { buildAgentProfile, buildAgentBench } from "./memory.mjs";

const SCHEMA_VERSION = 4;
const CATALOG_SCHEMA_VERSION = 1;

function now() {
  return new Date().toISOString();
}

// The per-channel autonomy ladder. A channel starts at "draft" (the gate holds everything, today's
// behavior). The founder can explicitly promote it to "trusted" or "autonomous" — that promotion is
// itself an explicit, revocable founder approval, applied as a STANDING rule: the channel's blessed
// pattern auto-approves the clean items at the gate and holds only the exceptions. The wall is not
// weakened — the founder approved a class of work once and can drop it back to "draft" in one click
// (revokeChannel). Promotion is ALWAYS explicit; nothing on the run path may auto-promote a channel.
const AUTONOMY_LEVELS = new Set(["draft", "trusted", "autonomous"]);

// The standing approval a promoted channel carries. It is the input to gate-pattern.mjs's
// applyPatternApproval at run time, so its shape matches that contract: a decision plus an optional
// confidence threshold and a human note describing the blessed recipe. A promotion always means
// "approve the clean items" — a reject pattern is just draft behavior, so decision is pinned to
// "approve" here.
function normalizeBlessedPattern(input) {
  if (!input || typeof input !== "object") return null;
  const pattern = { decision: "approve", blessedAt: now() };
  if (typeof input.confidenceThreshold === "number") pattern.confidenceThreshold = input.confidenceThreshold;
  if (typeof input.note === "string" && input.note.trim()) pattern.note = input.note.trim();
  if (typeof input.rule === "string" && input.rule.trim()) pattern.rule = input.rule.trim();
  return pattern;
}

// A pipeline-scoped offer/deal — the founder's own words for what this one pipeline puts on the
// table ("50% off, this post only, through Friday"). An OPEN shape: at minimum a plain-words
// `statement`, plus whatever extra fields the composer chooses to attach — no promo schema, no
// closed vocabulary. The project-level sharedContext.offer stays the standing default; a channel
// offer speaks for that pipeline only. Passing null (or nothing usable) clears it.
function normalizeChannelOffer(input) {
  if (input == null) return null;
  if (typeof input === "string") {
    const statement = input.trim();
    return statement ? { statement } : null;
  }
  if (typeof input !== "object" || Array.isArray(input)) {
    throw new Error("A pipeline offer is stated in plain words — pass a statement string or an object carrying one.");
  }
  const statement = String(input.statement ?? "").trim();
  const rest = structuredClone(input);
  if (!statement && Object.keys(rest).length === 0) return null;
  if (!statement) throw new Error("A pipeline offer needs a plain-words statement of the deal.");
  return { ...rest, statement };
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

// Claims are structured first-class objects (the source of truth), projected down to the legacy
// flat string[] at `product.claims` so every existing reader keeps getting plain strings.
//   Claim = { id, text, provenance, evidence, version, createdAt, updatedAt }
// Provenance follows the same one-directional truth valve as product-model-store / opportunity
// normalization: an evidence-free "derived" claim is demoted to "speculative" so an interpretive
// guess can never launder itself back as cited fact. A "founder" claim is the founder's own
// assertion and is never demoted. Bare strings (legacy) default to "speculative".
const CLAIM_PROVENANCE = new Set(["derived", "speculative", "founder"]);

function normalizeClaimProvenance(rawProvenance, evidence = []) {
  if (rawProvenance === "founder") return "founder";
  let provenance = CLAIM_PROVENANCE.has(rawProvenance)
    ? rawProvenance
    : (evidence.length ? "derived" : "speculative");
  if (provenance === "derived" && evidence.length === 0) provenance = "speculative";
  return provenance;
}

function sameEvidence(a = [], b = []) {
  if (a.length !== b.length) return false;
  return a.every((item, index) => JSON.stringify(item) === JSON.stringify(b[index]));
}

// Normalize one raw claim (a legacy string or a structured object) into a structured Claim. When an
// existing claim is matched (by id or text), lineage is preserved: the id, createdAt, and version
// carry forward; the version bumps only when the text actually changes. If nothing changed, the
// existing object is returned untouched so loads never churn versions or timestamps.
function normalizeClaim(raw, index, existing = null) {
  const isString = typeof raw === "string";
  const text = String(isString ? raw : raw?.text ?? "").trim();
  if (!text) return null;
  const evidence = !isString && Array.isArray(raw?.evidence)
    ? raw.evidence.filter(Boolean)
    : existing?.evidence ?? [];
  const provenance = normalizeClaimProvenance(isString ? existing?.provenance : raw?.provenance, evidence);
  const id = (!isString && raw?.id) ? String(raw.id)
    : existing?.id ?? `claim-${slug(text) || crypto.randomBytes(3).toString("hex")}-${index}`;
  const textChanged = existing ? existing.text !== text : true;
  if (existing
    && !textChanged
    && existing.provenance === provenance
    && existing.id === id
    && sameEvidence(existing.evidence ?? [], evidence)) {
    return existing;
  }
  const createdAt = existing?.createdAt ?? (!isString && raw?.createdAt ? raw.createdAt : now());
  const version = existing
    ? (textChanged ? (existing.version ?? 1) + 1 : existing.version ?? 1)
    : Number.isInteger(raw?.version) ? raw.version : 1;
  return { id, text, provenance, evidence, version, createdAt, updatedAt: now() };
}

// Turn a source list (structured claims, legacy strings, or a mix) into structured claims, matching
// each against the previous claims by id or text to preserve lineage.
function reconcileClaimList(source = [], previous = []) {
  const prevById = new Map((previous ?? []).filter((c) => c && c.id).map((c) => [c.id, c]));
  const prevByText = new Map((previous ?? []).filter((c) => c && c.text).map((c) => [c.text, c]));
  return (source ?? [])
    .map((raw, index) => {
      const text = String(typeof raw === "string" ? raw : raw?.text ?? "").trim();
      const existing = (raw && typeof raw === "object" && raw.id && prevById.get(raw.id))
        || prevByText.get(text)
        || null;
      return normalizeClaim(raw, index, existing);
    })
    .filter(Boolean);
}

// Idempotent default-fill for STATED shared-context fields added after a project was first written.
// It only adds a field when it is missing, so it never churns existing claims, experiments, or any
// other data on load — a re-load is a no-op once the field exists.
function ensureStatedDefaults(sharedContext) {
  if (!sharedContext) return sharedContext;
  if (sharedContext.offer && typeof sharedContext.offer === "object") return sharedContext;
  return {
    ...sharedContext,
    offer: { price: "", unit: "", terms: "", alternatives: [], status: "inferred" },
  };
}

// Reconcile a shared context so that `claims` (structured, source of truth) and `product.claims`
// (the flat string[] projection every legacy reader expects) are consistent. Structured claims win
// when present; otherwise the legacy `product.claims` strings are the source. Idempotent.
function normalizeSharedContextClaims(sharedContext) {
  if (!sharedContext) return sharedContext;
  const structuredFirst = Array.isArray(sharedContext.claims) && sharedContext.claims.length;
  const previous = (structuredFirst && typeof sharedContext.claims[0] === "object") ? sharedContext.claims : [];
  const source = structuredFirst ? sharedContext.claims : (sharedContext.product?.claims ?? []);
  const structured = reconcileClaimList(source, previous);
  return {
    ...sharedContext,
    claims: structured,
    product: { ...(sharedContext.product ?? {}), claims: structured.map((claim) => claim.text) },
  };
}

// The flat string[] projection of structured claims — the view every legacy reader consumes.
export function claimTexts(claims = []) {
  return (claims ?? []).map((claim) => (typeof claim === "string" ? claim : claim?.text)).filter(Boolean);
}

function root(options = {}) {
  return storeRoot(options);
}

// The project catalog is the one singleton store — a single object addressed by the fixed
// (PROJECT_COLLECTION, PROJECT_KEY) pair. The JSON backend keeps writing it to project.json at the
// root, so the on-disk layout legacy readers expect is preserved.
function loadCatalogRaw(options = {}) {
  return persistence(options).get(PROJECT_COLLECTION, PROJECT_KEY);
}

function writeCatalog(value, options = {}) {
  persistence(options).set(PROJECT_COLLECTION, PROJECT_KEY, value);
}

function emptySharedContext() {
  return {
    version: 1,
    updatedAt: null,
    repository: {
      workspaceId: null,
      repo: null,
      outcome: null,
      headline: null,
      evidence: [],
    },
    product: {
      name: "",
      description: "",
      valueProps: [],
      claims: [],
    },
    claims: [],
    positioning: {
      category: "",
      audience: "",
      problem: "",
      promise: "",
      alternatives: [],
      status: "inferred",
    },
    // The offer — a founder-STATED layer (price, unit, terms, the alternatives it competes against).
    // Stated, not derived: the founder asserts it. Trigger and Play are DERIVED elsewhere (from
    // appearance triggers and the run ledger), so they get no stated field here.
    offer: {
      price: "",
      unit: "",
      terms: "",
      alternatives: [],
      status: "inferred",
    },
    icp: {
      query: "",
      geography: "",
      industry: "",
      keywords: [],
      hypotheses: [],
    },
    founderTaste: {
      approvedPatterns: [],
      rejectedPatterns: [],
      edits: [],
      policies: [],
    },
    contacts: {},
    outcomes: [],
    experiments: [],
    artifacts: [],
    productFeedback: [],
  };
}

function defaultProject(input = {}) {
  const createdAt = now();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: input.id || "default",
    name: input.name || "GTM portfolio",
    // The team that owns this project, optional and backward-compatible. Defaults to null on disk and
    // is resolved to the founder's personal team only when read (projectTeamId), so a fresh DB never
    // forces a team to exist and existing single-user projects keep working untouched. The Convex sync
    // lane sets a real team id here to make the project multiplayer.
    teamId: input.teamId ?? null,
    createdAt,
    updatedAt: createdAt,
    activeChannelId: null,
    channels: [],
    sharedContext: emptySharedContext(),
  };
}

function migrateProject(project, options = {}) {
  if (project?.schemaVersion === SCHEMA_VERSION && Array.isArray(project.channels)) {
    return {
      ...project,
      teamId: project.teamId ?? null,
      sharedContext: ensureStatedDefaults(normalizeSharedContextClaims(project.sharedContext ?? emptySharedContext())),
    };
  }
  const next = {
    ...defaultProject(),
    ...project,
    schemaVersion: SCHEMA_VERSION,
    channels: Array.isArray(project?.channels) ? project.channels : [],
    sharedContext: project?.sharedContext ?? emptySharedContext(),
  };
  if (!next.channels.length && Array.isArray(project?.channelIds)) {
    next.channels = project.channelIds.map((id) => ({
      id,
      graphId: id,
      name: id === "cold-outbound-v1" ? "Cold outbound" : id,
      kind: "custom",
      objective: "",
      enabled: true,
      createdAt: next.createdAt ?? now(),
    }));
  }

  // Schema v2 briefly auto-seeded six opinionated motions. Remove untouched
  // generated channels during migration, while preserving any channel that has
  // actual runs or a graph revision.
  if (project?.schemaVersion === 2) {
    next.channels = next.channels.filter((channel) => {
      const flow = loadFlow(channel.graphId, null, options);
      return (flow.runs?.length ?? 0) > 0 || (flow.graph?.revision ?? 0) > 0;
    });
  }
  if (!next.channels.some((channel) => channel.id === next.activeChannelId)) {
    next.activeChannelId = next.channels[0]?.id ?? null;
  }
  next.sharedContext = ensureStatedDefaults(normalizeSharedContextClaims(next.sharedContext));
  return next;
}

function migrateCatalog(stored, options = {}) {
  if (stored?.catalogSchemaVersion === CATALOG_SCHEMA_VERSION && Array.isArray(stored.projects)) {
    const projects = stored.projects.map((project) => migrateProject(project, options));
    const activeProjectId = projects.some((project) => project.id === stored.activeProjectId)
      ? stored.activeProjectId
      : projects[0]?.id ?? null;
    return { catalogSchemaVersion: CATALOG_SCHEMA_VERSION, activeProjectId, projects };
  }

  // The pre-project-picker shape was one project stored directly in project.json.
  // Preserve it as the first project rather than moving or rewriting its flows.
  const legacy = stored ? migrateProject(stored, options) : defaultProject();
  return {
    catalogSchemaVersion: CATALOG_SCHEMA_VERSION,
    activeProjectId: legacy.id,
    projects: [legacy],
  };
}

function ensureChannelFlows(project, options = {}) {
  for (const channel of project.channels) {
    const current = loadFlow(channel.graphId, null, options);
    if (current.graph) continue;
    saveFlow(createBlankChannelGraph({
      id: channel.graphId,
      name: channel.name,
      objective: channel.objective,
      kind: channel.kind,
    }), options);
  }
}

export function loadProjectCatalog(options = {}) {
  const stored = loadCatalogRaw(options);
  const catalog = migrateCatalog(stored, options);
  for (const project of catalog.projects) ensureChannelFlows(project, options);
  if (!stored || stored.catalogSchemaVersion !== CATALOG_SCHEMA_VERSION) {
    writeCatalog(catalog, options);
  }
  return catalog;
}

export function loadProject(options = {}) {
  const catalog = loadProjectCatalog(options);
  const projectId = options.projectId || catalog.activeProjectId;
  const project = catalog.projects.find((item) => item.id === projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  return project;
}

export function saveProject(project, options = {}) {
  const durable = {
    ...project,
    schemaVersion: SCHEMA_VERSION,
    updatedAt: now(),
  };
  const catalog = loadProjectCatalog(options);
  const exists = catalog.projects.some((item) => item.id === durable.id);
  const projects = exists
    ? catalog.projects.map((item) => item.id === durable.id ? durable : item)
    : [...catalog.projects, durable];
  writeCatalog({
    ...catalog,
    activeProjectId: catalog.activeProjectId || durable.id,
    projects,
  }, options);
  ensureChannelFlows(durable, options);
  return durable;
}

function projectIdFor(name, existingIds = []) {
  return channelIdFor(name || "project", existingIds);
}

export function listProjects(options = {}) {
  const catalog = loadProjectCatalog(options);
  return {
    activeProjectId: catalog.activeProjectId,
    projects: catalog.projects.map((project) => ({
      id: project.id,
      name: project.name,
      repo: project.sharedContext?.repository?.repo ?? null,
      outcome: project.sharedContext?.repository?.outcome ?? null,
      headline: project.sharedContext?.repository?.headline ?? null,
      channelCount: getProjectChannels(project, options).length,
      updatedAt: project.updatedAt,
    })),
  };
}

export function createProject(input = {}, options = {}) {
  const catalog = loadProjectCatalog(options);
  const name = String(input.name || "").trim();
  if (!name) throw new Error("Project name is required.");
  const starter = catalog.projects.length === 1
    && catalog.projects[0].id === "default"
    && catalog.projects[0].channels.length === 0
    && !catalog.projects[0].sharedContext?.repository?.repo;
  const existingIds = starter ? [] : catalog.projects.map((project) => project.id);
  const id = projectIdFor(input.id || name, existingIds);
  const project = defaultProject({ id, name });
  const savedCatalog = {
    ...catalog,
    activeProjectId: id,
    projects: starter ? [project] : [...catalog.projects, project],
  };
  writeCatalog(savedCatalog, options);
  return { project, activeProjectId: id };
}

export function setActiveProject(projectId, options = {}) {
  const catalog = loadProjectCatalog(options);
  if (!catalog.projects.some((project) => project.id === projectId)) {
    throw new Error(`Project not found: ${projectId}`);
  }
  writeCatalog({ ...catalog, activeProjectId: projectId }, options);
  return loadProject({ ...options, projectId });
}

// Remove a project from the catalog only — the durable per-project stores are purged
// separately by project-merge.mjs so this stays a pure catalog edit with no
// cross-store imports. A merge calls it to drop each source once its records have moved; a plain
// delete calls it after purging. The active project never dangles: if the removed one was active,
// the first survivor takes over. The catalog always keeps at least one project.
export function deleteProjectFromCatalog(projectId, options = {}) {
  const catalog = loadProjectCatalog(options);
  if (!catalog.projects.some((project) => project.id === projectId)) {
    throw new Error(`Project not found: ${projectId}`);
  }
  const projects = catalog.projects.filter((project) => project.id !== projectId);
  if (!projects.length) throw new Error("Cannot delete the last remaining project.");
  const activeProjectId = catalog.activeProjectId === projectId
    ? projects[0].id
    : catalog.activeProjectId;
  writeCatalog({ ...catalog, activeProjectId, projects }, options);
  return { activeProjectId, deletedId: projectId };
}

// The team that effectively owns a project. Returns the stored teamId when set, otherwise the founder's
// personal team (created lazily) so a project is never team-less — without forcing every existing
// single-user project to have written a teamId. Backward-compatible: a stored null resolves to the
// personal team only when asked, never on load.
export function projectTeamId(projectId, options = {}) {
  const project = loadProject({ ...options, projectId });
  return project.teamId ?? defaultTeamId(options);
}

function channelFromLegacy(project, channel, options = {}) {
  const flow = loadFlow(channel.graphId, null, options);
  const runs = flow.runs ?? [];
  const lastRun = runs.at(-1) ?? null;
  return {
    ...channel,
    // Default a legacy channel (written before the autonomy ladder) to the safe rung: draft, no
    // standing pattern, so the gate holds everything until the founder explicitly promotes it.
    autonomy: AUTONOMY_LEVELS.has(channel.autonomy) ? channel.autonomy : "draft",
    blessedPattern: channel.blessedPattern ?? null,
    status: deriveChannelStatus(runs),
    lastRunAt: lastRun?.createdAt ?? null,
    lastRunOk: lastRun ? lastRun.ok === true : null,
    pendingGates: lastRun?.pendingGates?.length ?? 0,
    nodeCount: flow.graph?.nodes?.length ?? 0,
    runCount: runs.length,
    graphRevision: flow.graph?.revision ?? 0,
    lastRunResult: lastRun ? summarizeRunResult(lastRun) : null,
  };
}

export function getProjectChannels(project, options = {}) {
  return (project.channels ?? []).map((channel) => channelFromLegacy(project, channel, options));
}

export function getChannel(project, channelId, options = {}) {
  const channel = getProjectChannels(project, options).find((item) => item.id === channelId || item.graphId === channelId);
  if (!channel) throw new Error(`Channel not found: ${channelId}`);
  return channel;
}

// Every persisted run across a project's pipelines, oldest → newest, concatenated in channel order.
// The taste ledger a project's agents learned from lives spread across its channels' flows; this
// gathers them so a per-agent read sees the whole history. Reads only — never runs anything.
export function loadProjectRuns(projectId, options = {}) {
  const project = loadProject({ ...options, projectId });
  const runs = [];
  for (const channel of getProjectChannels(project, options)) {
    if (!channel.graphId) continue;
    const { runs: flowRuns } = loadFlow(channel.graphId, null, options);
    if (Array.isArray(flowRuns)) runs.push(...flowRuns);
  }
  return runs;
}

// The agent face's profile: how a single agent has learned from the founder, derived only from real
// run state. Reads the project's whole run ledger, filters to the items THIS agent produced (stamped
// item.agentRef), and returns derived counts + last edits + a rendered current-voice summary. An agent
// with no runs returns an honest empty (hasRuns false, "no runs yet") — never a faked number. Tests
// can inject a run set via options.runs to bypass disk.
export function getAgentProfile(projectId, agentRef, options = {}) {
  const runs = Array.isArray(options.runs) ? options.runs : loadProjectRuns(projectId, options);
  return buildAgentProfile(runs, agentRef, {
    ...(Number.isFinite(options.editLimit) ? { editLimit: options.editLimit } : {}),
    ...(Number.isFinite(options.voiceExamples) ? { voiceExamples: options.voiceExamples } : {}),
  });
}

// The agents THIS product actually uses — its real crew. Each pipeline composes its own project-
// specific agents into its graph (an agent node carries a `ref` and a `label` that reads as the job);
// this gathers them, ref + label, plus any agent seen in the run ledger. That is a different, narrower
// set than the cross-venture agent library on disk (`gtm-*`, shared across products), so the bench reads
// as "Strelva's crew" rather than every agent that happens to exist. Deduped by ref, first label wins.
// Empty means nothing scopes it yet (a fresh project with no pipelines); the caller then falls back to
// the library roster so the bench still shows the specialists available, never a mysterious blank.
export function projectAgents(projectId, options = {}) {
  const byRef = new Map();
  let project;
  try { project = loadProject({ ...options, projectId }); } catch { return []; }
  for (const channel of getProjectChannels(project, options)) {
    if (!channel.graphId) continue;
    let flow;
    try { flow = loadFlow(channel.graphId, null, options); } catch { continue; }
    for (const node of flow.graph?.nodes ?? []) {
      if (node?.kind !== "agent") continue;
      const ref = node.ref ?? node.config?.ref ?? null;
      if (!ref || byRef.has(ref)) continue;
      byRef.set(ref, { ref, description: typeof node.label === "string" ? node.label : "" });
    }
    for (const run of flow.runs ?? []) {
      const nodes = run?.result?.nodes;
      if (!nodes) continue;
      for (const runNode of Object.values(nodes)) {
        if (!Array.isArray(runNode?.items)) continue;
        for (const item of runNode.items) {
          if (item?.agentRef && !byRef.has(item.agentRef)) byRef.set(item.agentRef, { ref: item.agentRef, description: "" });
        }
      }
    }
  }
  return [...byRef.values()];
}

// The bench: every crew agent's compact track record over the SAME project run ledger, loaded once. The
// roster is THIS product's composed crew (see projectAgents) so the bench reads as the specialists this
// product actually uses, not the whole cross-venture library on disk. When nothing scopes it yet (a
// fresh project with no pipelines) it falls back to the library roster the caller passes. The run set
// defaults to the whole project ledger but can be injected in tests. Pure derivation on top of
// buildAgentBench — honest empties for never-run agents, no seeded numbers.
export function getAgentBench(projectId, { agents = [], runs } = {}, options = {}) {
  const runSet = Array.isArray(runs) ? runs : loadProjectRuns(projectId, options);
  const crew = projectAgents(projectId, options);
  const roster = crew.length ? crew : agents;
  return buildAgentBench(runSet, roster);
}

// `channelOffer` (optional) is the pipeline's own offer/deal in the founder's words — when the run
// belongs to a channel that carries one, it rides into the run context ahead of the project-level
// sharedContext.offer, so a drafting step honors the pipeline's deal without the founder restating it.
export function applySharedContextToGraph(graph, sharedContext, { channelOffer = null } = {}) {
  if (!graph) return graph;
  const next = structuredClone(graph);
  const product = sharedContext?.product ?? {};
  const icp = sharedContext?.icp ?? {};
  next.sharedContextVersion = sharedContext?.version ?? 0;
  next.nodes = next.nodes.map((node) => {
    if (node.id === "ctx-learning") {
      return {
        ...node,
        config: {
          ...node.config,
          repository: sharedContext?.repository ?? {},
          product: sharedContext?.product ?? {},
          positioning: sharedContext?.positioning ?? {},
          icp: sharedContext?.icp ?? {},
          offer: channelOffer ?? sharedContext?.offer ?? {},
          founderTaste: sharedContext?.founderTaste ?? {},
          outcomes: sharedContext?.outcomes ?? [],
          experiments: sharedContext?.experiments ?? [],
          productFeedback: sharedContext?.productFeedback ?? [],
        },
      };
    }
    if (node.id === "ctx-product" || (node.category === "context" && node.connector === "product")) {
      return {
        ...node,
        config: {
          ...node.config,
          name: product.name || node.config?.name || "",
          description: product.description || node.config?.description || "",
          valueProps: product.valueProps?.length ? product.valueProps : node.config?.valueProps ?? [],
          claims: product.claims ?? [],
          positioning: sharedContext?.positioning ?? {},
          repository: sharedContext?.repository ?? {},
        },
      };
    }
    if (node.id === "ctx-icp" || (node.category === "context" && node.connector === "icp")) {
      return {
        ...node,
        config: {
          ...node.config,
          query: icp.query || node.config?.query || "",
          geography: icp.geography || node.config?.geography || "",
          industry: icp.industry || node.config?.industry || "",
          keywords: icp.keywords?.length ? icp.keywords : node.config?.keywords ?? [],
          hypotheses: icp.hypotheses ?? [],
        },
      };
    }
    return node;
  });
  return next;
}

export function setActiveChannel(channelId, options = {}) {
  const project = loadProject(options);
  const channel = getChannel(project, channelId, options);
  return saveProject({ ...project, activeChannelId: channel.id }, options);
}

export function setActiveWorkflow(workflowId, options = {}) {
  return setActiveChannel(workflowId, options);
}

export function createChannel(input, options = {}) {
  const project = loadProject(options);
  const name = String(input?.name || "").trim();
  if (!name) throw new Error("Channel name is required.");
  const existingIds = getProjectChannels(project, options).map((channel) => channel.id);
  const id = channelIdFor(input.id || name, existingIds);
  return createFlowChannel(project, {
    id,
    name,
    objective: String(input.objective || "").trim(),
    kind: String(input.kind || "custom").trim() || "custom",
    offer: input.offer,
  }, options);
}

// Register an already-composed pipeline (its executable flow is ALREADY saved by composeNakedGraph) as
// a channel on the project, so it joins the others on the overview. Idempotent by id/graphId — a
// re-compose of the same pipeline never duplicates it. This is the wire that lets one product hold
// MANY pipelines: the operator composes each one, then registers it here.
export function registerComposedChannel(input, options = {}) {
  const project = loadProject(options);
  const existing = (project.channels ?? []).find(
    (channel) => channel.id === input.id || channel.graphId === input.graphId,
  );
  if (existing) return { project, channel: getChannel(project, existing.id, options) };
  const offer = normalizeChannelOffer(input.offer ?? null);
  const channel = {
    id: input.id,
    graphId: input.graphId,
    name: input.name,
    objective: String(input.objective ?? "").trim(),
    kind: String(input.kind || "custom").trim() || "custom",
    ...(offer ? { offer } : {}),
    enabled: true,
    // A freshly composed channel starts at the bottom of the autonomy ladder: draft, no standing
    // pattern. The founder promotes it deliberately once a run has earned trust.
    autonomy: "draft",
    blessedPattern: null,
    createdAt: now(),
  };
  const channels = [...(project.channels ?? []), channel];
  const saved = saveProject({
    ...project,
    channels,
    activeChannelId: project.activeChannelId || channel.id,
  }, options);
  return { project: saved, channel: getChannel(saved, channel.id, options) };
}

export function duplicateChannel(channelId, input = {}, options = {}) {
  const project = loadProject(options);
  const source = getChannel(project, channelId, options);
  const sourceFlow = loadFlow(source.graphId, null, options);
  const name = String(input.name || `${source.name} copy`).trim();
  const id = channelIdFor(input.id || name, getProjectChannels(project, options).map((channel) => channel.id));
  const graphId = project.id === "default" ? id : `${project.id}--${id}`;
  const objective = String(input.objective ?? source.objective ?? "").trim();
  const kind = String(input.kind ?? source.kind ?? "custom").trim() || "custom";
  const graph = cloneChannelGraph(sourceFlow.graph ?? source.workflowGraph ?? createBlankChannelGraph(source), {
    id,
    name,
    objective,
    kind,
  });
  return createFlowChannel(project, {
    id,
    graphId,
    name,
    objective,
    kind,
    workflowGraph: { ...graph, id: graphId },
  }, options);
}

export function updateChannel(channelId, patch, options = {}) {
  const project = loadProject(options);
  const current = getChannel(project, channelId, options);
  const allowed = new Set(["name", "objective", "kind", "enabled", "offer"]);
  const unknown = Object.keys(patch ?? {}).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(`Unsupported channel fields: ${unknown.join(", ")}`);
  const channel = { ...current, ...structuredClone(patch ?? {}) };
  if (patch && Object.prototype.hasOwnProperty.call(patch, "offer")) {
    const offer = normalizeChannelOffer(patch.offer);
    if (offer) channel.offer = offer;
    else delete channel.offer;
  }
  if (!String(channel.name || "").trim()) throw new Error("Channel name is required.");
  const flow = loadFlow(current.graphId, null, options);
  const workflowGraph = flow.graph ? {
    ...flow.graph,
    name: channel.name,
    objective: channel.objective,
    kind: channel.kind,
  } : null;
  if (workflowGraph) saveFlow(workflowGraph, options);
  const legacyChannels = (project.channels ?? []).map((item) => item.id === current.id ? channel : item);
  const projected = getProjectChannels({ ...project, channels: legacyChannels }, options);
  const nextActive = channel.enabled === false && project.activeChannelId === channel.id
    ? projected.find((item) => item.enabled !== false && item.id !== channel.id)?.id ?? null
    : project.activeChannelId;
  const saved = saveProject({ ...project, channels: legacyChannels, activeChannelId: nextActive }, options);
  return { project: saved, channel };
}

// Move a channel to an autonomy rung and stamp (or clear) its standing approval on the channel's gate
// nodes, so the next run reads the founder's decision straight off the graph. Shared by promote and
// revoke. Writing the pattern onto the gate node config keeps the wire self-contained: the gate
// connector reads node.config, with no new threading through the run path. Draft clears the config,
// reverting to hold-everything in one save.
function setChannelAutonomy(project, current, level, blessedPattern, options = {}) {
  const record = (project.channels ?? []).find((channel) => channel.id === current.id);
  if (!record) throw new Error(`Channel not found: ${current.id}`);
  const pattern = level === "draft" ? null : blessedPattern;
  const nextRecord = { ...record, autonomy: level, blessedPattern: pattern, autonomyUpdatedAt: now() };

  const flow = loadFlow(current.graphId, null, options);
  if (flow.graph?.nodes?.length) {
    const nodes = flow.graph.nodes.map((node) => {
      if (node.category !== "gate") return node;
      const config = { ...(node.config ?? {}) };
      if (level === "draft") {
        delete config.autonomy;
        delete config.blessedPattern;
      } else {
        config.autonomy = level;
        config.blessedPattern = pattern;
      }
      return { ...node, config };
    });
    saveFlow({ ...flow.graph, nodes }, options);
  }

  const channels = (project.channels ?? []).map((channel) => (channel.id === current.id ? nextRecord : channel));
  const saved = saveProject({ ...project, channels }, options);
  return { project: saved, channel: getChannel(saved, current.id, options) };
}

// Promote a channel UP the autonomy ladder ("trusted" or "autonomous") behind a blessed pattern. This
// is ALWAYS an explicit founder action — never called from a run path — and it is the standing form of
// a gate approval: from now on the channel's gate auto-approves the clean items and holds only the
// exceptions. Requires a blessed pattern (the recipe the founder is standing behind); refuses without
// one and refuses a promotion to "draft" (that is revokeChannel's job).
export function promoteChannel(channelId, input = {}, options = {}) {
  const project = loadProject(options);
  const current = getChannel(project, channelId, options);
  const level = String(input.autonomy || "trusted").trim();
  if (level === "draft" || !AUTONOMY_LEVELS.has(level)) {
    throw new Error(`promoteChannel needs an autonomy level of "trusted" or "autonomous", got "${level}".`);
  }
  const blessedPattern = normalizeBlessedPattern(input.blessedPattern);
  if (!blessedPattern) {
    throw new Error("Promoting a channel requires a blessed pattern — the standing approval the gate applies.");
  }
  return setChannelAutonomy(project, current, level, blessedPattern, options);
}

// Drop a channel back to "draft" in one call — instantly reverting to hold-everything at the gate and
// clearing the standing pattern off its gate nodes. Always available; the founder can revoke trust the
// moment a run surprises them.
export function revokeChannel(channelId, options = {}) {
  const project = loadProject(options);
  const current = getChannel(project, channelId, options);
  return setChannelAutonomy(project, current, "draft", null, options);
}

// Link a pipeline (channel) to an ICP ground it tests — the EXPLICIT founder-set counterpart to the
// experiment-derived ICP grounds. The founder says "this pipeline targets THIS ICP" directly, by key
// (with an optional human label). Typed and reversible: passing null — or an empty/blank key — CLEARS
// the link, dropping the pipeline back to the project's base ICP ground. It writes ONLY the channel's
// `icp` link; it NEVER touches `autonomy` or `blessedPattern` (those move ONLY through promoteChannel /
// revokeChannel behind an explicit promotion), so linking an ICP can never move a pipeline up the wall.
export function setChannelIcp(channelId, icp, options = {}) {
  const project = loadProject(options);
  const current = getChannel(project, channelId, options);
  const record = (project.channels ?? []).find((channel) => channel.id === current.id);
  if (!record) throw new Error(`Channel not found: ${channelId}`);
  let link = null;
  if (icp != null) {
    const raw = typeof icp === "string" ? { key: icp } : icp;
    const key = String(raw?.key ?? raw?.icpKey ?? "").trim();
    if (key) {
      const label = String(raw?.label ?? "").trim();
      link = { key, ...(label ? { label } : {}) };
    }
  }
  const nextRecord = { ...record };
  if (link) nextRecord.icp = link;
  else delete nextRecord.icp;
  const channels = (project.channels ?? []).map((channel) => (channel.id === current.id ? nextRecord : channel));
  const saved = saveProject({ ...project, channels }, options);
  return { project: saved, channel: getChannel(saved, current.id, options) };
}

// A channel is a flow: a stored channel record in project.channels plus its executable graph in the
// flow store. No outcome program, no domain events — just the system the founder builds.
function createFlowChannel(project, input = {}, options = {}) {
  const kind = String(input.kind || "custom").trim() || "custom";
  const graphId = input.graphId || (project.id === "default" ? input.id : `${project.id}--${input.id}`);
  const name = input.name;
  const objective = input.objective ?? "";
  const workflowGraph = {
    ...(input.workflowGraph ?? createBlankChannelGraph({ id: graphId, name, objective, kind })),
    id: graphId,
    name,
    objective,
    kind,
  };
  saveFlow(workflowGraph, options);
  const offer = normalizeChannelOffer(input.offer ?? null);
  const channel = {
    id: input.id,
    graphId,
    name,
    objective,
    kind,
    ...(offer ? { offer } : {}),
    enabled: input.enabled !== false,
    // New channels start at the bottom of the autonomy ladder: draft, no standing pattern. The gate
    // holds everything until the founder explicitly promotes the channel (promoteChannel).
    autonomy: "draft",
    blessedPattern: null,
    createdAt: now(),
  };
  const channels = [...(project.channels ?? []), channel];
  const saved = saveProject({
    ...project,
    channels,
    activeChannelId: project.activeChannelId || channel.id,
  }, options);
  return { project: saved, channel: getChannel(saved, channel.id, options) };
}

export function updateSharedContext(patch, options = {}) {
  const project = loadProject(options);
  const current = project.sharedContext ?? emptySharedContext();
  const allowed = new Set([
    "repository", "product", "positioning", "icp", "founderTaste",
    "contacts", "outcomes", "experiments", "artifacts", "productFeedback",
    "claims", "offer",
  ]);
  const unknown = Object.keys(patch ?? {}).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(`Unsupported shared-context fields: ${unknown.join(", ")}`);
  const sharedContext = { ...current, updatedAt: now(), version: (current.version ?? 0) + 1 };
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (Array.isArray(value)) sharedContext[key] = structuredClone(value);
    else if (value && typeof value === "object") sharedContext[key] = { ...current[key], ...structuredClone(value) };
    else sharedContext[key] = value;
  }
  // Reconcile claims against the structured source of truth. A top-level `claims` write is the
  // structured front door; a legacy `product.claims` write (strings) is still honored. Lineage is
  // matched against the current structured claims, assigning ids/versions and demoting provenance.
  const patchedClaims = patch && Object.prototype.hasOwnProperty.call(patch, "claims");
  const patchedProductClaims = patch?.product && Object.prototype.hasOwnProperty.call(patch.product, "claims");
  const claimSource = patchedClaims ? sharedContext.claims
    : patchedProductClaims ? sharedContext.product.claims
    : (current.claims?.length ? current.claims : sharedContext.product?.claims ?? []);
  const structuredClaims = reconcileClaimList(claimSource, current.claims ?? []);
  sharedContext.claims = structuredClaims;
  sharedContext.product = { ...(sharedContext.product ?? {}), claims: structuredClaims.map((claim) => claim.text) };
  return saveProject({ ...project, sharedContext }, options);
}

// Structured claim writes. Each loads the current claims, mutates the list, and routes through
// updateSharedContext so id/version assignment, provenance demotion, and the string[] projection
// all stay in one place. Read-only listing returns the structured objects.
export function listClaims(options = {}) {
  return loadProject(options).sharedContext?.claims ?? [];
}

export function addClaim(input, options = {}) {
  const project = loadProject(options);
  const claims = [...(project.sharedContext?.claims ?? []), input];
  const saved = updateSharedContext({ claims }, options);
  return { claims: saved.sharedContext.claims, claim: saved.sharedContext.claims.at(-1) };
}

export function updateClaim(id, patch, options = {}) {
  const project = loadProject(options);
  const current = project.sharedContext?.claims ?? [];
  if (!current.some((claim) => claim.id === id)) throw new Error(`Claim not found: ${id}`);
  const claims = current.map((claim) => (claim.id === id ? { ...claim, ...structuredClone(patch ?? {}), id } : claim));
  const saved = updateSharedContext({ claims }, options);
  return { claims: saved.sharedContext.claims, claim: saved.sharedContext.claims.find((claim) => claim.id === id) ?? null };
}

export function removeClaim(id, options = {}) {
  const project = loadProject(options);
  const claims = (project.sharedContext?.claims ?? []).filter((claim) => claim.id !== id);
  const saved = updateSharedContext({ claims }, options);
  return { claims: saved.sharedContext.claims };
}

export function groundProjectInWorkspace(workspace, options = {}) {
  const report = workspace.report;
  const evidence = [
    ...(report.analytics?.citations ?? []),
    ...(report.attribution?.citations ?? []),
    ...(report.winEvent?.citations ?? []),
    ...(report.gaps ?? []).flatMap((gap) => gap.citations ?? []),
  ];
  return updateSharedContext({
    repository: {
      workspaceId: workspace.id,
      repo: workspace.repo,
      outcome: workspace.outcome,
      headline: report.headline,
      evidence,
    },
  }, options);
}

function deriveChannelStatus(runs) {
  if (!runs?.length) return "idle";
  const last = runs.at(-1);
  if (last.pendingGates?.length) return "waiting";
  return last.ok === true ? "done" : "error";
}

export function getProjectWithChannels(options = {}) {
  const project = loadProject(options);
  const channels = getProjectChannels(project, options);
  return {
    id: project.id,
    name: project.name,
    activeChannelId: channels.some((channel) => channel.id === project.activeChannelId)
      ? project.activeChannelId
      : channels[0]?.id ?? null,
    sharedContext: project.sharedContext,
    channels,
  };
}
