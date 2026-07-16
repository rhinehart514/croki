import type { WallQueueItemView } from "@/api";
import { reviewContent, type ReviewContent } from "@/components/lens/wallReviewContent";
import type { FirmBet, FirmConfiguration, FirmOutcome, FirmStagedArtifact, FirmWorkflowStage } from "@/types";

export type DiveNodeKind = "bet" | "event" | "work" | "gate" | "outcome";
export type DiveNodeState = "opened" | FirmWorkflowStage["state"];

export type DiveNode = {
  id: string;
  kind: DiveNodeKind;
  state: DiveNodeState;
  title: string;
  body: string | null;
  at: string | null;
  eyebrow: string;
  teammateNames: string[];
  runningTeammateNames: string[];
  runningSince: string | null;
  receipts: Array<{ label: string; value: string }>;
  x: number;
  y: number;
  wallItem?: WallQueueItemView;
  review?: ReviewContent;
};

export type DiveEdge = {
  id: string;
  source: string;
  target: string;
  label: string;
  tone: "neutral" | "gate" | "outcome";
};

export type DiveProjection = {
  nodes: DiveNode[];
  edges: DiveEdge[];
  width: number;
  height: number;
  gaps: string[];
};

type DiveInput = {
  bet: FirmBet;
  wallItems: WallQueueItemView[];
  outcomes: FirmOutcome[];
  configuration?: FirmConfiguration | null;
};

const LANE_X: Record<DiveNodeKind, number> = {
  bet: 112,
  event: 340,
  work: 574,
  gate: 816,
  outcome: 1058,
};

function text(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readableValue(value: unknown): string | null {
  const direct = text(value);
  if (direct) return direct;
  const source = record(value);
  if (!source) return null;
  for (const key of ["body", "message", "draft", "content", "summary", "detail", "description", "path"]) {
    const nested = text(source[key]);
    if (nested) return nested;
  }
  if (source.content !== undefined && source.content !== value) return readableValue(source.content);
  return null;
}

function workTitle(work: FirmStagedArtifact, index: number): string {
  const source = record(work);
  for (const key of ["title", "subject", "summary", "path", "label"]) {
    const value = text(source?.[key]);
    if (value) return value;
  }
  return work.id ? `Prepared work ${work.id}` : `Prepared work ${index + 1}`;
}

function namesFor(refs: Array<string | null | undefined>, configuration?: FirmConfiguration | null) {
  return [...new Set(refs.filter((ref): ref is string => Boolean(ref)))].map((ref) => (
    configuration?.agents.find((agent) => agent.ref === ref)?.name?.trim() || ref.replaceAll("-", " ")
  ));
}

function laneY(index: number, count: number, height: number) {
  if (count <= 1) return Math.round(height / 2);
  const inset = 86;
  return Math.round(inset + (index * (height - (inset * 2))) / (count - 1));
}

function withPositions(nodes: Omit<DiveNode, "x" | "y">[]): DiveNode[] {
  const maxLane = Math.max(1, ...Object.keys(LANE_X).map((kind) => nodes.filter((node) => node.kind === kind).length));
  const height = Math.max(520, 172 * maxLane);
  const laneIndex = new Map<DiveNodeKind, number>();
  return nodes.map((node) => {
    const index = laneIndex.get(node.kind) ?? 0;
    laneIndex.set(node.kind, index + 1);
    const count = nodes.filter((candidate) => candidate.kind === node.kind).length;
    return { ...node, x: LANE_X[node.kind], y: laneY(index, count, height) };
  });
}

function rootEdge(target: string, kind: DiveNodeKind): DiveEdge {
  const labels: Partial<Record<DiveNodeKind, string>> = {
    event: "recorded here",
    work: "attached here",
    gate: "waiting for you",
    outcome: "returned here",
  };
  return { id: `bet:${target}`, source: "bet:origin", target, label: labels[kind] ?? "joined", tone: kind === "gate" ? "gate" : kind === "outcome" ? "outcome" : "neutral" };
}

function durationLabel(durationMs: number) {
  if (durationMs < 1000) return `${Math.round(durationMs)} ms`;
  if (durationMs < 60_000) return `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 1 : 0)} s`;
  return `${(durationMs / 60_000).toFixed(1)} min`;
}

function receiptFields(stage: FirmWorkflowStage) {
  return [
    ...(stage.durationMs == null ? [] : [{ label: "Duration", value: durationLabel(stage.durationMs) }]),
    ...(stage.costUsd == null ? [] : [{ label: "Run cost", value: `$${stage.costUsd.toFixed(2)}` }]),
  ];
}

function workflowNodeKind(stage: FirmWorkflowStage): DiveNodeKind {
  if (stage.kind === "staged") return "work";
  if (stage.kind === "gate") return "gate";
  if (stage.kind === "outcome") return "outcome";
  return "event";
}

function workflowEyebrow(stage: FirmWorkflowStage, eventType?: string | null): string {
  if (stage.kind === "staged") return "Prepared work";
  if (stage.kind === "gate") return "Needs your hand";
  if (stage.kind === "outcome") return "Market return";
  if (stage.kind === "settled") return "Learning recorded";
  if (!eventType) return "Activity";
  if (eventType === "bet_forked") return "Another approach opened";
  if (eventType === "bet_started") return "Work began";
  if (eventType === "staged") return "Work prepared";
  return "Activity";
}

function idTail(stage: FirmWorkflowStage, kind: string) {
  const marker = `:${kind}:`;
  const index = stage.id.lastIndexOf(marker);
  return index < 0 ? null : stage.id.slice(index + marker.length);
}

export function projectDive({ bet, wallItems, outcomes, configuration }: DiveInput): DiveProjection {
  const pendingWall = wallItems.filter((item) => item.betId === bet.id && !item.decision);
  const joinedOutcomes = outcomes.filter((outcome) => outcome.betId === bet.id);
  if (bet.latestOutcome && !joinedOutcomes.some((outcome) => outcome.id === bet.latestOutcome?.id)) {
    joinedOutcomes.push(bet.latestOutcome);
  }

  const workflow = bet.workflow ?? [];
  const openedStage = workflow.find((stage) => stage.kind === "opened");
  const eventsById = new Map((bet.events ?? []).flatMap((event) => event.id ? [[event.id, event] as const] : []));
  const workByRef = new Map(bet.staged.flatMap((work) => work.id ? [[work.id, work] as const] : []));
  const wallById = new Map(pendingWall.map((item) => [item.id, item]));
  const outcomesById = new Map(joinedOutcomes.map((outcome) => [outcome.id, outcome]));

  const bareNodes: Omit<DiveNode, "x" | "y">[] = [{
    id: "bet:origin",
    kind: "bet",
    state: "opened",
    title: "Work opened",
    body: bet.intent,
    at: openedStage?.at ?? bet.createdAt,
    eyebrow: "Direction",
    teammateNames: namesFor([bet.teammateRef], configuration),
    runningTeammateNames: [],
    runningSince: null,
    receipts: [
      ...(bet.forkedFrom ? [{ label: "Continued from", value: bet.forkedFrom }] : []),
      ...(bet.configurationRevision != null ? [{ label: "Firm revision", value: String(bet.configurationRevision) }] : []),
    ],
  }];

  for (const stage of workflow.filter((candidate) => candidate.kind !== "opened")) {
    const kind = workflowNodeKind(stage);
    const event = stage.eventId ? eventsById.get(stage.eventId) : null;
    const work = stage.workRef ? workByRef.get(stage.workRef) : null;
    const wallId = idTail(stage, "wall");
    const wallItem = wallId ? wallById.get(wallId) : undefined;
    const review = wallItem ? reviewContent(wallItem) : undefined;
    const outcomeId = idTail(stage, "outcome");
    const outcome = outcomeId ? outcomesById.get(outcomeId) : undefined;
    const ownerRefs = work ? [...(work.ownerRefs ?? []), ...(work.contributorRefs ?? [])] : [];
    const nodeId = kind === "work"
      ? `work:${stage.workRef ?? stage.id}`
      : kind === "gate"
        ? `gate:${wallId ?? stage.id}`
        : kind === "outcome"
          ? `outcome:${outcomeId ?? stage.id}`
          : `event:${stage.eventId ?? stage.id}`;
    bareNodes.push({
      id: nodeId,
      kind,
      state: stage.state,
      title: review?.title ?? (work ? workTitle(work, bet.staged.indexOf(work)) : null) ?? outcome?.outcomeKind?.trim() ?? stage.label,
      body: review?.why
        ?? (work ? readableValue(work.content ?? work) : null)
        ?? outcome?.body?.trim()
        ?? (stage.kind === "settled" ? bet.learning?.trim() || null : null),
      at: stage.at ?? null,
      eyebrow: review?.eyebrow ?? workflowEyebrow(stage, event?.type),
      teammateNames: namesFor(ownerRefs.length ? ownerRefs : [stage.teammateRef], configuration),
      runningTeammateNames: stage.state === "running" ? namesFor([stage.runningTeammateRef], configuration) : [],
      runningSince: stage.state === "running" ? stage.since ?? null : null,
      receipts: [
        ...receiptFields(stage),
        ...(stage.workRef ? [{ label: "Work ref", value: stage.workRef }] : []),
        ...(event?.type ? [{ label: "Event type", value: event.type }] : []),
        ...(work?.configurationRevision != null ? [{ label: "Firm revision", value: String(work.configurationRevision) }] : []),
        ...(wallItem ? [{ label: "Purpose", value: wallItem.purpose }] : []),
        ...(outcome?.from ? [{ label: "From", value: outcome.from }] : []),
        ...(outcome?.channel ? [{ label: "Channel", value: outcome.channel }] : []),
      ],
      wallItem,
      review,
    });
  }

  const sparse = bareNodes.length === 1;
  const nodes = sparse
    ? [{ ...bareNodes[0]!, x: 320, y: 260 }]
    : withPositions(bareNodes);
  const workNodeByRef = new Map(nodes.flatMap((node) => node.kind === "work"
    ? node.receipts.filter((receipt) => receipt.label === "Work ref").map((receipt) => [receipt.value, node.id] as const)
    : []));
  const edges: DiveEdge[] = [];
  nodes.filter((node) => node.kind === "event" || node.kind === "work").forEach((node) => edges.push(rootEdge(node.id, node.kind)));
  nodes.filter((node) => node.kind === "gate").forEach((node) => {
    const workRef = node.receipts.find((receipt) => receipt.label === "Work ref")?.value;
    const source = workRef ? workNodeByRef.get(workRef) : null;
    edges.push(source
      ? { id: `${source}:${node.id}`, source, target: node.id, label: "exact work held", tone: "gate" }
      : rootEdge(node.id, "gate"));
  });
  nodes.filter((node) => node.kind === "outcome").forEach((node) => {
    const workRef = node.receipts.find((receipt) => receipt.label === "Work ref")?.value;
    const source = workRef ? workNodeByRef.get(workRef) : null;
    if (source) edges.push({ id: `${source}:${node.id}`, source, target: node.id, label: "exact work returned", tone: "outcome" });
    else edges.push(rootEdge(node.id, "outcome"));
  });

  const maxLane = Math.max(1, ...Object.keys(LANE_X).map((kind) => nodes.filter((node) => node.kind === kind).length));
  return {
    nodes,
    edges,
    width: sparse ? 640 : 1170,
    height: Math.max(520, 172 * maxLane),
    gaps: [
      ...(sparse ? ["No evidence has been recorded beyond opening this work."] : []),
      ...(!pendingWall.length ? ["No outward act is waiting for you here, so there is nothing to inspect."] : []),
    ],
  };
}
