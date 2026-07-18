// lensPackers.ts — the four pure `scene → positions` packers behind the operating lens.
//
// Each is a deterministic column/band packer (NOT d3-force): given the same scene it returns the same
// positions, so a re-enter is stable and the FLIP that plays it is reproducible. Every packer places EVERY
// node it is given a position — the id-set is the lens's object identity (rule 15). Positions are TOP-LEFT.
// Pure: no React, no persistence, no xyflow runtime, no placement writes.

import type { Node } from "@xyflow/react";
import type { FirmArchitectureProjection, FirmLens } from "@/types";
import { TERRITORY_SIDE } from "./canvasTerritory";
import { decisionBandForBet } from "@/components/atlas/betBand";
import type { AtlasDecisionBand } from "@/components/atlas/atlasTypes";
import {
  BAND_GUTTER, COL_GUTTER, ROW_GUTTER, SEAM_GUTTER,
  byRankThenId, footprint, kindOf, stackColumn,
  type Positioned, type TerritoryMap,
} from "./lensGeometry";

// ── Understand ────────────────────────────────────────────────────────────────────────────────────────
// Reading bands ordered by evidence strength: measured / repository-backed at the top, contested /
// unsupported at the bottom. bets and work recede below the claim bands. Evidence order comes from the
// node's epistemic state (stamped upstream by deriveEpistemicState) so the arrangement reads the SAME
// grammar the tokens render. A node with no epistemic state sorts to the neutral middle.
const EVIDENCE_RANK: Record<string, number> = {
  measured: 0,
  "repository-backed": 1,
  "founder-established": 2,
  "drovers-read": 3,
  historical: 4,
  stale: 5,
  unsupported: 6,
  contested: 7,
};

function epistemicRank(node: Node): number {
  const state = (node.data as { epistemic?: unknown }).epistemic;
  const key = typeof state === "string" ? state : "";
  return EVIDENCE_RANK[key] ?? 3.5;
}

// Claim-carrying kinds read as the evidence spine; bets/work/outcomes/crew/capabilities recede below it.
const CLAIM_KINDS = new Set([
  "concept", "system", "product-loop", "motion", "campaign", "release", "implementation",
  "audience", "offer", "channel", "theory", "wall",
]);

export function arrangeUnderstand(nodes: Node[]): Record<string, Positioned> {
  const out: Record<string, Positioned> = {};
  const intent = nodes.find((node) => node.id === "atlas:intent");
  if (intent) out[intent.id] = { x: -footprint(intent).width / 2, y: -footprint(intent).height - BAND_GUTTER };

  const rest = nodes.filter((node) => node.id !== "atlas:intent");
  const claims = rest.filter((node) => CLAIM_KINDS.has(kindOf(node))).sort(byRankThenId(epistemicRank));
  const recede = rest.filter((node) => !CLAIM_KINDS.has(kindOf(node))).sort(byRankThenId(epistemicRank));

  // Evidence spine: one column, strongest evidence at the top, weakest at the bottom.
  let y = 0;
  const spineLeft = -260;
  for (const node of claims) {
    const { height } = footprint(node);
    out[node.id] = { x: spineLeft, y };
    y += height + ROW_GUTTER;
  }

  // Receding column to the right, below the reading fold.
  Object.assign(out, stackColumn(recede, 360, 0));
  return out;
}

// ── Design ────────────────────────────────────────────────────────────────────────────────────────────
// Composition clusters: Product one side, GTM the other (TERRITORY_SIDE), clustered by architecture role
// within a side. Territory-null objects sit on the seam column. The founder reads the two territories as
// composed halves rather than a scatter.
const DESIGN_ROLE_RANK: Record<string, number> = {
  "product-loop": 0, system: 1, implementation: 2, release: 3, capability: 4,
  campaign: 0, motion: 1, audience: 2, offer: 3, channel: 4,
  concept: 5, theory: 6, bet: 7, work: 8, outcome: 9, teammate: 10, wall: 11,
};

function designRank(node: Node): number {
  return DESIGN_ROLE_RANK[kindOf(node)] ?? 12;
}

export function arrangeDesign(nodes: Node[], territory: TerritoryMap): Record<string, Positioned> {
  const out: Record<string, Positioned> = {};
  const product: Node[] = [];
  const gtm: Node[] = [];
  const seam: Node[] = [];
  for (const node of nodes) {
    if (node.id === "atlas:intent") { seam.push(node); continue; }
    const own = territory.get(node.id) ?? null;
    // TERRITORY_SIDE is the ONE source of L/R sidedness (the same the seed biases from): -1 product left,
    // +1 gtm right, no facet → seam.
    const side = own ? TERRITORY_SIDE[own] : 0;
    if (side < 0) product.push(node);
    else if (side > 0) gtm.push(node);
    else seam.push(node);
  }
  product.sort(byRankThenId(designRank));
  gtm.sort(byRankThenId(designRank));
  seam.sort(byRankThenId(designRank));

  const productWidth = Math.max(0, ...product.map((node) => footprint(node).width));
  Object.assign(out, stackColumn(product, -SEAM_GUTTER - productWidth, 0));
  Object.assign(out, stackColumn(gtm, SEAM_GUTTER, 0));
  // Seam column centred on x=0, stacked below intent.
  const seamWidth = Math.max(0, ...seam.map((node) => footprint(node).width));
  Object.assign(out, stackColumn(seam, -seamWidth / 2, -footprint(seam[0] ?? nodes[0]).height - BAND_GUTTER));
  return out;
}

// ── Execute (marquee) ─────────────────────────────────────────────────────────────────────────────────
// TWO pressure-ordered columns — Product-rooted LEFT, GTM-rooted RIGHT (TERRITORY_SIDE) — over ONE shared
// vertical pressure axis: equal y === equal decision pressure. Pressure comes from decisionBandForBet,
// inherited to work/outcomes via their owning bet. `atlas:wall` spans the seam at the urgency row; the
// intent hub pins on the seam above the columns. Sidedness AND single-pressure-ordering coexist by
// construction: the column decides x, the pressure band decides y, independently.
//
// Pressure rows, most-urgent at the TOP (small y): approaching-wall (needs a read) → drifting (underway) →
// near-intent (fresh) → settled (finished). Equal band === equal y row, so a product bet and a gtm bet
// under the same pressure sit at the same height across the seam.
const PRESSURE_ROW: Record<AtlasDecisionBand, number> = {
  "approaching-wall": 0,
  drifting: 1,
  "near-intent": 2,
  settled: 3,
};

function betIdOf(node: Node): string {
  const data = node.data as { bet?: { id?: unknown } };
  return typeof data.bet?.id === "string" ? data.bet.id : node.id.replace(/^bet:/, "");
}

function betDecisionBand(node: Node, lens: FirmLens): AtlasDecisionBand | null {
  const bet = lens.bets.find((candidate) => candidate.id === betIdOf(node));
  return bet ? decisionBandForBet(bet, lens) : null;
}

function ownerBetIdOf(node: Node): string | null {
  const data = node.data as { join?: { betId?: unknown }; outcome?: { betId?: unknown } };
  const betId = data.join?.betId ?? data.outcome?.betId;
  return typeof betId === "string" && betId ? betId : null;
}

// The pressure row for any execute-relevant node: a bet reads its own band; work/outcome inherit their
// owning bet's band; everything else sits at the bottom "settled" row (context, not pressure).
function executeRow(node: Node, lens: FirmLens, bandByBetId: Map<string, AtlasDecisionBand>): number {
  const kind = kindOf(node);
  if (kind === "bet") {
    const band = betDecisionBand(node, lens);
    return band ? PRESSURE_ROW[band] : PRESSURE_ROW.settled;
  }
  if (kind === "work" || kind === "outcome") {
    const owner = ownerBetIdOf(node);
    const band = owner ? bandByBetId.get(owner) : undefined;
    return band ? PRESSURE_ROW[band] : PRESSURE_ROW.settled;
  }
  return PRESSURE_ROW.settled;
}

export function arrangeExecute(nodes: Node[], territory: TerritoryMap, lens: FirmLens): Record<string, Positioned> {
  const out: Record<string, Positioned> = {};
  const bandByBetId = new Map<string, AtlasDecisionBand>();
  for (const node of nodes) {
    if (kindOf(node) !== "bet") continue;
    const band = betDecisionBand(node, lens);
    if (band) bandByBetId.set(betIdOf(node), band);
  }

  // Uniform row pitch: the tallest reserved footprint across all nodes + gutter, so a shared row axis is
  // level across both columns and every band is a clean horizontal reading line.
  const rowHeight = Math.max(0, ...nodes.map((node) => footprint(node).height)) + ROW_GUTTER;
  const rowYForRow = (row: number) => row * rowHeight;

  const intent = nodes.find((node) => node.id === "atlas:intent");
  const wall = nodes.find((node) => node.id === "atlas:wall");

  // Column members: product-rooted left, gtm-rooted right. Intent and wall span the seam, handled apart.
  const productCol: Node[] = [];
  const gtmCol: Node[] = [];
  const seamCol: Node[] = [];
  for (const node of nodes) {
    if (node.id === "atlas:intent" || node.id === "atlas:wall") continue;
    const own = territory.get(node.id) ?? null;
    // TERRITORY_SIDE decides x-side (product left / gtm right); the pressure row decides y. The two coexist
    // by construction — column is horizontal, pressure is vertical.
    const side = own ? TERRITORY_SIDE[own] : 0;
    if (side < 0) productCol.push(node);
    else if (side > 0) gtmCol.push(node);
    else seamCol.push(node);
  }

  // Within a column, group by pressure row then stack by id so same-band peers pack under each other while
  // the band's y anchor stays the row line (equal band ≈ equal y).
  const usedRows = new Set<number>();
  const placeColumn = (column: Node[], anchorX: number, anchorRight: boolean) => {
    const perRow = new Map<number, Node[]>();
    for (const node of column) {
      const row = executeRow(node, lens, bandByBetId);
      usedRows.add(row);
      (perRow.get(row) ?? perRow.set(row, []).get(row)!).push(node);
    }
    for (const [row, list] of perRow) {
      list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      let y = rowYForRow(row);
      for (const node of list) {
        const { width, height } = footprint(node);
        out[node.id] = { x: anchorRight ? anchorX - width : anchorX, y };
        y += height + ROW_GUTTER; // stack same-band peers downward from the row line
      }
    }
  };

  placeColumn(productCol, -SEAM_GUTTER, true); // right edges align just left of the seam
  placeColumn(gtmCol, SEAM_GUTTER, false); // left edges align just right of the seam
  // Seam-null nodes (crew, capabilities, bare concepts) stack down the seam centre below the columns.
  const maxRow = Math.max(PRESSURE_ROW.settled, ...usedRows);
  const seamWidth = Math.max(0, ...seamCol.map((node) => footprint(node).width));
  Object.assign(out, stackColumn(seamCol.slice().sort((a, b) => (a.id < b.id ? -1 : 1)), -seamWidth / 2, rowYForRow(maxRow + 1)));

  // Intent hub pins on the seam ABOVE the columns; wall spans the seam at the urgency row (row 0).
  if (intent) out[intent.id] = { x: -footprint(intent).width / 2, y: -footprint(intent).height - BAND_GUTTER };
  if (wall) out[wall.id] = { x: -footprint(wall).width / 2, y: rowYForRow(PRESSURE_ROW["approaching-wall"]) };
  return out;
}

// ── Learn ─────────────────────────────────────────────────────────────────────────────────────────────
// Returned outcomes chain cause → evidence along join.basis edges. Walk projection.joins: an outcome's
// owning bet is its cause root; the chain reads left → right (root → outcome), grouped into rows by the
// root's territory. A node not part of any chain recedes below the chains.
export function arrangeLearn(
  nodes: Node[],
  territory: TerritoryMap,
  projection: FirmArchitectureProjection | null,
): Record<string, Positioned> {
  const out: Record<string, Positioned> = {};
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const tallest = Math.max(0, ...nodes.map((node) => footprint(node).height));

  // Build cause→evidence chains: each outcome join links a bet (cause) to an outcome (evidence).
  const chainByBet = new Map<string, string[]>();
  for (const join of projection?.joins.outcomes ?? []) {
    const betId = typeof join.betId === "string" ? join.betId : null;
    const outcomeId = join.outcomeId ?? join.id;
    if (!betId || !outcomeId) continue;
    const outcomes = chainByBet.get(betId) ?? [];
    if (!outcomes.includes(String(outcomeId))) outcomes.push(String(outcomeId));
    chainByBet.set(betId, outcomes);
  }

  const chained = new Set<string>();
  const chains = [...chainByBet.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const colStep = 480;
  let row = 0;
  for (const [betId, outcomeIds] of chains) {
    const betNode = byId.get(`bet:${betId}`);
    const outcomeNodes = outcomeIds
      .map((id) => byId.get(`outcome:${id}`))
      .filter((node): node is Node => Boolean(node))
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    if (!betNode && outcomeNodes.length === 0) continue;
    const y = row * (tallest + ROW_GUTTER);
    let col = 0;
    if (betNode) { out[betNode.id] = { x: 0, y }; chained.add(betNode.id); col += 1; }
    for (const node of outcomeNodes) {
      out[node.id] = { x: col * colStep, y };
      chained.add(node.id);
      col += 1;
    }
    row += 1;
  }

  const intent = nodes.find((node) => node.id === "atlas:intent");
  if (intent) { out[intent.id] = { x: -footprint(intent).width - colStep, y: 0 }; chained.add(intent.id); }

  // Everything not part of a chain recedes into a bottom row, grouped by territory for a stable read.
  const territoryRank = (id: string) => {
    const t = territory.get(id) ?? null;
    return t === "product" ? 0 : t === "gtm" ? 1 : 2;
  };
  const receding = nodes
    .filter((node) => !chained.has(node.id))
    .sort((a, b) => territoryRank(a.id) - territoryRank(b.id) || (a.id < b.id ? -1 : 1));
  const recedeStartY = row * (tallest + ROW_GUTTER) + BAND_GUTTER;
  let rx = 0;
  for (const node of receding) {
    out[node.id] = { x: rx, y: recedeStartY };
    rx += footprint(node).width + COL_GUTTER;
  }
  return out;
}
