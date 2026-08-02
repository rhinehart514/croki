import type {
  CrokiContext,
  CrokiContextReference,
  CrokiContextNode,
} from "@croki/shared/crokiContext";
import type { CrokiReleaseItem } from "@croki/shared/crokiReleaseCandidate";

import type { ActivePlanState } from "~/session-logic";

import type { CrokiCanvasArtifactLike } from "./crokiCanvasArtifactTypes";
import type { CrokiPerceptionFrame, CrokiPerceptionObject } from "@croki/shared/crokiPerception";

import { projectCrokiPerceptionFrame } from "./crokiCanvasPerceptionProjection";

export type CrokiCanvasLiveSource =
  | "attention"
  | "context"
  | "release"
  | "visual"
  | "agent"
  | "reference"
  | "outcome";

export interface CrokiCanvasLiveAffordance {
  readonly id: "source" | "thread" | "focus" | "branch" | "approve" | "use";
  readonly label: string;
}

export interface CrokiCanvasLiveObject {
  readonly id: string;
  readonly source: CrokiCanvasLiveSource;
  readonly title: string;
  readonly body: string;
  readonly kind: string;
  readonly status?: string;
  readonly authority?: string;
  readonly updatedAt?: string;
  readonly revision?: number;
  readonly selectionId?: string;
  readonly reference?: CrokiContextReference;
  readonly sourceThreadId?: string;
  readonly artifact?: CrokiCanvasArtifactLike;
  readonly perceptionObject?: CrokiPerceptionObject;
  readonly perceptionSourceUri?: string;
  readonly node?: CrokiContextNode;
  readonly releaseItem?: CrokiReleaseItem;
  readonly affordances: readonly CrokiCanvasLiveAffordance[];
}

export interface CrokiCanvasLiveEdge {
  readonly from: string;
  readonly to: string;
  readonly relation: string;
  readonly kind: "causal" | "epistemic" | "source" | "temporal" | "agent";
}

export interface CrokiCanvasLiveScene {
  readonly objects: readonly CrokiCanvasLiveObject[];
  readonly edges: readonly CrokiCanvasLiveEdge[];
  readonly attentionIds: readonly string[];
  readonly revisionObjects: readonly CrokiCanvasLiveObject[];
  readonly updatedAt: string;
  readonly perceptionRevision?: number;
}

interface LiveSceneInput {
  readonly context: CrokiContext;
  readonly perceptionFrame?: CrokiPerceptionFrame | null;
  readonly artifact?: CrokiCanvasArtifactLike | null;
  readonly latestArtifact?: CrokiCanvasArtifactLike | null;
  readonly artifacts?: readonly CrokiCanvasArtifactLike[];
  readonly activePlan: ActivePlanState | null;
  readonly activeThread?: { readonly id: string; readonly title: string } | null;
  readonly externalQuestion?: string | null;
}

/**
 * Projects legacy context, release, Thread, and harness artifacts into one
 * ephemeral perceptual scene. Nothing in this scene is persisted or edited.
 */
export function projectCrokiCanvasLiveScene(input: LiveSceneInput): CrokiCanvasLiveScene {
  if (input.perceptionFrame !== undefined && input.perceptionFrame !== null) {
    return projectCrokiPerceptionFrame(input.perceptionFrame);
  }
  const objects: CrokiCanvasLiveObject[] = [];
  const edges: CrokiCanvasLiveEdge[] = [];
  const attentionIds: string[] = [];
  const push = (object: CrokiCanvasLiveObject) => objects.push(object);
  const link = (from: string, to: string, relation: string, kind: CrokiCanvasLiveEdge["kind"]) => {
    if (from !== to) edges.push({ from, to, relation, kind });
  };

  const viewedArtifact = resolveArtifact(input);
  const latestArtifact = resolveLatestArtifact(input, viewedArtifact);
  const updatedAt = latestTimestamp([
    input.context.updatedAt,
    ...input.context.nodes.map((node) => node.updatedAt),
    ...(viewedArtifact ? [viewedArtifact.createdAt] : []),
  ]);
  const attentionBody = input.externalQuestion?.trim()
    ? input.externalQuestion.trim()
    : `${input.context.nodes.length} signals · ${input.context.edges.length} relationships`;
  push({
    id: "attention:stream",
    source: "attention",
    title: "Live perception",
    body: attentionBody,
    kind: "attention",
    authority: "Observed now",
    updatedAt,
    affordances: [{ id: "focus", label: "Focus" }],
  });

  if (input.activeThread) {
    const id = `agent:thread:${input.activeThread.id}`;
    push({
      id,
      source: "agent",
      title: input.activeThread.title || "Active Thread",
      body: "Current reasoning stream",
      kind: "agent",
      authority: "In progress",
      sourceThreadId: input.activeThread.id,
      affordances: [
        { id: "thread", label: "Open Thread" },
        { id: "focus", label: "Focus" },
      ],
    });
    link("attention:stream", id, "attending", "agent");
    attentionIds.push(id);
  }

  const nodeIds = new Set(input.context.nodes.map((node) => node.id));
  for (const node of input.context.nodes) {
    const id = `context:${node.id}`;
    const authority = authorityForNode(node);
    push({
      id,
      source: "context",
      title: node.title,
      body: node.body,
      kind: node.kind,
      status: node.status,
      authority,
      updatedAt: node.updatedAt,
      selectionId: node.id,
      node,
      affordances: [
        { id: "focus", label: "Focus" },
        ...(node.references?.length ? [{ id: "source" as const, label: "Sources" }] : []),
        ...(node.status === "provisional" ? [{ id: "approve" as const, label: "Approve" }] : []),
      ],
    });
    if (node.status === "provisional" || node.kind === "decision") attentionIds.push(id);
    if (node.status === "provisional") link("attention:stream", id, "needs judgment", "epistemic");
    if (node.kind === "decision") link("attention:stream", id, "decision under view", "causal");
    for (const [index, reference] of (node.references ?? []).entries()) {
      const referenceId = `reference:${node.id}:${index}`;
      push({
        id: referenceId,
        source: "reference",
        title: reference.kind === "file" ? reference.path : reference.url,
        body:
          reference.kind === "file" && reference.line
            ? `Line ${reference.line}`
            : "External source",
        kind: "source",
        authority: "Observed evidence",
        reference,
        affordances: [{ id: "source", label: "Open source" }],
      });
      link(id, referenceId, "source", "source");
    }
  }
  for (const edge of input.context.edges) {
    if (nodeIds.has(edge.from) && nodeIds.has(edge.to)) {
      link(
        `context:${edge.from}`,
        `context:${edge.to}`,
        edge.relation,
        relationKind(edge.relation),
      );
    }
  }

  const release = input.context.release;
  if (release) {
    const releaseId = `release:${release.version}`;
    push({
      id: releaseId,
      source: "release",
      title: `Release ${release.version}`,
      body: release.goal,
      kind: "release",
      status: release.status,
      authority: release.status === "released" ? "Verified outcome" : "Target state",
      affordances: [{ id: "focus", label: "Focus" }],
    });
    link("attention:stream", releaseId, "targeting", "causal");
    for (const item of release.items) {
      const itemId = `release-item:${item.id}`;
      push({
        id: itemId,
        source: item.status === "verified" ? "outcome" : "release",
        title: item.title,
        body: item.outcome || `${item.acceptanceCriteria.length} acceptance signals`,
        kind: item.kind,
        status: item.status,
        authority: item.status === "verified" ? "Verified outcome" : "Release evidence",
        releaseItem: item,
        affordances: [
          { id: "focus", label: "Focus" },
          ...(item.sourceThreads.length ? [{ id: "thread" as const, label: "Source Thread" }] : []),
          ...(item.status === "proposed"
            ? [{ id: "branch" as const, label: "Choose branch" }]
            : []),
        ],
      });
      link(releaseId, itemId, item.status === "verified" ? "verified as" : "contains", "causal");
      if (item.status === "working" || item.status === "blocked" || item.status === "proposed") {
        attentionIds.push(itemId);
      }
      for (const sourceThread of item.sourceThreads) {
        const agentId = `agent:thread:${sourceThread.id}`;
        if (!objects.some((object) => object.id === agentId)) {
          push({
            id: agentId,
            source: "agent",
            title: sourceThread.title,
            body: "Source Thread",
            kind: "agent",
            sourceThreadId: sourceThread.id,
            affordances: [{ id: "thread", label: "Open Thread" }],
          });
        }
        link(itemId, agentId, "worked in", "agent");
      }
    }
  }

  if (input.activePlan) {
    let previous: string | null = null;
    for (const [index, step] of input.activePlan.steps.entries()) {
      const id = `plan:${index}:${step.step}`;
      push({
        id,
        source: "agent",
        title: step.step,
        body: step.status === "completed" ? "Verified by the active Thread" : "Agent plan",
        kind: "plan",
        status: step.status,
        authority: step.status === "completed" ? "Verified" : "In progress",
        affordances: [{ id: "focus", label: "Focus" }],
      });
      if (previous) link(previous, id, "then", "temporal");
      previous = id;
    }
  }

  const revisionObjects: CrokiCanvasLiveObject[] = [];
  for (const artifact of uniqueArtifacts(input.artifacts, input.artifact, input.latestArtifact)) {
    const id = `visual:revision:${artifact.id}`;
    const object: CrokiCanvasLiveObject = {
      id,
      source: "visual",
      title: `Visual revision ${artifact.revision}`,
      body: artifact.question,
      kind: artifact.presentation,
      status: artifact.revision === latestArtifact?.revision ? "current" : "prior",
      authority:
        artifact.revision === latestArtifact?.revision ? "Observed now" : "Prior observation",
      revision: artifact.revision,
      artifact,
      affordances: [{ id: "branch", label: "Inspect revision" }],
    };
    revisionObjects.push(object);
    if (artifact === viewedArtifact || artifact.revision === viewedArtifact?.revision) push(object);
  }
  if (viewedArtifact) {
    const visualId = `visual:${viewedArtifact.id}`;
    const visualObject = objects.find((object) => object.id === visualId);
    if (!visualObject) {
      push({
        id: visualId,
        source: "visual",
        title: viewedArtifact.question,
        body: `${viewedArtifact.nodes.length} observations · revision ${viewedArtifact.revision}`,
        kind: viewedArtifact.presentation,
        status: "current",
        authority: "Observed now",
        revision: viewedArtifact.revision,
        artifact: viewedArtifact,
        affordances: [
          { id: "focus", label: "Focus" },
          { id: "branch", label: "Inspect" },
        ],
      });
    }
    link("attention:stream", visualId, "observes", "causal");
    for (const artifactNode of viewedArtifact.nodes) {
      const artifactNodeId = `${visualId}:${artifactNode.id}`;
      push({
        id: artifactNodeId,
        source: artifactNode.role === "evidence" ? "reference" : "visual",
        title: artifactNode.title,
        body: artifactNode.body ?? artifactNode.whyItMatters ?? "",
        kind: artifactNode.role,
        authority: artifactNode.role === "evidence" ? "Observed evidence" : "Model projection",
        selectionId: artifactNode.id,
        artifact: viewedArtifact,
        affordances: [
          { id: "focus", label: "Focus" },
          ...(artifactNode.references?.length ? [{ id: "source" as const, label: "Sources" }] : []),
        ],
      });
      link(visualId, artifactNodeId, "contains", "causal");
      for (const edge of viewedArtifact.edges.filter(
        (candidate) => candidate.from === artifactNode.id,
      )) {
        link(`${visualId}:${edge.from}`, `${visualId}:${edge.to}`, edge.relation, "causal");
      }
    }
  }

  const objectIds = new Set(objects.map((object) => object.id));
  return {
    objects,
    edges: edges.filter((edge) => objectIds.has(edge.from) && objectIds.has(edge.to)),
    attentionIds: [...new Set(attentionIds)].filter((id) => objectIds.has(id)),
    revisionObjects,
    updatedAt,
  };
}

function resolveArtifact(input: LiveSceneInput): CrokiCanvasArtifactLike | null {
  if (isRenderableArtifact(input.artifact)) return input.artifact;
  if (isRenderableArtifact(input.latestArtifact)) return input.latestArtifact;
  return (
    input.artifacts
      ?.filter(isRenderableArtifact)
      .slice()
      .sort((left, right) => right.revision - left.revision)[0] ?? null
  );
}

function resolveLatestArtifact(
  input: LiveSceneInput,
  viewedArtifact: CrokiCanvasArtifactLike | null,
): CrokiCanvasArtifactLike | null {
  if (isRenderableArtifact(input.latestArtifact)) return input.latestArtifact;
  const latest = input.artifacts
    ?.filter(isRenderableArtifact)
    .slice()
    .sort((left, right) => right.revision - left.revision)[0];
  return latest ?? viewedArtifact;
}

function uniqueArtifacts(
  artifacts: readonly CrokiCanvasArtifactLike[] | undefined,
  current: CrokiCanvasArtifactLike | null | undefined,
  latest: CrokiCanvasArtifactLike | null | undefined,
): CrokiCanvasArtifactLike[] {
  const byId = new Map<string, CrokiCanvasArtifactLike>();
  for (const artifact of [
    ...(artifacts ?? []),
    ...(current ? [current] : []),
    ...(latest ? [latest] : []),
  ]) {
    if (!isRenderableArtifact(artifact)) continue;
    byId.set(`${artifact.id}:${artifact.revision}`, artifact);
  }
  return [...byId.values()].sort((left, right) => right.revision - left.revision);
}

function isRenderableArtifact(
  artifact: CrokiCanvasArtifactLike | null | undefined,
): artifact is CrokiCanvasArtifactLike {
  return Boolean(
    artifact &&
    typeof artifact === "object" &&
    typeof artifact.id === "string" &&
    typeof artifact.revision === "number" &&
    typeof artifact.question === "string" &&
    Array.isArray(artifact.nodes) &&
    Array.isArray(artifact.edges),
  );
}

function relationKind(relation: string): CrokiCanvasLiveEdge["kind"] {
  const normalized = relation.toLowerCase();
  if (
    normalized.includes("support") ||
    normalized.includes("evidence") ||
    normalized.includes("source")
  )
    return "epistemic";
  if (normalized.includes("before") || normalized.includes("then") || normalized.includes("preced"))
    return "temporal";
  return "causal";
}

function authorityForNode(node: CrokiContextNode): string {
  if (node.status === "retired") return "Prior understanding";
  if (node.status === "provisional") return "Needs founder judgment";
  if (node.kind === "evidence")
    return node.references?.length ? "Source-backed" : "Observed evidence";
  return node.origin === "agent" ? "Agent proposition" : "Founder-approved";
}

function latestTimestamp(values: readonly string[]): string {
  return (
    values.slice().sort((left, right) => right.localeCompare(left))[0] ?? new Date(0).toISOString()
  );
}
