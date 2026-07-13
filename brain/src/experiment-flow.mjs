// Canonical proposal → flow → run seam.
//
// Greenlight is a founder decision to begin an experiment's internal work. It materializes one ordinary
// flow and records one ordinary flow-run receipt. No GTM path, compiled-run store, semantic object graph,
// model call, or outward-release capability participates. The flow stages locally; any later outward act
// still belongs to the unchanged founder wall on the pipeline that performs it.

import { loadFlow, recordFlowRun, saveFlow } from "./flow-store.mjs";
import { runGraph } from "./graph.mjs";
import { loadProject } from "./project-store.mjs";
import { buildRunGrounding, reportForProject } from "./run-grounding.mjs";
import { getWorkArtifact, reviseWorkArtifact } from "./work-artifact-store.mjs";
import { assertGateWall } from "./workflow-composer.mjs";
import { validateGraph } from "./graph-operations.mjs";

function slug(value) {
  return String(value ?? "experiment").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 56) || "experiment";
}

function now(options = {}) {
  if (typeof options.now === "function") return String(options.now());
  if (options.now) return String(options.now);
  return new Date().toISOString();
}

function proposalIntent(artifact) {
  const content = artifact?.content && typeof artifact.content === "object" && !Array.isArray(artifact.content)
    ? artifact.content
    : {};
  return String(content.intent ?? content.hypothesis ?? artifact?.title ?? artifact?.summary ?? "").trim();
}

export function graphForExperimentProposal(projectId, artifact) {
  const intent = proposalIntent(artifact);
  if (!intent) throw new Error("Give this experiment a clear intent before greenlighting it.");
  const flowId = `${slug(projectId)}--experiment-${slug(artifact.artifactId)}`;
  const actionId = `experiment:${artifact.artifactId}:${artifact.revision}`;
  const artifactRef = `work-artifact:${artifact.artifactId}`;
  const graph = {
    id: flowId,
    projectId,
    name: artifact.title ?? intent.slice(0, 72),
    objective: intent,
    kind: "experiment",
    version: "1.0.0",
    revision: 1,
    contextRefs: [{ type: "work-artifact", id: artifact.artifactId }],
    nodes: [
      {
        id: "proposal",
        category: "source",
        connector: "manual",
        label: "Experiment intent",
        position: { x: 0, y: 0 },
        config: { items: [{ id: actionId, gtmActionId: actionId, kind: "experiment", summary: intent, plan: intent, protects: "stage_locally", artifactRef }] },
      },
      { id: "greenlight", category: "gate", connector: "default", label: "Greenlight", position: { x: 260, y: 0 }, config: {} },
      { id: "work", category: "execute", connector: "local", label: "Begin internal work", position: { x: 520, y: 0 }, config: {} },
      { id: "outcome", category: "measure", connector: "default", label: "Read the result", position: { x: 780, y: 0 }, config: {} },
    ],
    edges: [
      { id: "proposal-greenlight", source: "proposal", target: "greenlight", edgeType: "data" },
      { id: "greenlight-work", source: "greenlight", target: "work", edgeType: "data" },
      { id: "work-outcome", source: "work", target: "outcome", edgeType: "data" },
    ],
    store: { path: `.gtm/flows/${flowId}.json`, runs: 0 },
  };
  assertGateWall(graph.nodes, graph.edges);
  const validation = validateGraph(graph);
  if (!validation.ok) throw new Error(`Experiment flow is invalid: ${validation.errors.join(" ")}`);
  return graph;
}

function runReceipt(flow, runId) {
  return flow.runs.find((run) => run.id === runId) ?? null;
}

export async function greenlightExperimentArtifact({
  projectId = "default",
  artifactId,
  expectedArtifactRevision,
} = {}, options = {}) {
  if (!artifactId) throw new Error("artifactId is required.");
  const scoped = { ...options, projectId };
  let artifact = getWorkArtifact(projectId, artifactId, { ...scoped, includeRetired: false });
  if (artifact.kind !== "experiment-proposal") throw new Error(`Work artifact ${artifactId} is not an experiment proposal.`);

  const lifecycle = artifact.content?.lifecycle;
  if (artifact.status === "greenlit" && lifecycle?.flowId && lifecycle?.runId) {
    const stored = loadFlow(lifecycle.flowId, null, scoped);
    const receipt = runReceipt(stored, lifecycle.runId);
    if (!stored.graph || !receipt) throw new Error("The greenlit experiment is missing its flow-run receipt.");
    return { artifact, flow: stored.graph, run: receipt, result: receipt.result, created: false };
  }
  if (artifact.status !== "proposed") throw new Error(`Experiment proposal ${artifactId} is not pending.`);
  if (!Number.isInteger(expectedArtifactRevision) || artifact.revision !== expectedArtifactRevision) {
    throw new Error(`Stale experiment proposal revision: expected ${expectedArtifactRevision}, current ${artifact.revision}.`);
  }

  const graph = graphForExperimentProposal(projectId, artifact);
  let stored = loadFlow(graph.id, null, scoped);
  let receipt = stored.runs.at(-1) ?? null;
  let result = receipt?.result ?? null;
  if (!receipt) {
    saveFlow(graph, scoped);
    const project = loadProject(scoped);
    result = await runGraph(graph, {
      approvals: { greenlight: true },
      grounding: buildRunGrounding(project, reportForProject(project, scoped), scoped),
      projectId,
      credentialOptions: scoped,
      founderPresent: true,
      // Deliberately no outwardRelease, sendRunners, or deployRunners: greenlight cannot leave the repo.
    });
    stored = recordFlowRun(graph, result, scoped);
    receipt = stored.runs.at(-1);
  }

  const nextLifecycle = {
    decision: "greenlit",
    greenlitAt: now(options),
    flowId: stored.graph.id,
    runId: receipt.id,
  };
  const content = artifact.content && typeof artifact.content === "object" && !Array.isArray(artifact.content) ? artifact.content : {};
  artifact = reviseWorkArtifact(projectId, artifactId, {
    status: "greenlit",
    content: { ...content, lifecycle: nextLifecycle },
    refs: [
      ...(artifact.refs ?? []),
      { type: "graph", id: stored.graph.id },
      { type: "run", id: receipt.id },
    ],
    expectedArtifactRevision: artifact.revision,
    revisionAuthor: { type: "founder", id: "founder" },
    idempotencyKey: `greenlight-experiment:${projectId}:${artifactId}:${artifact.revision}`,
  }, scoped);
  return { artifact, flow: stored.graph, run: receipt, result, created: true };
}
