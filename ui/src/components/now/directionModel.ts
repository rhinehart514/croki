// The direction model — the founder-facing unit of work. One founder sentence becomes one continuing
// direction, even though it may spawn research, product changes, several parallel attempts, outcomes,
// and decisions underneath. There is no durable "direction id" in the brain, so a direction is
// reconstructed from data the UI already holds: the founder conversation message is the spine, the
// handoff message's changes.*BetIds is the manifest of what it opened, and fork lineage closes in the
// parallel attempts. Pure and presentation-free; the shell renders these, it does not re-derive them.
import type { FirmActiveDrive, WallQueueItemView } from "@/api";
import type { FirmBet, FirmConversationMessage, FirmLens, FirmOutcome } from "@/types";

export type DirectionState = "needs-you" | "from-market" | "working" | "changed";

export type Direction = {
  id: string;
  sentence: string;
  createdAt: string | null;
  updatedAt: string | null;
  betIds: string[];
  primaryBetId: string | null;
  waitingWallItemIds: string[];
  activeDriveIds: string[];
  outcomeIds: string[];
  proofCount: number;
  approaches: number;
  state: DirectionState;
  needsYou: boolean;
  understanding: string;
  attribution: string | null;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function betUpdatedAt(bet: FirmBet): string {
  const events = (bet.events ?? []).map((event) => event.at);
  return [bet.updatedAt, ...events].filter(Boolean).sort().at(-1) ?? bet.updatedAt;
}

function forkRoot(betId: string, byId: Map<string, FirmBet>): string {
  let id = betId;
  const seen = new Set<string>();
  let current = byId.get(id);
  while (current?.forkedFrom && byId.has(current.forkedFrom) && !seen.has(current.forkedFrom)) {
    seen.add(id);
    id = current.forkedFrom;
    current = byId.get(id);
  }
  return id;
}

function wallTruth(item: WallQueueItemView): string {
  const effect = item.effect;
  if (item.purpose === "release") {
    const to = text(effect.to) ?? text(effect.destination) ?? text(effect.channel);
    return to ? `An outward act to ${to} is waiting for your release.` : "An outward act is waiting for your release.";
  }
  if (item.purpose === "answer") return text(effect.question) ?? "A judgment is waiting on you.";
  if (item.purpose === "end-bet") return text(effect.reason) ?? "A decision to end this work is waiting on you.";
  return "A decision is waiting on you.";
}

// Autonomy is felt through work becoming more concrete — never through raw agent/tool text, step
// counts, or bet ids. The understanding line names what is forming or has returned, by the kind of proof.
function isCodeChange(content: unknown): boolean {
  return typeof content === "string" && (content.includes("@@ ") || content.includes("diff --git"));
}

function formingLine(codeChanges: number, drafts: number, hasDrive: boolean): string {
  if (codeChanges > 0 && drafts > 0) return "A product change and market drafts are ready to review.";
  if (codeChanges > 0) return codeChanges > 1 ? "Product changes are ready to review." : "A product change is ready to review.";
  if (drafts > 0) return drafts > 1 ? `${drafts > 2 ? "Several" : "Two"} versions are ready to compare.` : "A working draft is ready to review.";
  return hasDrive ? "Work is taking shape now." : "Continued from an earlier approach.";
}

function understandingFor(
  state: DirectionState,
  bets: FirmBet[],
  wallItems: WallQueueItemView[],
  outcomes: FirmOutcome[],
  hasDrive: boolean,
): string {
  if (state === "needs-you" && wallItems.length) return wallTruth(wallItems[0]);
  if (state === "from-market" && outcomes.length) {
    return text(outcomes.at(-1)?.body) ?? `A ${outcomes.at(-1)?.outcomeKind ?? "market"} return came back.`;
  }
  const staged = bets.flatMap((bet) => bet.staged ?? []);
  const codeChanges = staged.filter((entry) => isCodeChange(entry.content)).length;
  return formingLine(codeChanges, staged.length - codeChanges, hasDrive);
}

/**
 * Fold the venture's bets, drives, outcomes, wall items and conversation into founder directions.
 * Each bet lands in exactly one direction (earliest claimant wins), fork families stay together, and
 * conversation-less bets fall back to a synthetic single-family direction titled by their intent.
 */
export function buildDirections(input: {
  lens: FirmLens;
  messages: FirmConversationMessage[];
  activeDrives: FirmActiveDrive[];
}, cursor: string | null = null): Direction[] {
  const { lens, messages, activeDrives } = input;
  const bets = lens.bets;
  const byId = new Map(bets.map((bet) => [bet.id, bet]));

  // Fork families keyed by their root, so parallel attempts stay one direction.
  const familyByRoot = new Map<string, string[]>();
  for (const bet of bets) {
    const root = forkRoot(bet.id, byId);
    const family = familyByRoot.get(root);
    if (family) family.push(bet.id);
    else familyByRoot.set(root, [bet.id]);
  }
  const familyOf = (betId: string) => familyByRoot.get(forkRoot(betId, byId)) ?? [betId];

  // Walk the conversation: a founder message opens a direction; the messages after it (until the next
  // founder message) contribute the bets its handoffs opened.
  const ordered = [...messages].sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
  type Spine = { id: string; sentence: string; createdAt: string | null; raw: Set<string> };
  const spines: Spine[] = [];
  let current: Spine | null = null;
  for (const message of ordered) {
    if (message.role === "founder") {
      current = { id: message.id, sentence: message.content, createdAt: message.createdAt, raw: new Set() };
      if (message.betId) current.raw.add(message.betId);
      spines.push(current);
    } else if (current) {
      if (message.betId) current.raw.add(message.betId);
      for (const id of [
        ...(message.changes?.openedBetIds ?? []),
        ...(message.changes?.stagedBetIds ?? []),
        ...(message.changes?.wallBetIds ?? []),
      ]) current.raw.add(id);
    }
  }

  // Assign each bet to the earliest direction that claims it (directly or by fork family).
  const claimed = new Set<string>();
  const directions: Direction[] = [];
  for (const spine of spines) {
    const betIds = new Set<string>();
    for (const seed of spine.raw) {
      if (!byId.has(seed)) continue;
      for (const member of familyOf(seed)) if (!claimed.has(member)) betIds.add(member);
    }
    if (betIds.size === 0) continue;
    for (const id of betIds) claimed.add(id);
    directions.push(materialize(spine.id, spine.sentence, spine.createdAt, [...betIds], lens, activeDrives, byId, cursor));
  }

  // Orphan fork families with no conversation link → one synthetic direction each, titled by intent.
  const orphanRoots = new Map<string, string[]>();
  for (const bet of bets) {
    if (claimed.has(bet.id)) continue;
    const root = forkRoot(bet.id, byId);
    const family = orphanRoots.get(root) ?? [];
    family.push(bet.id);
    orphanRoots.set(root, family);
  }
  for (const [root, members] of orphanRoots) {
    for (const id of members) claimed.add(id);
    const rootBet = byId.get(root);
    directions.push(materialize(`bet:${root}`, rootBet?.intent ?? "Work in progress", rootBet?.createdAt ?? null, members, lens, activeDrives, byId, cursor));
  }

  // Standalone market returns not joined to any bet are still returned reality.
  for (const outcome of lens.outcomes ?? []) {
    if (outcome.betId && byId.has(outcome.betId)) continue;
    directions.push({
      id: `outcome:${outcome.id}`,
      sentence: text(outcome.body) ?? `A ${outcome.outcomeKind ?? "market"} return`,
      createdAt: outcome.observedAt, updatedAt: outcome.observedAt,
      betIds: [], primaryBetId: null, waitingWallItemIds: [], activeDriveIds: [], outcomeIds: [outcome.id],
      proofCount: 0, approaches: 0, state: "from-market", needsYou: false,
      understanding: text(outcome.body) ?? "The market answered.",
      attribution: [outcome.from, outcome.channel].filter(Boolean).join(" · ") || null,
    });
  }

  return directions;
}

function materialize(
  id: string, sentence: string, createdAt: string | null, betIds: string[],
  lens: FirmLens, activeDrives: FirmActiveDrive[], byId: Map<string, FirmBet>, cursor: string | null,
): Direction {
  const memberBets = betIds.map((betId) => byId.get(betId)).filter((bet): bet is FirmBet => Boolean(bet));
  const betSet = new Set(betIds);
  const waiting = (lens.wallItems ?? []).filter((item) => item.decision === null && item.betId && betSet.has(item.betId));
  const drives = activeDrives.filter((drive) => drive.betId && betSet.has(drive.betId));
  const outcomes = (lens.outcomes ?? []).filter((outcome) => outcome.betId && betSet.has(outcome.betId));
  const proofCount = memberBets.reduce((sum, bet) => sum + (bet.stagedCount ?? bet.staged?.length ?? 0), 0);

  // A fresh (unreviewed) market return promotes the whole direction to "the market answered" even while
  // work continues, so a reply is never buried under an active drive. Once reviewed (cursor advances)
  // it falls back to working/changed. One row, placed by salience — not duplicated.
  const freshReturn = outcomes.some((outcome) => outcome.observedAt && (!cursor || Date.parse(outcome.observedAt) > Date.parse(cursor)));
  const needsYou = waiting.length > 0;
  const state: DirectionState = needsYou
    ? "needs-you"
    : freshReturn
      ? "from-market"
      : drives.length
        ? "working"
        : outcomes.length
          ? "from-market"
          : "changed";

  const primaryBet = [...memberBets].sort((a, b) => betUpdatedAt(a).localeCompare(betUpdatedAt(b))).at(-1) ?? null;
  const updatedAt = [
    ...memberBets.map(betUpdatedAt),
    ...outcomes.map((outcome) => outcome.observedAt),
    ...(waiting as WallQueueItemView[]).map((item) => item.parkedAt),
    createdAt,
  ].filter((value): value is string => Boolean(value)).sort().at(-1) ?? createdAt;

  return {
    id, sentence, createdAt, updatedAt,
    betIds, primaryBetId: primaryBet?.id ?? null,
    waitingWallItemIds: waiting.map((item) => item.id),
    activeDriveIds: drives.map((drive) => drive.id),
    outcomeIds: outcomes.map((outcome) => outcome.id),
    proofCount, approaches: betIds.length,
    state, needsYou,
    understanding: understandingFor(state, memberBets, waiting, outcomes, drives.length > 0),
    attribution: null,
  };
}

export type DirectionSectionKey = "needs-you" | "market" | "working" | "changed";
export type DirectionSection = { key: DirectionSectionKey; label: string; tone: DirectionState; directions: Direction[] };

const SECTION_ORDER: Array<{ key: DirectionSectionKey; label: string; tone: DirectionState; state: DirectionState }> = [
  { key: "needs-you", label: "Needs you", tone: "needs-you", state: "needs-you" },
  { key: "market", label: "The market answered", tone: "from-market", state: "from-market" },
  { key: "working", label: "Working now", tone: "working", state: "working" },
  { key: "changed", label: "Recently changed", tone: "changed", state: "changed" },
];

function afterCursor(timestamp: string | null, cursor: string | null): boolean {
  if (!timestamp) return false;
  return !cursor || Date.parse(timestamp) > Date.parse(cursor);
}

/**
 * Order directions into the founder hierarchy: what needs you, what the market returned, what is
 * moving, what recently changed. Needs-you / market / working always show; the long tail of "changed"
 * is gated by the return cursor so Now stays an index of living work, not an archive.
 */
export function buildDirectionSections(directions: Direction[], cursor: string | null): DirectionSection[] {
  return SECTION_ORDER
    .map(({ key, label, tone, state }) => ({
      key, label, tone,
      directions: directions
        .filter((direction) => direction.state === state)
        .filter((direction) => state !== "changed" || afterCursor(direction.updatedAt, cursor))
        .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")),
    }))
    .filter((section) => section.directions.length > 0);
}

export function directionsNeedingYou(sections: DirectionSection[]): number {
  return sections.find((section) => section.key === "needs-you")?.directions.length ?? 0;
}
