import type { FirmArchitectureProjection, FirmConversationMessage, FirmLens } from "@/types";
import {
  projectReturnBrief,
  type ReturnBriefProjection,
  type ReturnBriefRecord,
} from "@/components/firm/returnBriefProjection";
import { configuredParticipantName } from "@/components/firm/teammateDisplay";

function afterCursor(timestamp: string | null | undefined, cursor: string | null) {
  if (!timestamp) return false;
  return !cursor || Date.parse(timestamp) > Date.parse(cursor);
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function wallTruth(purpose: string, effect: Record<string, unknown>) {
  if (purpose === "release") {
    const destination = text(effect.to) ?? text(effect.destination) ?? text(effect.channel);
    return destination ? `An outward act to ${destination} is waiting for your review.` : "An outward act is waiting for your review.";
  }
  if (purpose === "answer") return text(effect.question) ?? "An agent needs your judgment.";
  if (purpose === "review-outcome") {
    const outcome = effect.outcome && typeof effect.outcome === "object" ? effect.outcome as Record<string, unknown> : {};
    return text(outcome.body) ?? "A market return needs your read.";
  }
  if (purpose === "end-bet") return text(effect.reason) ?? "An agent proposes ending this work.";
  return "Drover needs your decision.";
}

function latestDurableTimestamp(lens: FirmLens, messages: FirmConversationMessage[], architecture?: FirmArchitectureProjection | null) {
  const timestamps = [
    ...lens.bets.flatMap((bet) => [bet.updatedAt, ...(bet.events ?? []).map((event) => event.at)]),
    ...(lens.outcomes ?? []).map((outcome) => outcome.observedAt),
    ...(lens.wallItems ?? []).map((item) => item.parkedAt),
    ...messages.map((message) => message.createdAt),
    architecture?.document.updatedAt,
  ].filter((value): value is string => typeof value === "string" && Number.isFinite(Date.parse(value)));
  return timestamps.sort().at(-1) ?? null;
}

export function buildReturnBrief(
  lens: FirmLens,
  messages: FirmConversationMessage[],
  cursor: string | null,
  architecture?: FirmArchitectureProjection | null,
  options?: { limitPerGroup?: number; heading?: string },
): { projection: ReturnBriefProjection | null; records: ReturnBriefRecord[]; reviewedThrough: string | null } {
  const records: ReturnBriefRecord[] = [];
  const betById = new Map(lens.bets.map((bet) => [bet.id, bet]));
  const configuration = lens.configuration;

  if (architecture && afterCursor(architecture.document.updatedAt, cursor)) {
    for (const pressure of architecture.pressure ?? []) {
      if (pressure.reason === "held-release") continue;
      const architectureId = pressure.subjectId ?? pressure.subjectRef?.replace(/^architecture:/, "") ?? null;
      if (!architectureId) continue;
      const element = architecture.elements.find((candidate) => candidate.id === architectureId);
      if (!element) continue;
      records.push({
        id: `architecture:${architecture.revision}:${architectureId}:${pressure.reason}`,
        group: "architecture-shift",
        priority: pressure.reason === "challenged-claim" || pressure.reason === "founder-assertion-conflict" ? 3 : pressure.reason === "blocked-work" ? 2 : 1,
        truth: pressure.detail ?? `${element.name} is under ${pressure.reason.replaceAll("-", " ")}.`,
        whyNow: `This changes how Drover should understand and prepare work around “${element.name}.”`,
        attribution: `${element.role === "motion" ? "route" : element.role.replace("-", " ")} · ${element.name}`,
        occurredAt: architecture.document.updatedAt,
        provenance: `Architecture revision v${architecture.revision} · derived pressure, not a health score`,
        actionLabel: "Inspect on the map",
        target: { kind: "architecture", architectureId, architectureRevision: architecture.revision },
      });
    }
  }

  for (const item of lens.wallItems ?? []) {
    const bet = item.betId ? betById.get(item.betId) : null;
    const participant = bet?.teammateRef
      ? configuredParticipantName(configuration, bet.teammateRef, lens.crew.find((entry) => entry.ref === bet.teammateRef))
      : null;
    const held = item.purpose === "release";
    records.push({
      id: `wall:${item.id}`,
      group: "needs-you",
      persistent: true,
      priority: item.purpose === "answer" || item.purpose === "end-bet" ? 3 : 2,
      truth: wallTruth(item.purpose, item.effect),
      whyNow: held
        ? "Held safely. Nothing leaves until you release this exact act."
        : item.purpose === "end-bet"
          ? "Only you can end the line; keeping it leaves the work underway."
          : "Drover cannot make this judgment for you.",
      attribution: [participant, bet?.intent].filter(Boolean).join(" · ") || null,
      occurredAt: item.parkedAt,
      provenance: item.configurationRevision ? `Venture revision v${item.configurationRevision}` : "Exact founder-review record",
      actionLabel: "Review now",
      target: { kind: "wall" },
    });
  }

  for (const outcome of lens.outcomes ?? []) {
    if (!afterCursor(outcome.observedAt, cursor)) continue;
    const bet = outcome.betId ? betById.get(outcome.betId) : null;
    const joined = outcome.joined && bet;
    records.push({
      id: `outcome:${outcome.id}`,
      group: "market-spoke",
      priority: joined ? 2 : 1,
      truth: outcome.body ?? `${outcome.outcomeKind ?? "A market return"} was recorded.`,
      whyNow: joined
        ? `Joined to “${bet.intent}” by captured ${outcome.providerEventId ? "provider identity" : "evidence"}; causality is not claimed.`
        : "Unattributed — Drover has not claimed that this work caused it.",
      attribution: [outcome.from, outcome.channel].filter(Boolean).join(" · ") || null,
      occurredAt: outcome.observedAt,
      provenance: [outcome.source, outcome.configurationRevision ? `venture revision v${outcome.configurationRevision}` : null]
        .filter(Boolean).join(" · ") || "Durable market return",
      actionLabel: joined ? "Open on canvas" : "Review now",
      target: joined ? { kind: "bet", betId: bet.id } : { kind: "wall" },
    });
  }

  for (const bet of lens.bets) {
    const latestEvent = (bet.events ?? []).filter((event) => afterCursor(event.at, cursor)).at(-1);
    const changed = afterCursor(bet.updatedAt, cursor);
    if (!latestEvent && (!changed || (bet.stagedCount === 0 && !bet.forkedFrom))) continue;
    const participant = bet.teammateRef
      ? configuredParticipantName(configuration, bet.teammateRef, lens.crew.find((entry) => entry.ref === bet.teammateRef))
      : "Drover";
    const truth = text(latestEvent?.detail)
      ?? (bet.stagedCount > 0
        ? `${participant} prepared work for “${bet.intent}”.`
        : `${participant} continued “${bet.intent}” from an earlier approach.`);
    records.push({
      id: `bet:${bet.id}:${latestEvent?.at ?? bet.updatedAt}`,
      group: "kept-moving",
      priority: latestEvent?.type === "tool_failed" ? 2 : 1,
      truth,
      whyNow: bet.stagedCount > 0 ? `${bet.stagedCount} durable ${bet.stagedCount === 1 ? "artifact is" : "artifacts are"} inspectable now.` : "The originating line remains intact.",
      attribution: participant,
      occurredAt: latestEvent?.at ?? bet.updatedAt,
      provenance: [latestEvent ? "Exact activity record" : "Durable work record", bet.configurationRevision ? `venture revision v${bet.configurationRevision}` : null]
        .filter(Boolean).join(" · "),
      actionLabel: "Open on canvas",
      target: { kind: "bet", betId: bet.id },
    });
  }

  for (const message of messages) {
    if (message.kind !== "configuration-receipt" || !afterCursor(message.createdAt, cursor)) continue;
    records.push({
      id: `receipt:${message.id}`,
      group: "kept-moving",
      priority: 1,
      truth: message.configurationReceipt?.summary ?? message.content,
      whyNow: "The firm definition changed and remains reversible as a new revision.",
      attribution: message.teammateRef ?? "Founder decision",
      occurredAt: message.createdAt,
      provenance: message.configurationReceipt?.revision
        ? `Configuration receipt · revision v${message.configurationReceipt.revision}`
        : "Configuration receipt",
      actionLabel: "View receipt",
      target: { kind: "receipt", receiptId: message.id },
    });
  }

  return {
    projection: records.length
      ? projectReturnBrief(records, {
          heading: options?.heading ?? "Since you left",
          ...(options?.limitPerGroup != null ? { limitPerGroup: options.limitPerGroup } : {}),
        })
      : null,
    records,
    reviewedThrough: latestDurableTimestamp(lens, messages, architecture),
  };
}
