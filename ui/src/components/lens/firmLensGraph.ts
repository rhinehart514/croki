import type { Edge, Node } from "@xyflow/react";
import type { FirmLens } from "@/types";
import { betAnchorKey, capabilityAnchorKey, crewAnchorKey } from "@/lib/lensLayout";
import type { CrewNodeData } from "./CrewNode";
import type { BetTerritoryData } from "./BetTerritory";
import type { CapabilityNodeData } from "./CapabilityNode";
import type { CanvasCapability } from "./canvasCapabilities";
import { configurationForLens } from "@/lib/firmConfiguration";
import { projectBetWork } from "./workyardProjection";

export function buildFirmLensNodes(
  lens: FirmLens,
  positions: Record<string, { x: number; y: number }>,
  onProposeCapability?: (agentRef: string, capability: string) => Promise<void>,
  capabilities: CanvasCapability[] = [],
): Node[] {
  const nodes: Node[] = [];
  const configuration = configurationForLens(lens);
  const workingRefs = new Set(
    lens.bets.filter((bet) => bet.position === "live").map((bet) => bet.teammateRef).filter(Boolean),
  );
  for (const member of lens.crew) {
    const agent = configuration.agents.find((entry) => entry.ref === member.ref) ?? null;
    nodes.push({
      id: crewAnchorKey(member.ref),
      type: "crew",
      ariaLabel: `${agent?.name ?? member.soul?.name ?? member.ref}, configured ${agent?.label ?? configuration.presentation.participantLabel}`,
      position: positions[crewAnchorKey(member.ref)] ?? { x: 0, y: 0 },
      data: {
        crew: member,
        agent,
        participantLabel: configuration.presentation.participantLabel,
        working: workingRefs.has(member.ref),
        onProposeCapability,
      } satisfies CrewNodeData,
      draggable: true,
      deletable: false,
    });
  }
  for (const bet of lens.bets) {
    nodes.push({
      id: betAnchorKey(bet.id),
      type: "bet",
      ariaLabel: `${bet.position === "at-wall" ? "Needs your hand" : bet.position === "live" ? "Underway" : "Ended"}: ${bet.intent}`,
      position: positions[betAnchorKey(bet.id)] ?? { x: 0, y: 0 },
      data: {
        bet,
        cards: projectBetWork(lens, bet),
        crew: lens.crew,
        configuration,
      } satisfies BetTerritoryData,
      draggable: true,
      deletable: false,
    });
  }
  for (const capability of capabilities) {
    const id = capabilityAnchorKey(capability.id);
    if (!positions[id]) continue;
    nodes.push({
      id,
      type: "capability",
      ariaLabel: `${capability.name}, ${capability.authority === "wall" ? "founder review" : "read only"} capability`,
      position: positions[id],
      data: { capability } satisfies CapabilityNodeData,
      draggable: true,
      deletable: false,
    });
  }
  return nodes;
}

export function buildFirmLensEdges(lens: FirmLens): Edge[] {
  const { bets } = lens;
  const byId = new Map(bets.map((bet) => [bet.id, bet]));
  const edges: Edge[] = [];
  for (const relationship of configurationForLens(lens).organization.relationships) {
    edges.push({
      id: `organization:${relationship.from}:${relationship.kind}:${relationship.to}`,
      source: crewAnchorKey(relationship.from),
      target: crewAnchorKey(relationship.to),
      sourceHandle: "organization-out",
      targetHandle: "organization-in",
      label: relationship.label ?? relationship.kind,
      className: "firm-lens-organization-edge",
      type: "smoothstep",
      zIndex: -1,
      style: { stroke: "var(--ghost)", strokeWidth: 1.15, strokeDasharray: "6 4" },
      labelStyle: { fill: "var(--muted)", fontSize: 9, fontWeight: 600 },
      labelBgStyle: { fill: "var(--canvas)", fillOpacity: 0.92 },
      labelBgPadding: [4, 2],
      labelBgBorderRadius: 4,
    });
  }
  for (const bet of bets) {
    if (bet.teammateRef) {
      edges.push({
        id: `crew-${bet.teammateRef}-${bet.id}`,
        source: crewAnchorKey(bet.teammateRef),
        target: betAnchorKey(bet.id),
        sourceHandle: "work",
        style: { stroke: "var(--line-2)" },
      });
    }
    if (bet.forkedFrom && byId.has(bet.forkedFrom)) {
      edges.push({
        id: `fork-${bet.forkedFrom}-${bet.id}`,
        source: betAnchorKey(bet.forkedFrom),
        target: betAnchorKey(bet.id),
        style: { stroke: "var(--ghost)", strokeDasharray: "3 3" },
      });
    }
  }
  return edges;
}
