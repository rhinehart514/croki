import type { StableRef } from "@/openCanvasTypes";
import type { CanvasRegionCreateRequest } from "@/lib/canvasNativeActions";

export type GroupableCanvasNode = {
  id: string;
  type?: string;
  position: { x: number; y: number };
  measured?: { width?: number; height?: number };
  width?: number;
  height?: number;
  data?: unknown;
};

function memberRef(node: GroupableCanvasNode): StableRef | null {
  const data = node.data as { ref?: { type?: unknown; id?: unknown } } | null | undefined;
  const type = typeof data?.ref?.type === "string" ? data.ref.type.trim().toLowerCase() : "";
  const id = typeof data?.ref?.id === "string" ? data.ref.id.trim() : "";
  if (!id || !["goal", "work-artifact", "work-region"].includes(type)) return null;
  return { type, id };
}

export function isGroupableCanvasNode(node: GroupableCanvasNode): boolean { return memberRef(node) !== null; }

/** Build a founder-placed region around real selected anchors. It owns only stable references. */
export function regionRequestForSelection(
  selected: GroupableCanvasNode[],
  title: string,
): CanvasRegionCreateRequest | null {
  const unique = new Map<string, { node: GroupableCanvasNode; ref: StableRef }>();
  for (const node of selected) {
    const ref = memberRef(node);
    if (ref) unique.set(`${ref.type}:${ref.id}`, { node, ref });
  }
  const members = [...unique.values()];
  if (members.length < 2) return null;
  const bounds = members.map(({ node }) => {
    const data = node.data as { size?: { width?: number; height?: number } } | null | undefined;
    const width = node.measured?.width ?? node.width ?? data?.size?.width ?? 240;
    const height = node.measured?.height ?? node.height ?? data?.size?.height ?? 112;
    return { left: node.position.x, top: node.position.y, right: node.position.x + width, bottom: node.position.y + height };
  });
  const left = Math.min(...bounds.map((item) => item.left));
  const top = Math.min(...bounds.map((item) => item.top));
  const right = Math.max(...bounds.map((item) => item.right));
  const bottom = Math.max(...bounds.map((item) => item.bottom));
  return {
    title: title.trim(),
    memberRefs: members.map(({ ref }) => ref).sort((a, b) => `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`)),
    position: { x: left - 48, y: top - 60 },
    size: { width: Math.max(320, right - left + 96), height: Math.max(220, bottom - top + 100) },
  };
}
