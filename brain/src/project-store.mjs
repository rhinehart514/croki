import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { channelIdFor, cloneChannelGraph, createBlankChannelGraph } from "./channel-graph.mjs";
import { loadFlow, saveFlow } from "./flow-store.mjs";

const SCHEMA_VERSION = 4;
const CATALOG_SCHEMA_VERSION = 1;

function now() {
  return new Date().toISOString();
}

function root(options = {}) {
  return options.root || process.env.GTM_IDE_HOME || path.join(os.homedir(), ".gtm-ide");
}

function projectFile(options = {}) {
  return path.join(root(options), "project.json");
}

function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
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
    positioning: {
      category: "",
      audience: "",
      problem: "",
      promise: "",
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
    createdAt,
    updatedAt: createdAt,
    activeChannelId: null,
    channels: [],
    sharedContext: emptySharedContext(),
    opportunities: {
      generatedAt: null,
      sourceContextVersion: null,
      items: [],
    },
  };
}

function migrateProject(project, options = {}) {
  if (project?.schemaVersion === SCHEMA_VERSION && Array.isArray(project.channels)) {
    return {
      ...project,
      opportunities: project.opportunities ?? defaultProject().opportunities,
    };
  }
  const next = {
    ...defaultProject(),
    ...project,
    schemaVersion: SCHEMA_VERSION,
    channels: Array.isArray(project?.channels) ? project.channels : [],
    sharedContext: project?.sharedContext ?? emptySharedContext(),
    opportunities: project?.opportunities ?? defaultProject().opportunities,
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
  const file = projectFile(options);
  const stored = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
  const catalog = migrateCatalog(stored, options);
  for (const project of catalog.projects) ensureChannelFlows(project, options);
  if (!stored || stored.catalogSchemaVersion !== CATALOG_SCHEMA_VERSION) {
    write(file, catalog);
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
  write(projectFile(options), {
    ...catalog,
    activeProjectId: catalog.activeProjectId || durable.id,
    projects,
  });
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
      channelCount: project.channels.length,
      opportunityCount: project.opportunities?.items?.length ?? 0,
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
    && !catalog.projects[0].sharedContext?.repository?.repo
    && !(catalog.projects[0].opportunities?.items?.length);
  const existingIds = starter ? [] : catalog.projects.map((project) => project.id);
  const id = projectIdFor(input.id || name, existingIds);
  const project = defaultProject({ id, name });
  const savedCatalog = {
    ...catalog,
    activeProjectId: id,
    projects: starter ? [project] : [...catalog.projects, project],
  };
  write(projectFile(options), savedCatalog);
  return { project, activeProjectId: id };
}

export function setActiveProject(projectId, options = {}) {
  const catalog = loadProjectCatalog(options);
  if (!catalog.projects.some((project) => project.id === projectId)) {
    throw new Error(`Project not found: ${projectId}`);
  }
  write(projectFile(options), { ...catalog, activeProjectId: projectId });
  return loadProject({ ...options, projectId });
}

export function getChannel(project, channelId) {
  const channel = project.channels.find((item) => item.id === channelId || item.graphId === channelId);
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
  const channel = getChannel(project, channelId);
  return saveProject({ ...project, activeChannelId: channel.id }, options);
}

export function createChannel(input, options = {}) {
  const project = loadProject(options);
  const name = String(input?.name || "").trim();
  if (!name) throw new Error("Channel name is required.");
  const id = channelIdFor(input.id || name, project.channels.map((channel) => channel.id));
  const channel = {
    id,
    graphId: project.id === "default" ? id : `${project.id}--${id}`,
    name,
    kind: String(input.kind || "custom").trim() || "custom",
    objective: String(input.objective || "").trim(),
    enabled: true,
    createdAt: now(),
  };
  saveFlow(createBlankChannelGraph(channel), options);
  const saved = saveProject({
    ...project,
    channels: [...project.channels, channel],
    activeChannelId: project.activeChannelId || channel.id,
  }, options);
  return { project: saved, channel };
}

export function duplicateChannel(channelId, input = {}, options = {}) {
  const project = loadProject(options);
  const source = getChannel(project, channelId);
  const sourceFlow = loadFlow(source.graphId, null, options);
  const name = String(input.name || `${source.name} copy`).trim();
  const id = channelIdFor(input.id || name, project.channels.map((channel) => channel.id));
  const channel = {
    ...source,
    id,
    graphId: project.id === "default" ? id : `${project.id}--${id}`,
    name,
    objective: String(input.objective ?? source.objective ?? "").trim(),
    kind: String(input.kind ?? source.kind ?? "custom").trim() || "custom",
    createdAt: now(),
  };
  saveFlow(cloneChannelGraph(sourceFlow.graph, channel), options);
  const saved = saveProject({ ...project, channels: [...project.channels, channel] }, options);
  return { project: saved, channel };
}

export function updateChannel(channelId, patch, options = {}) {
  const project = loadProject(options);
  const current = getChannel(project, channelId);
  const allowed = new Set(["name", "objective", "kind", "enabled"]);
  const unknown = Object.keys(patch ?? {}).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(`Unsupported channel fields: ${unknown.join(", ")}`);
  const channel = { ...current, ...structuredClone(patch ?? {}) };
  if (!String(channel.name || "").trim()) throw new Error("Channel name is required.");
  const channels = project.channels.map((item) => item.id === current.id ? channel : item);
  const flow = loadFlow(current.graphId, null, options);
  if (flow.graph) saveFlow({
    ...flow.graph,
    name: channel.name,
    objective: channel.objective,
    kind: channel.kind,
  }, options);
  const nextActive = channel.enabled === false && project.activeChannelId === channel.id
    ? channels.find((item) => item.enabled !== false && item.id !== channel.id)?.id ?? null
    : project.activeChannelId;
  const saved = saveProject({ ...project, channels, activeChannelId: nextActive }, options);
  return { project: saved, channel };
}

export function updateSharedContext(patch, options = {}) {
  const project = loadProject(options);
  const current = project.sharedContext ?? emptySharedContext();
  const allowed = new Set([
    "repository", "product", "positioning", "icp", "founderTaste",
    "contacts", "outcomes", "experiments", "artifacts", "productFeedback",
  ]);
  const unknown = Object.keys(patch ?? {}).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(`Unsupported shared-context fields: ${unknown.join(", ")}`);
  const sharedContext = { ...current, updatedAt: now(), version: (current.version ?? 0) + 1 };
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (Array.isArray(value)) sharedContext[key] = structuredClone(value);
    else if (value && typeof value === "object") sharedContext[key] = { ...current[key], ...structuredClone(value) };
    else sharedContext[key] = value;
  }
  return saveProject({ ...project, sharedContext }, options);
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
  const channels = project.channels.map((channel) => {
    const flow = loadFlow(channel.graphId, null, options);
    const runs = flow.runs ?? [];
    const lastRun = runs.at(-1) ?? null;
    return {
      ...channel,
      status: deriveChannelStatus(runs),
      lastRunAt: lastRun?.createdAt ?? null,
      lastRunOk: lastRun ? lastRun.ok === true : null,
      pendingGates: lastRun?.pendingGates?.length ?? 0,
      nodeCount: flow.graph?.nodes?.length ?? 0,
      runCount: runs.length,
      graphRevision: flow.graph?.revision ?? 0,
    };
  });
  return {
    id: project.id,
    name: project.name,
    activeChannelId: project.activeChannelId,
    sharedContext: project.sharedContext,
    channels,
  };
}
