/**
 * Deterministic layout for thread-scoped Harness Canvas artifacts.
 *
 * Layout is presentation, not project truth. The same artifact and available
 * field width always produce the same initial positions; local drag positions
 * can be layered on top by the view without changing this function.
 */

export type CrokiCanvasArtifactPresentation = "compare" | "journey" | "system" | "evidence";
export type CrokiCanvasArtifactRole =
  | "question"
  | "focal"
  | "route"
  | "evidence"
  | "action"
  | "warning";

export interface CrokiCanvasArtifactLayoutNode {
  readonly id: string;
  readonly role: CrokiCanvasArtifactRole;
}

export interface CrokiCanvasArtifactPosition {
  readonly x: number;
  readonly y: number;
}

export type CrokiCanvasArtifactPositions = Readonly<Record<string, CrokiCanvasArtifactPosition>>;

export interface CrokiCanvasArtifactLayoutInput {
  readonly nodes: readonly CrokiCanvasArtifactLayoutNode[];
  readonly edges: readonly { readonly from: string; readonly to: string }[];
  readonly fieldWidth: number;
  readonly presentation: CrokiCanvasArtifactPresentation;
}

const NODE_WIDTH = 280;
const FOCAL_WIDTH = 420;
const COLUMN_GAP = 48;
const ROW_GAP = 36;
const FIELD_INSET = 40;

/**
 * Return the layout bucket used by the view and by local position storage.
 * Keeping this pure makes responsive behavior straightforward to test.
 */
export function crokiCanvasArtifactLayoutBucket(fieldWidth: number): "wide" | "medium" | "narrow" {
  if (fieldWidth < 640) return "narrow";
  if (fieldWidth < 1040) return "medium";
  return "wide";
}

export function buildCrokiCanvasArtifactLayout(
  input: CrokiCanvasArtifactLayoutInput,
): CrokiCanvasArtifactPositions {
  const bucket = crokiCanvasArtifactLayoutBucket(input.fieldWidth);
  switch (input.presentation) {
    case "compare":
      return layoutCompare(input.nodes, bucket, input.fieldWidth);
    case "journey":
      return layoutJourney(input.nodes, bucket, input.fieldWidth);
    case "system":
      return layoutSystem(input.nodes, input.edges, bucket, input.fieldWidth);
    case "evidence":
      return layoutEvidence(input.nodes, bucket, input.fieldWidth);
  }
}

function layoutCompare(
  nodes: readonly CrokiCanvasArtifactLayoutNode[],
  bucket: "wide" | "medium" | "narrow",
  fieldWidth: number,
): CrokiCanvasArtifactPositions {
  const focal = nodes.find((node) => node.role === "question" || node.role === "focal");
  const columns = nodes.filter((node) => node.id !== focal?.id);
  const positions: Record<string, CrokiCanvasArtifactPosition> = {};
  if (focal) positions[focal.id] = centered(focalWidth(fieldWidth), 32, fieldWidth);

  if (bucket === "narrow") {
    let y = focal ? 210 : 44;
    for (const node of columns) {
      positions[node.id] = { x: 24, y };
      y += 180 + ROW_GAP;
    }
    return positions;
  }

  const columnWidth = bucket === "medium" ? 240 : NODE_WIDTH;
  const gap = bucket === "medium" ? 24 : COLUMN_GAP;
  const totalWidth = columns.length * columnWidth + Math.max(0, columns.length - 1) * gap;
  const startX = Math.max(FIELD_INSET, (fieldWidth - totalWidth) / 2);
  const y = focal ? 220 : 72;
  columns.forEach((node, index) => {
    positions[node.id] = { x: startX + index * (columnWidth + gap), y };
  });
  return positions;
}

function layoutJourney(
  nodes: readonly CrokiCanvasArtifactLayoutNode[],
  bucket: "wide" | "medium" | "narrow",
  fieldWidth: number,
): CrokiCanvasArtifactPositions {
  const ordered = [...nodes];
  const positions: Record<string, CrokiCanvasArtifactPosition> = {};
  if (bucket === "narrow") {
    ordered.forEach((node, index) => {
      positions[node.id] = { x: 28, y: 42 + index * 208 };
    });
    return positions;
  }
  if (bucket === "medium") {
    const columnWidth = 240;
    const rowWidth = Math.max(1, Math.floor((fieldWidth - 48) / (columnWidth + 24)));
    ordered.forEach((node, index) => {
      positions[node.id] = {
        x: 24 + (index % rowWidth) * (columnWidth + 24),
        y: 48 + Math.floor(index / rowWidth) * 208,
      };
    });
    return positions;
  }
  const totalWidth = ordered.length * NODE_WIDTH + Math.max(0, ordered.length - 1) * 32;
  const startX = Math.max(FIELD_INSET, (fieldWidth - totalWidth) / 2);
  ordered.forEach((node, index) => {
    positions[node.id] = { x: startX + index * (NODE_WIDTH + 32), y: 140 };
  });
  return positions;
}

function layoutSystem(
  nodes: readonly CrokiCanvasArtifactLayoutNode[],
  edges: readonly { readonly from: string; readonly to: string }[],
  bucket: "wide" | "medium" | "narrow",
  fieldWidth: number,
): CrokiCanvasArtifactPositions {
  const positions: Record<string, CrokiCanvasArtifactPosition> = {};
  const focal = nodes.find((node) => node.role === "question" || node.role === "focal");
  const remaining = nodes.filter((node) => node.id !== focal?.id);
  if (bucket === "narrow") {
    if (focal) positions[focal.id] = { x: 24, y: 36 };
    remaining.forEach((node, index) => {
      positions[node.id] = { x: 24, y: (focal ? 228 : 36) + index * 184 };
    });
    return positions;
  }

  // A lightweight rank pass gives directional relationships a readable flow
  // without attempting to solve an arbitrary graph layout at runtime.
  const rank = new Map<string, number>(nodes.map((node) => [node.id, 0]));
  for (let pass = 0; pass < nodes.length; pass += 1) {
    for (const edge of edges) {
      const fromRank = rank.get(edge.from) ?? 0;
      rank.set(edge.to, Math.max(rank.get(edge.to) ?? 0, fromRank + 1));
    }
  }
  const rows = new Map<number, CrokiCanvasArtifactLayoutNode[]>();
  for (const node of remaining) {
    const row = rank.get(node.id) ?? 0;
    const group = rows.get(row) ?? [];
    group.push(node);
    rows.set(row, group);
  }
  if (focal) positions[focal.id] = centered(focalWidth(fieldWidth), 32, fieldWidth);
  const columnWidth = bucket === "medium" ? 240 : NODE_WIDTH;
  for (const [row, group] of [...rows.entries()].sort(([a], [b]) => a - b)) {
    const gap = bucket === "medium" ? 24 : COLUMN_GAP;
    const totalWidth = group.length * columnWidth + Math.max(0, group.length - 1) * gap;
    const startX = Math.max(FIELD_INSET, (fieldWidth - totalWidth) / 2);
    group.forEach((node, index) => {
      positions[node.id] = { x: startX + index * (columnWidth + gap), y: 196 + row * 206 };
    });
  }
  return positions;
}

function layoutEvidence(
  nodes: readonly CrokiCanvasArtifactLayoutNode[],
  bucket: "wide" | "medium" | "narrow",
  fieldWidth: number,
): CrokiCanvasArtifactPositions {
  const focal = nodes.find((node) => node.role === "question" || node.role === "focal");
  const supporting = nodes.filter((node) => node.id !== focal?.id);
  const positions: Record<string, CrokiCanvasArtifactPosition> = {};
  if (bucket === "narrow") {
    if (focal) positions[focal.id] = { x: 24, y: 36 };
    supporting.forEach((node, index) => {
      positions[node.id] = { x: 24, y: (focal ? 250 : 36) + index * 184 };
    });
    return positions;
  }
  if (focal) positions[focal.id] = centered(focalWidth(fieldWidth), 172, fieldWidth);
  const gap = bucket === "medium" ? 24 : COLUMN_GAP;
  const width = bucket === "medium" ? 240 : NODE_WIDTH;
  const totalWidth = supporting.length * width + Math.max(0, supporting.length - 1) * gap;
  const startX = Math.max(FIELD_INSET, (fieldWidth - totalWidth) / 2);
  const y = focal ? 420 : 120;
  supporting.forEach((node, index) => {
    positions[node.id] = { x: startX + index * (width + gap), y };
  });
  return positions;
}

function focalWidth(fieldWidth: number): number {
  return Math.min(FOCAL_WIDTH, Math.max(260, fieldWidth - FIELD_INSET * 2));
}

function centered(width: number, y: number, fieldWidth: number): CrokiCanvasArtifactPosition {
  return { x: Math.max(FIELD_INSET, (fieldWidth - width) / 2), y };
}
