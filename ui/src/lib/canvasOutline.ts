import type { WovenCanvas, WovenCanvasAnchor, WovenRef } from "@/types";

export type CanvasOutlineRow = {
  anchor: WovenCanvasAnchor;
  incoming: number;
  outgoing: number;
  regionTitles: string[];
};

export const canvasOutlineRefKey = (ref: WovenRef) => `${ref.type ?? ""}:${ref.id}`;

function founderPriority(anchor: WovenCanvasAnchor): number {
  if (anchor.ref.type === "goal" || anchor.kind === "goal") return 0;
  if (anchor.ref.type === "work-artifact" || anchor.ref.type === "product-change") return 1;
  if (anchor.ref.type === "pipeline" || anchor.kind === "gate") return 2;
  if (anchor.ref.type === "outcome" || anchor.kind === "outcome") return 3;
  if (anchor.kind === "question" || anchor.kind.startsWith("terrain-")) return 4;
  return 5;
}

export function buildCanvasOutline(canvas: WovenCanvas | null | undefined): CanvasOutlineRow[] {
  if (!canvas) return [];
  const counts = new Map<string, { incoming: number; outgoing: number }>();
  for (const relationship of canvas.relationships ?? []) {
    const source = canvasOutlineRefKey(relationship.source);
    const target = canvasOutlineRefKey(relationship.target);
    counts.set(source, { incoming: counts.get(source)?.incoming ?? 0, outgoing: (counts.get(source)?.outgoing ?? 0) + 1 });
    counts.set(target, { incoming: (counts.get(target)?.incoming ?? 0) + 1, outgoing: counts.get(target)?.outgoing ?? 0 });
  }
  const regionsByMember = new Map<string, string[]>();
  for (const region of canvas.regions ?? []) {
    if (region.archivedAt) continue;
    for (const member of region.memberRefs) {
      const key = canvasOutlineRefKey(member);
      regionsByMember.set(key, [...(regionsByMember.get(key) ?? []), region.title]);
    }
  }
  return canvas.anchors
    .map((anchor) => {
      const count = counts.get(canvasOutlineRefKey(anchor.ref));
      return {
        anchor,
        incoming: count?.incoming ?? 0,
        outgoing: count?.outgoing ?? 0,
        regionTitles: (regionsByMember.get(canvasOutlineRefKey(anchor.ref)) ?? []).sort((a, b) => a.localeCompare(b)),
      };
    })
    .sort((a, b) => {
      const aRegion = a.regionTitles[0] ?? "";
      const bRegion = b.regionTitles[0] ?? "";
      return founderPriority(a.anchor) - founderPriority(b.anchor)
        || aRegion.localeCompare(bRegion)
        || a.anchor.kind.localeCompare(b.anchor.kind)
        || a.anchor.label.localeCompare(b.anchor.label);
    });
}
