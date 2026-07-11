import type { JsonValue } from "@/openCanvasTypes";

export type StructuredArtifactRecord = { [key: string]: JsonValue };
export type StructuredArtifactKind = "comparison" | "journey";

const COLLECTION_KEYS: Record<StructuredArtifactKind, string[]> = {
  comparison: ["alternatives", "options", "comparisons", "items", "rows"],
  journey: ["steps", "events", "milestones", "stages", "journey", "timeline"],
};

function isRecord(value: JsonValue): value is StructuredArtifactRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function structuredArtifactCollection(content: JsonValue, contentType: string): {
  kind: StructuredArtifactKind;
  key: string | null;
  rows: StructuredArtifactRecord[];
} | null {
  const normalized = contentType.toLowerCase();
  const kind: StructuredArtifactKind | null = /(?:comparison|compare|alternatives)/.test(normalized)
    ? "comparison"
    : /(?:journey|timeline|milestones?)/.test(normalized) ? "journey" : null;
  if (!kind) return null;
  if (Array.isArray(content) && content.every(isRecord)) return { kind, key: null, rows: content };
  if (!isRecord(content)) return null;
  const key = COLLECTION_KEYS[kind].find((candidate) => Array.isArray(content[candidate]));
  if (!key) return null;
  const rows = content[key];
  return Array.isArray(rows) && rows.every(isRecord) ? { kind, key, rows } : null;
}

export function supportsStructuredArtifactEditing(content: JsonValue, contentType: string): boolean {
  return structuredArtifactCollection(content, contentType) !== null;
}
