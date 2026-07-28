import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createBet } from "./bet.mjs";
import {
  CANVAS_FLOW_OUTPUT_SCHEMA,
  CANVAS_MODEL_VIEW_OUTPUT_SCHEMA,
  isSupportedStagedArtifactContent,
} from "./staged-artifact-content.mjs";
import { projectModelBranch } from "./model-branches.mjs";
import { getVentureDoc, listVentureDocs, now, setVentureDoc } from "./venture-store.mjs";
import { readWorkspaceRepositoryFile } from "./repository-files.mjs";
import { isRepositoryRef } from "./repository-ref.mjs";
import { createWorkJournal } from "./work-journal.mjs";

const MAX_CAPTURE_LINES = 1_000;
const MAX_RETAINED_REFS = 12;

function workspaceRelative(cwd, requestedPath) {
  const value = String(requestedPath ?? "").trim();
  if (!value) return null;
  const root = path.resolve(String(cwd ?? ""));
  if (!fs.existsSync(root)) return null;
  const absolute = path.resolve(root, value);
  const relative = path.relative(root, absolute);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;
  return relative.split(path.sep).join("/");
}

function boundedRange(source = {}) {
  const requestedStart = Number(source.startLine ?? 1);
  if (!Number.isSafeInteger(requestedStart) || requestedStart < 1) return null;
  const requestedEnd = source.endLine == null
    ? requestedStart + MAX_CAPTURE_LINES - 1
    : Number(source.endLine);
  if (!Number.isSafeInteger(requestedEnd) || requestedEnd < requestedStart) return null;
  return {
    startLine: requestedStart,
    endLine: Math.min(requestedEnd, requestedStart + MAX_CAPTURE_LINES - 1),
  };
}

export function captureNativeSourceRefs({ cwd, result } = {}) {
  if (result?.status !== "passed" || !result?.source?.path) return [];
  const file = workspaceRelative(cwd, result.source.path);
  const range = boundedRange(result.source);
  if (!file || !range) return [];
  try {
    const source = readWorkspaceRepositoryFile(cwd, { file, ...range });
    return source?.state === "ready" && isRepositoryRef(source.ref) ? [source.ref] : [];
  } catch {
    // Source capture is evidence enrichment, never a reason to fail an otherwise valid provider turn.
    return [];
  }
}

export function retainedThreadSourceRefs({
  ventureId,
  threadRef,
  options = {},
  limit = MAX_RETAINED_REFS,
} = {}) {
  const threadId = String(threadRef ?? "").replace(/^thread:/, "").trim();
  if (!ventureId || !threadId) return [];
  try {
    const projection = createWorkJournal(options).readProjections(ventureId);
    const observed = (projection.runs ?? [])
      .filter((run) => run.threadId === threadId)
      .flatMap((run) => run.activity ?? [])
      .flatMap((activity) => activity.sourceRefs ?? [])
      .filter(isRepositoryRef);
    const uniqueNewestFirst = [];
    const seen = new Set();
    for (let index = observed.length - 1; index >= 0; index -= 1) {
      const ref = observed[index];
      if (seen.has(ref)) continue;
      seen.add(ref);
      uniqueNewestFirst.push(ref);
      if (uniqueNewestFirst.length >= Math.max(1, Number(limit) || MAX_RETAINED_REFS)) break;
    }
    return uniqueNewestFirst.reverse();
  } catch {
    return [];
  }
}

export function directSdkConfiguration(persisted, teammateRef, runtime, model) {
  const name = runtime === "codex" ? "Codex" : runtime === "claude-code" ? "Claude Code" : teammateRef;
  const agent = {
    ref: teammateRef,
    name,
    label: "SDK model",
    perspective: null,
    temperament: [],
    contributes: [],
    boundaries: [],
    activation: "direct",
    capabilities: { firmTools: true, additional: [] },
    context: { scope: "venture", instructions: null },
    memory: { scope: "none", instructions: null },
    runtime: { provider: runtime, model },
    budget: { maxSteps: null, dailySpendUsd: null },
    authority: { outwardEffects: "blocked" },
    evaluation: { signals: [], instructions: null },
  };
  return {
    ...persisted,
    presentation: { ...persisted.presentation, participant: "named", participantLabel: "SDK model", collectiveLabel: "Work" },
    organization: { ...persisted.organization, instructions: null, relationships: [] },
    coordination: { ...persisted.coordination, mode: "direct", coordinatorRef: null, maxPasses: 1, protocols: [], stopWhen: [] },
    agents: [agent],
  };
}

function explicitTargetTools(target = null) {
  const names = new Set();
  if (!target) return names;

  if (target.modelBranchRef && !target.productGtmView) {
    names.add("read_current_model");
    names.add("create_model_branch");
    names.add("read_model_branch");
    names.add("propose_model_change");
  }
  if (!target.workflowSketch && (target.workflowStep || target.artifactSection)) {
    names.add("get_taste");
    names.add("stage_artifact");
  }
  if (target.journeyImportRef || target.journeyImportProfile) {
    names.add("read_current_model");
    names.add("propose_journey_mapping");
  }
  if (target.architectureId) {
    names.add("read_venture_architecture");
    names.add("propose_architecture_change");
  }
  if (target.theorySubjectId || target.theoryRelationshipId) {
    names.add("record_working_theory");
  }
  return names;
}

// Direct SDK Work keeps the provider's native coding harness. An ordinary coding turn gets no
// Croki MCP bridge. Preview attaches only to exact preview-bearing direction, while legacy selected
// material keeps its explicitly targeted compatibility tools until it moves to native settlement.
export function directSdkTools(tools, target = null) {
  if (nativeCanvasTarget(target)) return [];
  const allowed = explicitTargetTools(target);
  return tools.filter((tool) => (
    (target?.previewRequested && tool.name.startsWith("preview_"))
    || allowed.has(tool.name)
  ));
}

export function nativeCanvasTarget(target = null) {
  return Boolean(target?.productGtmView || target?.workflowSketch);
}

export function nativeCanvasOutputSchema(target = null) {
  if (!nativeCanvasTarget(target)) return null;
  return target?.workflowSketch
    ? CANVAS_FLOW_OUTPUT_SCHEMA
    : CANVAS_MODEL_VIEW_OUTPUT_SCHEMA;
}

export function nativeCanvasContext({ ventureId, betId = null, target = null, options = {} } = {}) {
  if (!nativeCanvasTarget(target)) return null;
  const bet = findCanvasBet(ventureId, target, betId, options);
  const selectedWork = target?.workRef
    ? bet?.staged?.find((artifact) => artifact?.id === target.workRef) ?? null
    : null;
  let modelBranch = null;
  if (target?.modelBranchRef) {
    try {
      modelBranch = projectModelBranch(ventureId, target.modelBranchRef, options);
    } catch {
      modelBranch = null;
    }
  }
  if (!selectedWork && !modelBranch) return null;
  return {
    ...(selectedWork ? { selectedWork } : {}),
    ...(modelBranch ? { modelBranch } : {}),
  };
}

function nonempty(value) {
  return typeof value === "string" && Boolean(value.trim());
}

const CANVAS_NODE_KINDS = new Set(["question", "truth", "proposal", "alternative", "unknown", "evidence", "action", "gate", "outcome"]);
const CANVAS_NODE_STATES = new Set(["current", "provisional", "unresolved"]);
const CANVAS_EDGE_KINDS = new Set(["relationship", "dependency", "alternative", "return"]);
const CANVAS_STEP_TYPES = new Set(["trigger", "source", "agent-work", "tool", "condition", "wait", "founder-decision", "founder-gate", "external-action", "observation", "outcome"]);

function validEdge(edge, ids) {
  return nonempty(edge?.from)
    && nonempty(edge?.to)
    && typeof edge?.label === "string"
    && CANVAS_EDGE_KINDS.has(edge?.kind)
    && ids.has(edge.from)
    && ids.has(edge.to);
}

function normalizedModelView(output) {
  if (!output || !nonempty(output.title) || !nonempty(output.summary) || !nonempty(output.question)) return null;
  const nodes = Array.isArray(output.nodes) ? output.nodes.slice(0, 100) : [];
  const edges = Array.isArray(output.edges) ? output.edges.slice(0, 160) : [];
  const nodeIds = new Set();
  for (const node of nodes) {
    if (
      !nonempty(node?.id)
      || nodeIds.has(node.id)
      || !nonempty(node?.label)
      || typeof node?.detail !== "string"
      || typeof node?.sourceRef !== "string"
      || !CANVAS_NODE_KINDS.has(node?.kind)
      || !CANVAS_NODE_STATES.has(node?.state)
    ) return null;
    nodeIds.add(node.id);
  }
  if (edges.some((edge) => !validEdge(edge, nodeIds))) return null;
  const content = {
    kind: "model-view",
    purpose: "product-gtm-local-model",
    question: output.question.trim(),
    branchRef: "",
    nodes,
    edges,
  };
  return isSupportedStagedArtifactContent(content)
    ? { title: output.title.trim(), summary: output.summary.trim(), content }
    : null;
}

function normalizedFlow(output) {
  if (!output || !nonempty(output.title) || !nonempty(output.summary) || !nonempty(output.objective)) return null;
  const steps = Array.isArray(output.steps) ? output.steps.slice(0, 100) : [];
  const edges = Array.isArray(output.edges) ? output.edges.slice(0, 160) : [];
  const stepIds = new Set();
  for (const step of steps) {
    if (
      !nonempty(step?.id)
      || stepIds.has(step.id)
      || !nonempty(step?.label)
      || typeof step?.detail !== "string"
      || !CANVAS_STEP_TYPES.has(step?.type)
    ) return null;
    stepIds.add(step.id);
  }
  if (edges.some((edge) => !validEdge(edge, stepIds))) return null;
  const content = {
    kind: "flow",
    purpose: "product-gtm-workflow",
    objective: output.objective.trim(),
    steps,
    edges,
  };
  return isSupportedStagedArtifactContent(content)
    ? { title: output.title.trim(), summary: output.summary.trim(), content }
    : null;
}

function findCanvasBet(ventureId, target, betId, options) {
  const bets = listVentureDocs(ventureId, "bets", options);
  const exactBetId = target?.betId ?? betId;
  if (exactBetId) return getVentureDoc(ventureId, "bets", exactBetId, options);
  if (target?.workRef) {
    return bets.find((bet) => bet.staged?.some((artifact) => artifact?.id === target.workRef)) ?? null;
  }
  return null;
}

export function persistNativeCanvasOutput({
  ventureId,
  teammateRef,
  goal,
  betId = null,
  target,
  output,
  configurationRevision = null,
  options = {},
} = {}) {
  const normalized = target?.workflowSketch ? normalizedFlow(output) : normalizedModelView(output);
  if (!normalized) {
    throw Object.assign(new Error("The model returned an invalid Canvas projection."), {
      code: "invalid_canvas_output",
    });
  }

  let bet = findCanvasBet(ventureId, target, betId, options);
  if ((target?.betId || betId || target?.workRef) && !bet) {
    throw Object.assign(new Error("The selected Canvas work no longer exists."), {
      code: "canvas_target_missing",
    });
  }
  if (!bet) {
    bet = createBet({ ventureId, intent: goal, teammateRef, configurationRevision });
  }

  const staged = [...(bet.staged ?? [])];
  const existingIndex = target?.workRef
    ? staged.findIndex((artifact) => artifact?.id === target.workRef)
    : -1;
  const previous = existingIndex >= 0 ? staged[existingIndex] : null;
  const timestamp = now();
  const artifact = {
    ...(previous ?? {}),
    id: previous?.id ?? `staged-${crypto.randomUUID()}`,
    title: normalized.title,
    content: normalized.content,
    ownerRefs: previous?.ownerRefs?.length ? previous.ownerRefs : [teammateRef],
    contributorRefs: previous?.contributorRefs ?? [],
    configurationRevision: configurationRevision ?? previous?.configurationRevision ?? null,
    stagedAt: previous?.stagedAt ?? timestamp,
    updatedAt: timestamp,
  };
  if (existingIndex >= 0) staged[existingIndex] = artifact;
  else staged.push(artifact);
  const updatedBet = { ...bet, staged, updatedAt: timestamp };
  setVentureDoc(ventureId, "bets", bet.id, updatedBet, options);
  return { artifact, bet: updatedBet, summary: normalized.summary };
}

// Direct SDK context is one feature-local unit: native tools, output contract, selected Canvas
// material, and retained source receipts must describe the same turn.
export function prepareDirectSdkTurn({
  directSdk,
  configuredTools,
  target,
  ventureId,
  betId,
  threadRef,
  options,
} = {}) {
  if (!directSdk) {
    return { tools: configuredTools, outputSchema: null, canvasContext: null, retainedSourceRefs: [] };
  }
  return {
    tools: directSdkTools(configuredTools, target),
    outputSchema: nativeCanvasOutputSchema(target),
    canvasContext: nativeCanvasContext({ ventureId, betId, target, options }),
    retainedSourceRefs: retainedThreadSourceRefs({ ventureId, threadRef, options }),
  };
}

// A native Canvas result either persists as one exact staged projection or returns the same bounded,
// founder-readable failure the Work loop has always exposed. Provider execution itself is untouched.
export function settleNativeCanvasOutcome({
  directSdk,
  outcome,
  ventureId,
  teammateRef,
  goal,
  betId,
  target,
  configurationRevision,
  options,
} = {}) {
  if (!directSdk || !nativeCanvasTarget(target) || outcome?.kind !== "completed") return outcome;
  try {
    const persisted = persistNativeCanvasOutput({
      ventureId,
      teammateRef,
      goal,
      betId,
      target,
      output: outcome.structuredOutput,
      configurationRevision,
      options,
    });
    return { ...outcome, summary: persisted.summary };
  } catch (error) {
    return {
      kind: "failed",
      summary: error?.code === "canvas_target_missing"
        ? "That Canvas work changed or moved before this result returned. Nothing was added."
        : "Canvas could not render this result. Nothing was added.",
    };
  }
}
