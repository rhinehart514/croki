import type { FirmArchitectureProjection, FirmLens } from "@/types";
import type { AtlasNode, AtlasScene } from "./atlasTypes";
import { ORBIT_CENTER, ORBIT_FIELD_SIZE, ORBIT_WALL_X, projectOrbitLayout } from "./atlasOrbitLayout";
import { atlasInertData, projectAtlasSemanticLayer } from "./atlasSemanticProjection";
import { projectWorkingTheory } from "./workingTheoryProjection";

type Capability = { id: string; name: string; description: string; authority: "read" | "wall" };

const KEYBOARD_KIND_ORDER: Partial<Record<AtlasNode["data"]["kind"], number>> = {
  theory: 0,
  concept: 1,
  "product-loop": 1,
  system: 1,
  motion: 1,
  campaign: 1,
  group: 1,
  bet: 2,
  work: 3,
  outcome: 4,
  wall: 5,
  teammate: 6,
  capability: 6,
};

function stableKeyboardOrder(nodes: AtlasNode[]) {
  return nodes
    .map((node, index) => ({ node, index }))
    .sort((left, right) => (
      (KEYBOARD_KIND_ORDER[left.node.data.kind] ?? -1)
      - (KEYBOARD_KIND_ORDER[right.node.data.kind] ?? -1)
      || left.index - right.index
    ))
    .map(({ node }) => node);
}

function placedNodes(lens: FirmLens, capabilities: Capability[]) {
  const nodes: AtlasNode[] = [];
  for (const member of lens.crew) {
    const id = `crew:${member.ref}`;
    const position = lens.placement.positions[id];
    if (!position) continue;
    nodes.push({ id, type: "architectureElement", position, draggable: true, data: {
      ...atlasInertData("teammate", member.soul?.name?.trim() || member.ref),
      statement: "Placed here for direct venture context", agentRef: member.ref,
    } });
  }
  for (const capability of capabilities) {
    const id = `capability:${capability.id}`;
    const position = lens.placement.positions[id];
    if (!position) continue;
    nodes.push({ id, type: "architectureElement", position, draggable: true, data: {
      ...atlasInertData("capability", capability.name), statement: capability.description, authority: capability.authority,
      stateLabel: capability.authority === "wall" ? "Founder-controlled" : "Read only",
      outputLabel: capability.authority === "wall" ? "Outward actions need your hand" : "Supplies grounded context", verbLabel: "Placed",
    } });
  }
  return nodes;
}

function relatedMap(lens: FirmLens, edges: AtlasScene["edges"]) {
  const related = new Map<string, Set<string>>();
  for (const bet of lens.bets) {
    const id = `bet:${bet.id}`;
    related.set(id, new Set(["atlas:intent", ...(bet.position === "at-wall" ? ["atlas:wall"] : [])]));
  }
  related.set("atlas:intent", new Set(lens.bets.map((bet) => `bet:${bet.id}`)));
  for (const edge of edges) {
    if (!related.has(edge.source)) related.set(edge.source, new Set());
    if (!related.has(edge.target)) related.set(edge.target, new Set());
    related.get(edge.source)?.add(edge.target);
    related.get(edge.target)?.add(edge.source);
  }
  return related;
}

export function projectAtlas(
  projection: FirmArchitectureProjection | null,
  lens: FirmLens,
  anchors: { capabilities?: Capability[] } = {},
): AtlasScene {
  const namedIntent = projection?.workingTheory?.intent?.trim()
    || projection?.document.intent?.statement?.trim()
    || null;
  const orbit = projectOrbitLayout(projection, lens);
  const semantic = projectAtlasSemanticLayer(projection, lens);
  const nodes: AtlasNode[] = [{
    id: "atlas:orbit-field", type: "orbitField", position: { x: 0, y: 0 }, selectable: false, draggable: false, zIndex: -10,
    style: ORBIT_FIELD_SIZE, data: { ...atlasInertData("orbit-field", "Decision proximity"), sectors: orbit.sectors, wallCount: lens.wall.count },
  }, {
    id: "atlas:intent", type: "atlasIntent", position: { x: ORBIT_CENTER.x - 125, y: ORBIT_CENTER.y - 82 }, selectable: false, draggable: false,
    data: { ...atlasInertData("intent", namedIntent || "What should change?"), betCount: lens.bets.length, revision: projection?.revision, intentNamed: Boolean(namedIntent), provisional: Boolean(projection?.workingTheory) },
  }];

  for (const bet of lens.bets) {
    const position = orbit.positions.get(bet.id) ?? ORBIT_CENTER;
    nodes.push({
      id: `bet:${bet.id}`, type: "atlasBet", position: { x: position.x - 90, y: position.y - 52 }, selectable: true, draggable: false,
      data: {
        ...atlasInertData("bet", bet.intent), bet, motionLabel: orbit.labels.get(bet.id) ?? "Ungrouped",
        decisionBand: orbit.bands.get(bet.id), orbitSide: position.x < ORBIT_CENTER.x ? "left" : "right",
        workflow: bet.workflow ?? [], machineryCounts: bet.machineryCounts ?? [],
      },
    });
  }

  nodes.push({
    id: "atlas:wall", type: "founderWall", position: { x: ORBIT_WALL_X, y: ORBIT_CENTER.y - 60 }, selectable: true, draggable: false,
    data: {
      ...atlasInertData("wall", lens.wall.count ? "Needs your hand" : "Nothing needs you yet"), active: lens.wall.count > 0,
      statement: lens.wall.count ? `${lens.wall.count} outward ${lens.wall.count === 1 ? "act" : "acts"} held for your decision` : "Outward acts stop here",
    },
  });
  nodes.push(...semantic.nodes);
  const theory = projectWorkingTheory(projection?.workingTheory, nodes);
  nodes.push(...theory.nodes, ...placedNodes(lens, anchors.capabilities ?? []));
  const edges = [...semantic.edges, ...theory.edges];
  return { nodes: stableKeyboardOrder(nodes), edges, related: relatedMap(lens, edges) };
}
