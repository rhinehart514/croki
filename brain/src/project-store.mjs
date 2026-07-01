import crypto from "node:crypto";
import { channelIdFor, cloneChannelGraph, createBlankChannelGraph } from "./channel-graph.mjs";
import { persistence, storeRoot, PROJECT_COLLECTION, PROJECT_KEY } from "./persistence.mjs";
// Side-effect import: arms the SQLite auto-migration boot hook (registerAutoMigrator) so a fresh,
// empty DB imports any legacy ~/.gtm-ide JSON the first time a provider opens it. project-store is on
// every boot path, so importing the migrator here guarantees the hook is live before the first open.
import "./migrate-to-sqlite.mjs";
import { loadFlow, saveFlow, summarizeRunResult } from "./flow-store.mjs";
import { defaultTeamId } from "./team-store.mjs";

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
  const hasOffer = sharedContext.offer && typeof sharedContext.offer === "object";
  const hasIcps = Array.isArray(sharedContext.icps);
  if (hasOffer && hasIcps) return sharedContext;
  return {
    ...sharedContext,
    offer: hasOffer
      ? sharedContext.offer
      : { price: "", unit: "", terms: "", alternatives: [], status: "inferred" },
    // Back-fill the named-ICP store for projects written before it existed. Empty, never seeded.
    icps: hasIcps ? sharedContext.icps : [],
  };
}

// Shape a founder-stated named-ICP record. Mirrors the `icp` field plus a linking `key`, a human
// `label`, and a `status`. Unknown fields the founder puts on a record are preserved (never a cage);
// the known fields are coerced to a stable shape so board resolution reads them honestly. Records with
// no `key` are dropped — a keyless record can never be linked to a pipeline (setChannelIcp) or resolved.
function normalizeIcps(icps) {
  if (!Array.isArray(icps)) return [];
  return icps
    .map((record) => {
      const source = record && typeof record === "object" ? structuredClone(record) : {};
      const key = String(source.key ?? "").trim();
      if (!key) return null;
      return {
        ...source,
        key,
        label: String(source.label ?? "").trim(),
        query: String(source.query ?? "").trim(),
        geography: String(source.geography ?? "").trim(),
        industry: String(source.industry ?? "").trim(),
        keywords: Array.isArray(source.keywords) ? source.keywords : [],
        hypotheses: Array.isArray(source.hypotheses) ? source.hypotheses : [],
        status: String(source.status ?? "inferred").trim() || "inferred",
      };
    })
    .filter(Boolean);
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
    // The active / default ICP — the single stated ground kept for backward compatibility. Every reader
    // that predates named ICPs still finds its one ICP here.
    icp: {
      query: "",
      geography: "",
      industry: "",
      keywords: [],
      hypotheses: [],
    },
    // Named ICP records: a founder running an ICP-discovery program states several distinct segments and
    // links each pipeline to one by `key` (setChannelIcp). Each record mirrors the `icp` shape plus a
    // `key`/`label`/`status`. `icp` above stays the active default; these are the multi-ICP store the
    // per-pipeline links resolve against. Empty by default so single-ICP projects are unchanged.
    icps: [],
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

// Remove a project from the catalog only — the durable per-project stores (programs, policies,
// foundry, …) are purged separately by project-merge.mjs so this stays a pure catalog edit with no
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

export function projectStoreRoot(options = {}) {
  return root(options);
}

// The team that effectively owns a project. Returns the stored teamId when set, otherwise the founder's
// personal team (created lazily) so a project is never team-less — without forcing every existing
// single-user project to have written a teamId. Backward-compatible: a stored null resolves to the
// personal team only when asked, never on load.
export function projectTeamId(projectId, options = {}) {
  const project = loadProject({ ...options, projectId });
  return project.teamId ?? defaultTeamId(options);
}

// Set (or clear) the team that owns a project. The Convex sync lane calls this to make a project
// multiplayer; passing null restores the personal-team default.
export function setProjectTeam(projectId, teamId, options = {}) {
  const project = loadProject({ ...options, projectId });
  return saveProject({ ...project, teamId: teamId ?? null }, options);
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

export function applySharedContextToGraph(graph, sharedContext) {
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
  const channel = {
    id: input.id,
    graphId: input.graphId,
    name: input.name,
    objective: String(input.objective ?? "").trim(),
    kind: String(input.kind || "custom").trim() || "custom",
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
  const allowed = new Set(["name", "objective", "kind", "enabled"]);
  const unknown = Object.keys(patch ?? {}).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(`Unsupported channel fields: ${unknown.join(", ")}`);
  const channel = { ...current, ...structuredClone(patch ?? {}) };
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
      // Resolve the key against the named-ICP store: if the founder linked by bare key and a matching
      // `sharedContext.icps[]` record exists, adopt that record's label so the stored link reads honestly.
      // An explicit label on the input always wins; with no record and no label the link stays key-only.
      let label = String(raw?.label ?? "").trim();
      if (!label) {
        const record = (project.sharedContext?.icps ?? [])
          .find((entry) => String(entry?.key ?? "").trim() === key);
        if (record) label = String(record.label ?? "").trim();
      }
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
  const channel = {
    id: input.id,
    graphId,
    name,
    objective,
    kind,
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
    "repository", "product", "positioning", "icp", "icps", "founderTaste",
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
  // Normalize the named-ICP store whenever it is patched, so every stored record carries a stable,
  // resolvable shape (keyed, coerced fields) while the active default `icp` is left untouched.
  if (patch && Object.prototype.hasOwnProperty.call(patch, "icps")) {
    sharedContext.icps = normalizeIcps(sharedContext.icps);
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
