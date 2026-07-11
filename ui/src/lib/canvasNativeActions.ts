import type { JsonValue, StableRef } from "@/openCanvasTypes";

export type CanvasCreateKind = "goal" | "work";

export type CanvasCreateRequest = {
  kind: CanvasCreateKind;
  title: string;
  position: { x: number; y: number };
  workKind?: string;
  contentType?: string;
  content?: JsonValue;
};

export type CanvasRelationshipRequest = {
  sourceRef: StableRef;
  targetRef: StableRef;
  kind: "related-to";
};

export type CanvasRegionCreateRequest = {
  title: string;
  memberRefs: StableRef[];
  position: { x: number; y: number };
  size: { width: number; height: number };
};

export function canvasAnchorRef(value: unknown): StableRef | null {
  const data = value as { ref?: { type?: unknown; id?: unknown } } | null | undefined;
  const type = data?.ref?.type;
  const id = data?.ref?.id;
  if (typeof type !== "string" || !type.trim() || typeof id !== "string" || !id.trim()) return null;
  return { type, id };
}

export function canvasPasteRequest(text: string, position: { x: number; y: number }): CanvasCreateRequest | null {
  const content = text.trim();
  if (!content) return null;
  try {
    const url = new URL(content);
    if (["http:", "https:"].includes(url.protocol)) return {
      kind: "work",
      workKind: "reference",
      title: url.hostname.replace(/^www\./, "") + (url.pathname === "/" ? "" : url.pathname),
      contentType: "text/uri-list",
      content,
      position,
    };
  } catch { /* ordinary pasted text */ }
  const firstLine = content.split(/\r?\n/, 1)[0].slice(0, 120);
  return {
    kind: "work",
    workKind: "note",
    title: firstLine || "Pasted work",
    contentType: "text/plain",
    content,
    position,
  };
}

export function canvasRelationship(
  sourceData: unknown,
  targetData: unknown,
): CanvasRelationshipRequest | null {
  const sourceRef = canvasAnchorRef(sourceData);
  const targetRef = canvasAnchorRef(targetData);
  if (!sourceRef || !targetRef) return null;
  if (sourceRef.type === targetRef.type && sourceRef.id === targetRef.id) return null;
  return { sourceRef, targetRef, kind: "related-to" };
}
