// Shared conversation helpers for the ambient channel — kept out of the component files so fast-refresh
// stays component-only, and so the receipt→node mapping is unit-testable without rendering. Conversation
// is append-only (CONTRACT 1.5); these functions never mutate it, they only classify and route messages
// to the world node they concern.
import type { FirmConversationMessage } from "@/types";

// The world-node id a message concerns, derived from its target scope. Mirrors the id scheme the
// projection uses so a receipt anchors to the exact placed node: `bet:<id>` for an effort/live push,
// `work:<ref>` when only a work ref is present, `architecture:<id>` for a machinery/spine target. Returns
// null when the message is firm-wide (no target) — those render in the summonable thread, not in-world.
export function receiptNodeId(message: FirmConversationMessage): string | null {
  const target = message.target;
  const betId = target?.betId ?? message.betId ?? null;
  if (betId) return `bet:${betId}`;
  if (target?.workRef) return `work:${target.workRef}`;
  if (target?.architectureId) return `architecture:${target.architectureId}`;
  return null;
}

// A checkpoint message is a crew handoff seal (the first-theory / working-theory moment lands as a
// `handoff` in the append-only conversation) — rendered as an in-world CheckpointCard (a sealed object),
// never a chat bubble (redesign §7). Everything else is a flat receipt row.
export function isCheckpoint(message: FirmConversationMessage): boolean {
  return message.kind === "handoff";
}

// Crew ref → founder-facing display name. The teammateRef is the durable identifier; the receipt shows
// the person, capitalized, so watchable work reads as a named crew member acting.
export function crewName(ref: string | null | undefined): string {
  if (!ref) return "The firm";
  const bare = ref.split(/[:/]/).pop() ?? ref;
  return bare.charAt(0).toUpperCase() + bare.slice(1);
}
