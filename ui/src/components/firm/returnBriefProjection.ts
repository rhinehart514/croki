export const RETURN_BRIEF_GROUPS = [
  "needs-you",
  "market-spoke",
  "architecture-shift",
  "kept-moving",
  "held-safely",
] as const;

export type ReturnBriefGroup = (typeof RETURN_BRIEF_GROUPS)[number];

export type ReturnBriefTarget =
  | { kind: "bet"; betId: string }
  | { kind: "wall" }
  | { kind: "receipt"; receiptId: string }
  | { kind: "teammate"; teammateRef: string }
  | { kind: "architecture"; architectureId: string; architectureRevision: number };

export type ReturnBriefRecord = {
  id: string;
  group: ReturnBriefGroup;
  /** Records that remain in the briefing until their underlying firm state is resolved. */
  persistent?: boolean;
  priority?: number;
  truth: string;
  whyNow?: string | null;
  attribution?: string | null;
  occurredAt?: string | null;
  provenance?: string | null;
  actionLabel: string;
  target: ReturnBriefTarget;
};

export type ReturnBriefProjection = {
  heading: string;
  records: ReturnBriefRecord[];
  reviewableCount: number;
  omittedCount: number;
  omission: string;
};

export function projectReturnBrief(
  records: ReturnBriefRecord[],
  { heading = "Return to the firm", limitPerGroup = 1 }: { heading?: string; limitPerGroup?: number } = {},
): ReturnBriefProjection {
  const visible: ReturnBriefRecord[] = [];
  let omittedCount = 0;

  for (const group of RETURN_BRIEF_GROUPS) {
    const grouped = records
      .filter((record) => record.group === group)
      .sort((left, right) => (
        (right.priority ?? 0) - (left.priority ?? 0)
        || (right.occurredAt ?? "").localeCompare(left.occurredAt ?? "")
      ));
    const persistent = grouped.filter((record) => record.persistent);
    const recent = grouped.filter((record) => !record.persistent).slice(0, limitPerGroup);
    const selectedIds = new Set([...persistent, ...recent].map((record) => record.id));
    visible.push(...grouped.filter((record) => selectedIds.has(record.id)));
    omittedCount += Math.max(0, grouped.length - persistent.length - recent.length);
  }

  return {
    heading,
    records: visible,
    reviewableCount: records.filter((record) => !record.persistent).length,
    omittedCount,
    omission: omittedCount
      ? `${omittedCount} more durable ${omittedCount === 1 ? "record is" : "records are"} available in the wider firm.`
      : "This account prioritizes consequential records; routine work remains available in the wider firm.",
  };
}
