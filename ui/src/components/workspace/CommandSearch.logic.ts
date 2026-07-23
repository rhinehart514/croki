// Ranking and filtering ported from T3 Code's CommandPalette.logic.ts.
// Portions Copyright (c) 2026 T3 Tools Inc. Licensed under MIT (github.com/pingdotgg/t3code).
import type { SystemIndexObject, WorkIndexItem } from "@/api";

export type SearchRow = {
  id: string;
  title: string;
  detail: string | null;
  shortcut: string | null;
  searchTerms: string[];
};

export type SearchGroup = {
  id: string;
  label: string;
  /** Rows shown before the founder types anything. 0 keeps the group query-only. */
  atRestLimit: number;
  rows: SearchRow[];
};

export function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function rankSearchFieldMatch(field: string, normalizedQuery: string): number {
  const normalizedField = normalizeSearchText(field);
  if (normalizedField.length === 0 || !normalizedField.includes(normalizedQuery)) {
    return Number.NEGATIVE_INFINITY;
  }
  if (normalizedField === normalizedQuery) return 3;
  if (normalizedField.startsWith(normalizedQuery)) return 2;
  return 1;
}

export function rankRowMatch(row: SearchRow, normalizedQuery: string): number {
  const terms = row.searchTerms.filter((term) => term.length > 0);
  for (const [index, field] of terms.entries()) {
    const fieldRank = rankSearchFieldMatch(field, normalizedQuery);
    if (fieldRank !== Number.NEGATIVE_INFINITY) {
      return 1_000 - index * 100 + fieldRank;
    }
  }
  // A match may still span fields (for example a word from the title and one from the detail).
  return normalizeSearchText(terms.join(" ")).includes(normalizedQuery)
    ? 0
    : Number.NEGATIVE_INFINITY;
}

export function filterSearchGroups(groups: SearchGroup[], query: string): SearchGroup[] {
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery.length === 0) {
    return groups
      .map((group) => ({ ...group, rows: group.rows.slice(0, group.atRestLimit) }))
      .filter((group) => group.rows.length > 0);
  }
  return groups
    .map((group) => ({
      ...group,
      rows: group.rows
        .map((row, index) => ({ row, index, rank: rankRowMatch(row, normalizedQuery) }))
        .filter((entry) => entry.rank !== Number.NEGATIVE_INFINITY)
        .sort((left, right) => right.rank - left.rank || left.index - right.index)
        .map((entry) => entry.row),
    }))
    .filter((group) => group.rows.length > 0);
}

export function flattenSearchRows(groups: SearchGroup[]): SearchRow[] {
  return groups.flatMap((group) => group.rows);
}

export function moveHighlight(total: number, current: number, delta: number): number {
  if (total <= 0) return -1;
  const base = current < 0 ? (delta > 0 ? -1 : 0) : current;
  return (((base + delta) % total) + total) % total;
}

export function threadStateLabel(item: WorkIndexItem): string | null {
  if (item.attention === "decision") return "Waiting on you";
  if (item.attention === "failure") return "Failed or interrupted";
  if (item.activity !== "idle") return "Active";
  if (item.unread) return "Unread result";
  return null;
}

export function threadSearchRow(item: WorkIndexItem): SearchRow {
  return {
    id: item.threadRef,
    title: item.founderIntent,
    detail: threadStateLabel(item),
    shortcut: null,
    searchTerms: [item.founderIntent, item.latestMeaningfulEvent?.summary ?? ""],
  };
}

export function objectSearchRow(object: SystemIndexObject): SearchRow {
  return {
    id: object.objectRef,
    title: object.name,
    detail: object.territory === "gtm" ? "Go-to-market" : "Product",
    shortcut: null,
    searchTerms: [object.name, object.statement, object.type],
  };
}

export function sortThreadsForSearch(items: WorkIndexItem[]): WorkIndexItem[] {
  return [...items].sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")));
}
