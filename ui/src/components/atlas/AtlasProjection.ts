import type { FirmArchitectureProjection, FirmLens } from "@/types";
import type { AtlasNode, AtlasScene } from "./atlasTypes";
import { atlasInertData, projectAtlasSemanticLayer } from "./atlasSemanticProjection";
import { decisionBandForBet, effortKicker, effortStateLabel, effortTone, motionLabelForBet } from "./betBand";
import { projectWorkingTheory } from "./workingTheoryProjection";

type Capability = { id: string; name: string; description: string; authority: "read" | "wall"; connected?: boolean };

// The hub anchors the field; the layout engine pins it at the origin and rings everything else
// around it. These are placeholder coordinates only — every placeable card's real position is
// decided by the collision-free engine (atlasLayoutEngine) downstream. Placement is engine-owned.
const HUB_ANCHOR = { x: 0, y: 0 };

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

// Which named path (motion) a bet rides, if any. Used only to label the effort card — never to
// place it. This names the *motion* the bet's campaign runs through (matching the old orbit sector
// label semantics: several campaigns on the same motion read as the same path), or null.
function pathNameByBet(projection: FirmArchitectureProjection | null, lens: FirmLens) {
  const byBet = new Map<string, string | null>();
  const campaigns = projection?.elements.filter((element) => element.role === "campaign") ?? [];
  const motionNameById = new Map(
    (projection?.elements.filter((element) => element.role === "motion") ?? []).map((motion) => [motion.id, motion.name]),
  );
  const joins = projection?.joins?.bets ?? [];
  for (const bet of lens.bets) {
    const joinedCampaignId = joins.find((join) => join.betId === bet.id && join.campaignId)?.campaignId ?? null;
    const campaign = campaigns.find((element) => (
      element.governingBetId === bet.id
      || element.supportingBetIds?.includes(bet.id)
      || (joinedCampaignId != null && element.id === joinedCampaignId)
    ));
    const motionId = campaign?.primaryMotionId ?? campaign?.motionIds?.[0] ?? null;
    byBet.set(bet.id, (motionId != null ? motionNameById.get(motionId) : null) ?? null);
  }
  return byBet;
}

// One line of what a teammate is doing right now, and the presence tone that colors the dot/chip.
// Deterministic (code, not model): a teammate who owns an effort awaiting the founder's read is
// "asking"; one who owns any live effort is "working"; otherwise idle. This is the composite's crew
// "now-doing" line ("drawing the taxonomy", "waiting on your read").
function crewActivity(lens: FirmLens, ref: string): { presence: "working" | "asking" | "idle"; doing: string } {
  const owned = lens.bets.filter((bet) => bet.teammateRef === ref);
  const asking = owned.find((bet) => decisionBandForBet(bet, lens) === "approaching-wall" || bet.position === "at-wall");
  if (asking) return { presence: "asking", doing: "waiting on your read" };
  const working = owned.find((bet) => bet.position === "live");
  if (working) {
    const draft = working.staged[0]?.title?.trim();
    return { presence: "working", doing: draft ? `on ${working.intent.length > 26 ? "this effort" : working.intent.toLowerCase()}` : "moving this forward" };
  }
  return { presence: "idle", doing: "with you on this venture" };
}

function placedNodes(lens: FirmLens, capabilities: Capability[]) {
  const nodes: AtlasNode[] = [];
  for (const member of lens.crew) {
    const id = `crew:${member.ref}`;
    // Placement is engine-owned; teammates and capabilities are auto-placed by the layout engine
    // (the founder never drags). The placeholder position is overwritten downstream.
    const activity = crewActivity(lens, member.ref);
    nodes.push({ id, type: "atlasCrew", position: HUB_ANCHOR, draggable: false, data: {
      ...atlasInertData("teammate", member.soul?.name?.trim() || member.ref),
      statement: "Working this venture with you", agentRef: member.ref,
      crewPresence: activity.presence, crewDoing: activity.doing,
    } });
  }
  for (const capability of capabilities) {
    const id = `capability:${capability.id}`;
    // Gmail is a wall-authority outbound port that is "connected" only when the founder has wired it;
    // the bound product repository is a read port that is always connected. The founder-facing state
    // word is ordinary language (connected / not connected), never authority jargon.
    const isGmail = /gmail|mail/i.test(capability.id) || /gmail|mail/i.test(capability.name);
    const connected = capability.authority === "read" || Boolean(capability.connected);
    nodes.push({ id, type: "atlasCapability", position: HUB_ANCHOR, draggable: false, data: {
      ...atlasInertData("capability", capability.name), statement: capability.description, authority: capability.authority,
      capabilityConnected: connected, capabilityKind: isGmail ? "gmail" : "repo",
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
  const semantic = projectAtlasSemanticLayer(projection, lens);
  const pathByBet = pathNameByBet(projection, lens);
  // The hub is the venture's question at the center. The engine pins it at the field origin; this
  // placeholder position is overwritten by the layout engine downstream.
  const nodes: AtlasNode[] = [{
    id: "atlas:intent", type: "atlasIntent", position: HUB_ANCHOR, selectable: false, draggable: false,
    data: { ...atlasInertData("intent", namedIntent || "What should change?"), betCount: lens.bets.length, revision: projection?.revision, intentNamed: Boolean(namedIntent), provisional: Boolean(projection?.workingTheory) },
  }];

  const crewNameByRef = new Map(lens.crew.map((member) => [member.ref, member.soul?.name?.trim() || member.ref]));
  for (const bet of lens.bets) {
    const band = decisionBandForBet(bet, lens);
    // Attribution as faces: the teammate who owns the effort, plus any who contributed to a draft.
    // These drive the footer facepile — the firm reads as staffed (composite §effort delogo).
    const contributorRefs = new Set<string>();
    if (bet.teammateRef) contributorRefs.add(bet.teammateRef);
    for (const draft of bet.staged) {
      for (const ref of [...(draft.ownerRefs ?? []), ...(draft.contributorRefs ?? [])]) contributorRefs.add(ref);
    }
    const teammateRefs = [...contributorRefs];
    const draftCount = bet.staged.length;
    // Titled by content, never the staged-… ID (contract §4). The ID lives under a disclosure in the
    // inspector — here the founder sees what the draft *is*. When the single draft carries no content
    // title yet, the chip shows just "1 draft" (no filler word); attribution reads from the facepile.
    const draftTitle = draftCount === 1 ? (bet.staged[0]?.title?.trim() || null) : null;
    nodes.push({
      id: `bet:${bet.id}`, type: "atlasBet", position: HUB_ANCHOR, selectable: true, draggable: false,
      data: {
        ...atlasInertData("bet", bet.intent), bet,
        motionLabel: motionLabelForBet(bet, pathByBet),
        decisionBand: band,
        // Founder-facing card copy — ordinary words only (the raw band token stays as a seam above).
        effortKicker: effortKicker(band),
        effortTone: effortTone(band),
        stateLabel: effortStateLabel(bet, band),
        draftCount,
        draftTitle,
        teammates: teammateRefs.map((ref) => ({ ref, name: crewNameByRef.get(ref) ?? ref })),
        // orbitSide is stamped from the engine's settled position (which side of the field center
        // the card lands) so the in-place expansion grows toward open space — see the engine adapter.
        workflow: bet.workflow ?? [], machineryCounts: bet.machineryCounts ?? [],
      },
    });
  }

  nodes.push({
    id: "atlas:wall", type: "founderWall", position: HUB_ANCHOR, selectable: true, draggable: false,
    data: {
      ...atlasInertData("wall", lens.wall.count ? "Needs your hand" : "Nothing needs you yet"), active: lens.wall.count > 0,
      statement: lens.wall.count ? `${lens.wall.count} outward ${lens.wall.count === 1 ? "act" : "acts"} held for your decision` : "Outward acts stop here",
    },
  });
  nodes.push(...semantic.nodes);
  const theory = projectWorkingTheory(projection?.workingTheory, nodes);
  nodes.push(...theory.nodes, ...placedNodes(lens, anchors.capabilities ?? []));
  // The hub's signature spokes: a soft living line from the central question out to each effort it
  // opened. The relationship (hub ↔ efforts) already exists in the related map; these are its visible
  // rendering — the canvas exists to show how concrete actions relate, not just their status. Only
  // efforts get a spoke (teammates/capabilities read by proximity, per the composite).
  const hubSpokes: AtlasScene["edges"] = lens.bets.map((bet) => ({
    id: `hub-spoke:${bet.id}`,
    source: "atlas:intent",
    target: `bet:${bet.id}`,
    label: "",
    className: "atlas-edge-hub-spoke",
    type: "default",
  }));
  const edges = [...hubSpokes, ...semantic.edges, ...theory.edges];
  return { nodes: stableKeyboardOrder(nodes), edges, related: relatedMap(lens, edges) };
}
