import type {
  FirmArchitectureElement,
  FirmArchitectureJoin,
  FirmArchitectureProjection,
  FirmBet,
  FirmLens,
  FirmOutcome,
  FirmStagedArtifact,
} from "@/types";
import { generateAtlasLayout } from "./atlasLayout";
import { atlasTeammates } from "./atlasTeammates";
import type { AtlasEdge, AtlasNode } from "./atlasTypes";

export function atlasInertData(kind: AtlasNode["data"]["kind"], title: string) {
  return {
    kind, title, pressure: [], altitude: "venture" as const, focusRole: "context" as const,
    selected: false, readOnly: false, onSelect: () => undefined, onFocus: () => undefined,
    onPromote: () => undefined, onActivateMotion: () => undefined, onBeginConnection: () => undefined,
    onOpenWall: () => undefined, onRevealMachinery: () => undefined,
  };
}

function architectureRef(value: string | null | undefined) {
  return String(value ?? "").replace(/^architecture:/, "").split("#")[0] || null;
}

function elementStatement(element: FirmArchitectureElement) {
  return element.statement ?? element.does ?? element.repeatabilityClaim ?? element.objective ?? element.value ?? null;
}

function pressureFor(projection: FirmArchitectureProjection, id: string) {
  return projection.pressure.filter((pressure) => architectureRef(pressure.subjectRef ?? pressure.subjectId) === id);
}

function edge(id: string, source: string, target: string, label: string, className = "") : AtlasEdge {
  return { id, source, target, label, className, type: "default" };
}

function text(value: unknown) {
  if (typeof value === "string") return value.trim() || null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  for (const key of ["body", "message", "content", "summary", "detail", "description", "path"]) {
    if (typeof record[key] === "string" && record[key].trim()) return record[key].trim();
  }
  return null;
}

function workTitle(work: FirmStagedArtifact | null, join: FirmArchitectureJoin, index: number) {
  return work?.title?.trim() || join.title?.trim() || (join.workRef ? `Prepared work ${join.workRef}` : `Prepared work ${index + 1}`);
}

function teammateNames(lens: FirmLens, refs: Array<string | null | undefined>) {
  return [...new Set(refs.filter((ref): ref is string => Boolean(ref)))].map((ref) => ({
    ref,
    name: lens.configuration?.agents.find((agent) => agent.ref === ref)?.name
      ?? lens.crew.find((member) => member.ref === ref)?.soul?.name
      ?? ref.replaceAll("-", " "),
  }));
}

function allWork(projection: FirmArchitectureProjection | null, lens: FirmLens) {
  const joins = new Map<string, FirmArchitectureJoin>();
  for (const join of projection?.joins.work ?? []) {
    const ref = String(join.workRef ?? join.id ?? "");
    if (ref) joins.set(ref, join);
  }
  for (const bet of lens.bets) {
    for (const work of bet.staged) {
      if (!work.id || joins.has(work.id)) continue;
      joins.set(work.id, { id: work.id, workRef: work.id, betId: bet.id, basis: "exact" });
    }
  }
  return [...joins.entries()];
}

function allOutcomes(projection: FirmArchitectureProjection | null, lens: FirmLens) {
  const entries = new Map<string, { join: FirmArchitectureJoin; outcome: FirmOutcome | null }>();
  for (const join of projection?.joins.outcomes ?? []) {
    const id = String(join.outcomeId ?? join.id ?? "");
    if (!id) continue;
    entries.set(id, { join, outcome: (lens.outcomes ?? []).find((outcome) => outcome.id === id) ?? null });
  }
  for (const outcome of lens.outcomes ?? []) {
    if (entries.has(outcome.id)) continue;
    entries.set(outcome.id, {
      outcome,
      join: { id: outcome.id, outcomeId: outcome.id, betId: outcome.betId, workRef: outcome.workRef, basis: outcome.joined ? "exact" : "unattributed", causal: false },
    });
  }
  return [...entries.entries()];
}

function betForWork(lens: FirmLens, join: FirmArchitectureJoin) {
  return lens.bets.find((bet) => bet.id === join.betId) ?? null;
}

function stagedWork(bet: FirmBet | null, workRef: string) {
  return bet?.staged.find((work) => work.id === workRef) ?? null;
}

export function projectAtlasSemanticLayer(projection: FirmArchitectureProjection | null, lens: FirmLens) {
  const nodes: AtlasNode[] = [];
  const edges: AtlasEdge[] = [];
  const layout = projection?.elements.length ? generateAtlasLayout(projection) : null;

  if (projection && layout) {
    projection.groups.forEach((group, index) => {
      const memberPositions = group.memberRefs.map((ref) => layout.positions.get(architectureRef(ref) ?? "")).filter(Boolean) as Array<{ x: number; y: number }>;
      const minX = memberPositions.length ? Math.min(...memberPositions.map((position) => position.x)) - 34 : 320;
      const minY = memberPositions.length ? Math.min(...memberPositions.map((position) => position.y)) - 42 : 80 + index * 220;
      const maxX = memberPositions.length ? Math.max(...memberPositions.map((position) => position.x)) + 334 : minX + 420;
      const maxY = memberPositions.length ? Math.max(...memberPositions.map((position) => position.y)) + 230 : minY + 180;
      nodes.push({
        id: `group:${group.id}`, type: "architectureGroup", position: { x: minX, y: minY }, zIndex: -2,
        style: { width: maxX - minX, height: maxY - minY }, selectable: true, draggable: false,
        data: { ...atlasInertData("group", group.name), statement: group.statement ?? null },
      });
    });

    let conceptIndex = 0;
    for (const element of projection.elements) {
      const id = `architecture:${element.id}`;
      const pressure = pressureFor(projection, element.id);
      const active = element.id === layout.activeCampaignId || element.id === layout.activeMotionId;
      const atWall = pressure.some((entry) => entry.reason === "held-release");
      const restingOverflow = element.role === "concept" && conceptIndex++ >= 3;
      nodes.push({
        id, type: "architectureElement", position: layout.positions.get(element.id) ?? { x: 400, y: 120 + nodes.length * 150 },
        selectable: true, draggable: false,
        data: {
          ...atlasInertData(element.role, element.name), element, statement: elementStatement(element), pressure,
          active, atWall, restingOverflow, teammates: atlasTeammates(projection, lens, id),
          continuation: element.role === "campaign" && active ? "Start here · Follow to the release" : null,
        },
      });
    }

    for (const connection of projection.connections) {
      const from = architectureRef(connection.fromRef);
      const to = architectureRef(connection.toRef);
      if (!from || !to) continue;
      edges.push(edge(`connection:${connection.id}`, `architecture:${from}`, `architecture:${to}`, connection.label, connection.assertion === "tentative" ? "atlas-edge-tentative" : ""));
    }
    for (const motion of projection.elements.filter((element) => element.role === "motion")) {
      for (const systemId of motion.systemIds ?? []) edges.push(edge(`powers:${systemId}:${motion.id}`, `architecture:${systemId}`, `architecture:${motion.id}`, "powers"));
      for (const productRef of motion.productRefs ?? []) {
        const productId = architectureRef(productRef);
        if (productId) edges.push(edge(`shapes:${productId}:${motion.id}`, `architecture:${productId}`, `architecture:${motion.id}`, "shapes"));
      }
    }
    for (const campaign of projection.elements.filter((element) => element.role === "campaign")) {
      const motionIds = [...new Set([campaign.primaryMotionId, ...(campaign.motionIds ?? [])].filter((id): id is string => Boolean(id)))];
      motionIds.forEach((motionId) => edges.push(edge(`runs:${motionId}:${campaign.id}`, `architecture:${motionId}`, `architecture:${campaign.id}`, "runs through")));
      if (campaign.governingBetId) edges.push(edge(`governs:${campaign.id}:${campaign.governingBetId}`, `architecture:${campaign.id}`, `bet:${campaign.governingBetId}`, "governs"));
    }
  }

  const workEntries = allWork(projection, lens);
  workEntries.forEach(([workRef, join], index) => {
    const bet = betForWork(lens, join);
    const work = stagedWork(bet, workRef);
    const wallJoin = projection?.joins.wall.find((candidate) => candidate.workRef === workRef);
    const atWall = Boolean(wallJoin && (lens.wallItems ?? []).some((item) => item.id === wallJoin.wallItemId || item.workRef === workRef));
    nodes.push({
      id: `work:${workRef}`, type: "architectureElement",
      position: layout?.workPosition(join.campaignId ?? null, index) ?? { x: 1120, y: 120 + index * 160 }, selectable: true, draggable: false,
      data: {
        ...atlasInertData("work", workTitle(work, join, index)), join, statement: text(work?.content ?? work), atWall,
        teammates: teammateNames(lens, [...(work?.ownerRefs ?? []), ...(work?.contributorRefs ?? []), bet?.teammateRef]),
        stateLabel: atWall ? "Needs you" : "Prepared", outputLabel: "Exact work", verbLabel: atWall ? "Held for your decision" : "Attached to this direction",
      },
    });
    if (join.betId) edges.push(edge(`staged:${join.betId}:${workRef}`, `bet:${join.betId}`, `work:${workRef}`, "prepared", "atlas-edge-work"));
    if (atWall) edges.push(edge(`held:${workRef}`, `work:${workRef}`, "atlas:wall", "held for you", "atlas-edge-at-wall"));
  });

  allOutcomes(projection, lens).forEach(([outcomeId, { join, outcome }], index) => {
    nodes.push({
      id: `outcome:${outcomeId}`, type: "architectureElement",
      position: layout?.outcomePosition(join.campaignIds?.[0] ?? null, index) ?? { x: 1420, y: 160 + index * 180 }, selectable: true, draggable: false,
      data: {
        ...atlasInertData("outcome", outcome?.body?.trim() || outcome?.outcomeKind?.trim() || join.title?.trim() || "Returned evidence"),
        outcome: outcome ?? undefined, join, statement: outcome?.from ? `From ${outcome.from}${outcome.channel ? ` · ${outcome.channel}` : ""}` : null,
        stateLabel: "Returned", outputLabel: outcome?.outcomeKind ?? "Evidence", verbLabel: "Joined, not caused",
      },
    });
    const workRef = join.workRef ?? outcome?.workRef;
    if (workRef && workEntries.some(([ref]) => ref === workRef)) edges.push(edge(`returned:${workRef}:${outcomeId}`, `work:${workRef}`, `outcome:${outcomeId}`, "returned through receipt", "atlas-edge-world-return"));
    else if (join.betId) edges.push(edge(`returned:${join.betId}:${outcomeId}`, `bet:${join.betId}`, `outcome:${outcomeId}`, "joined to direction", "atlas-edge-world-return"));
  });

  return { nodes, edges };
}
