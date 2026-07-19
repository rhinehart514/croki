import type { WorkIndex, WorkIndexItem } from "@/api";
import type { FirmLens } from "@/types";
import type { Direction, DirectionSection, DirectionState } from "@/components/now/directionModel";

function betIds(item: WorkIndexItem) {
  return item.subjectRefs
    .filter((ref) => ref.startsWith("bet:"))
    .map((ref) => ref.slice("bet:".length));
}

function stateFor(item: WorkIndexItem): DirectionState {
  if (item.attention !== "none") return "needs-you";
  if (item.activity !== "idle") return "working";
  if (item.terminal != null) return "returned";
  return "open";
}

function plainStatus(item: WorkIndexItem) {
  if (item.latestMeaningfulEvent.summary) return item.latestMeaningfulEvent.summary;
  if (item.attention === "decision") return "A decision is waiting for you.";
  if (item.attention === "failure") return "This work needs recovery.";
  if (item.activity === "stopping") return "Stopping safely.";
  if (item.activity === "queued") return "Queued to begin.";
  if (item.activity === "running") return "Work is taking shape now.";
  if (item.terminal === "completed") return "Work returned for review.";
  if (item.terminal === "cancelled") return "Stopped by the founder.";
  if (item.terminal === "paused") return "Paused with its place kept.";
  if (item.terminal === "budget-exhausted") return "Paused at the spend limit.";
  if (item.lifecycle === "closed") return "Closed.";
  return "Ready to continue.";
}

export function directionsFromWorkIndex(workIndex: WorkIndex, lens: FirmLens | null): Direction[] {
  return workIndex.items.map((item) => {
    const ids = betIds(item);
    const bets = ids.map((id) => lens?.bets.find((bet) => bet.id === id)).filter(Boolean);
    return {
      id: item.threadRef,
      sentence: item.founderIntent,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      betIds: ids,
      primaryBetId: ids.at(-1) ?? null,
      waitingWallItemIds: item.latestMeaningfulEvent.kind === "decision"
        ? [item.latestMeaningfulEvent.ref.replace(/^decision:/, "")]
        : [],
      activeDriveIds: item.activity === "idle" ? [] : item.runRefs.slice(-1).map((ref) => ref.replace(/^run:/, "")),
      outcomeIds: [],
      proofCount: bets.reduce((sum, bet) => sum + Number(bet?.stagedCount ?? bet?.staged?.length ?? 0), 0),
      approaches: ids.length,
      state: stateFor(item),
      needsYou: item.attention !== "none",
      understanding: plainStatus(item),
      attribution: null,
    };
  });
}

export function sectionsFromWorkIndex(directions: Direction[], workIndex: WorkIndex): DirectionSection[] {
  const byId = new Map(directions.map((direction) => [direction.id, direction]));
  const groups = [
    {
      key: "needs-you" as const,
      label: "Needs you",
      tone: "needs-you" as const,
      accepts: (item: WorkIndexItem) => item.attention !== "none",
    },
    {
      key: "working" as const,
      label: "In progress",
      tone: "working" as const,
      accepts: (item: WorkIndexItem) => item.attention === "none" && item.activity !== "idle",
    },
    {
      key: "returned" as const,
      label: "Returned",
      tone: "returned" as const,
      accepts: (item: WorkIndexItem) => item.attention === "none" && item.activity === "idle" && item.terminal != null,
    },
    {
      key: "open" as const,
      label: "Open",
      tone: "open" as const,
      accepts: (item: WorkIndexItem) => item.attention === "none" && item.activity === "idle" && item.terminal == null,
    },
  ];
  return groups
    .map((group) => ({
      key: group.key,
      label: group.label,
      tone: group.tone,
      directions: workIndex.items.filter(group.accepts).map((item) => byId.get(item.threadRef)).filter((item): item is Direction => Boolean(item)),
    }))
    .filter((section) => section.directions.length > 0);
}
