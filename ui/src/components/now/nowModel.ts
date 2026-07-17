// The Now stream model — pure, presentation-free, testable. Folds the durable return-brief records and
// the live active drives into one ordered account with the founder-legible hierarchy the redesign asks
// for: what needs you, then what is moving, then what the market said, then what changed. No React, no
// tokens, no copy about machinery — a drive is "work in progress", a wall item is "needs you". The shell
// renders these rows; it does not re-derive priority.
import type { FirmActiveDrive } from "@/api";
import type { FirmBet } from "@/types";
import type { ReturnBriefRecord, ReturnBriefTarget } from "@/components/firm/returnBriefProjection";

export type NowRowState = "needs-you" | "working" | "from-market" | "changed";

export type NowRowTarget =
  | ReturnBriefTarget
  | { kind: "drive"; driveId: string; betId: string | null };

export type NowRow = {
  id: string;
  source: "record" | "drive";
  title: string;
  detail: string | null;
  attribution: string | null;
  stateLabel: string;
  state: NowRowState;
  needsYou: boolean;
  occurredAt: string | null;
  startedAt: string | null;
  actionLabel: string;
  provenance: string | null;
  target: NowRowTarget;
};

export type NowSectionKey = "needs-you" | "moving" | "market" | "changed";

export type NowSection = {
  key: NowSectionKey;
  label: string;
  tone: NowRowState;
  rows: NowRow[];
};

const SECTION_ORDER: Array<{ key: NowSectionKey; label: string; tone: NowRowState }> = [
  { key: "needs-you", label: "Needs you", tone: "needs-you" },
  { key: "moving", label: "Moving", tone: "working" },
  { key: "market", label: "From the market", tone: "from-market" },
  { key: "changed", label: "What changed", tone: "changed" },
];

function recordSection(record: ReturnBriefRecord): NowSectionKey {
  if (record.group === "needs-you" || record.group === "held-safely") return "needs-you";
  if (record.group === "market-spoke") return "market";
  return "changed"; // kept-moving + architecture-shift
}

function recordStateLabel(section: NowSectionKey): { label: string; state: NowRowState } {
  switch (section) {
    case "needs-you": return { label: "Needs you", state: "needs-you" };
    case "market": return { label: "From the market", state: "from-market" };
    default: return { label: "Changed", state: "changed" };
  }
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// A moving row shows honest forming work, never an anonymous spinner: the newest real step, or the count
// of drafts already inspectable, or a plain fallback — all derived from the bet's own durable record.
function driveDetail(drive: FirmActiveDrive, bet: FirmBet | null): string {
  if (drive.abortRequestedAt) return "Stopping…";
  const staged = bet?.stagedCount ?? 0;
  if (staged > 0) return `${staged} ${staged === 1 ? "draft" : "drafts"} ready to inspect`;
  const latestStep = bet?.events?.length ? text(bet.events[bet.events.length - 1]?.detail) : null;
  return latestStep ?? "Working on it now.";
}

function driveRow(drive: FirmActiveDrive, bet: FirmBet | null): NowRow {
  return {
    id: `drive:${drive.id}`,
    source: "drive",
    title: bet?.intent ?? "Work in progress",
    detail: driveDetail(drive, bet),
    attribution: null,
    stateLabel: drive.abortRequestedAt ? "Stopping" : "Working",
    state: "working",
    needsYou: false,
    occurredAt: drive.startedAt,
    startedAt: drive.startedAt,
    actionLabel: "Open",
    provenance: null,
    target: { kind: "drive", driveId: drive.id, betId: drive.betId },
  };
}

function fromRecord(record: ReturnBriefRecord): NowRow {
  const section = recordSection(record);
  const { label, state } = recordStateLabel(section);
  return {
    id: record.id,
    source: "record",
    title: record.truth,
    detail: record.whyNow ?? null,
    attribution: record.attribution ?? null,
    stateLabel: label,
    state,
    needsYou: section === "needs-you",
    occurredAt: record.occurredAt ?? null,
    startedAt: null,
    actionLabel: record.actionLabel,
    provenance: record.provenance ?? null,
    target: record.target,
  };
}

/**
 * Fold the durable records + live drives into ordered sections. Drives already represented by a
 * needs-you record for the same bet are not double-counted: a bet at the wall is a decision, not
 * "moving". Empty sections are dropped so the stream stays quiet when nothing is happening.
 */
export function buildNowSections(input: {
  records: ReturnBriefRecord[];
  activeDrives: FirmActiveDrive[];
  bets: FirmBet[];
}): NowSection[] {
  const { records, activeDrives, bets } = input;
  const betById = new Map(bets.map((bet) => [bet.id, bet]));
  const wallBetIds = new Set(
    records.filter((record) => record.group === "needs-you" && record.target.kind === "bet")
      .map((record) => (record.target as { kind: "bet"; betId: string }).betId),
  );

  const rowsBySection = new Map<NowSectionKey, NowRow[]>();
  const push = (key: NowSectionKey, row: NowRow) => {
    const existing = rowsBySection.get(key);
    if (existing) existing.push(row);
    else rowsBySection.set(key, [row]);
  };

  for (const record of records) push(recordSection(record), fromRecord(record));

  for (const drive of activeDrives) {
    if (drive.betId && wallBetIds.has(drive.betId)) continue;
    push("moving", driveRow(drive, drive.betId ? betById.get(drive.betId) ?? null : null));
  }

  return SECTION_ORDER
    .map(({ key, label, tone }) => ({ key, label, tone, rows: rowsBySection.get(key) ?? [] }))
    .filter((section) => section.rows.length > 0);
}

/** Total count of rows that require the founder — drives the rail badge and the tab title. */
export function needsYouCount(sections: NowSection[]): number {
  return sections.find((section) => section.key === "needs-you")?.rows.length ?? 0;
}
