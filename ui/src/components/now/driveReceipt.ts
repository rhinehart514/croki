// The post-submit receipt — what a founder sees the instant a direction is driven. The drive has already
// run by the time the response resolves, so this is never "work started" into a void: it is a composed,
// honest statement of what became concrete. Derived deterministically from the handoff manifest (what
// opened/staged/reached the wall), the outcome kind, and the completion grounding — in the same founder
// vocabulary the direction model uses. It never echoes raw agent narration; the one place a teammate's own
// words surface is a pure answer that opened no work, where those words ARE the product.
import type { ConversationReplyResult, DriveTeammateResult } from "@/api";

export type DriveReceipt = {
  headline: string;
  detail: string | null;
  // A decision now waits on the founder — the receipt points at judgment, not just work.
  waiting: boolean;
  // The bet the founder should open to enter the resulting direction; null when the drive produced only an
  // inline answer (no work to open) and the receipt is itself terminal.
  targetBetId: string | null;
};

function firstSentence(value: string, max = 150): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  const stop = trimmed.search(/[.!?](?:\s|$)/);
  if (stop >= 0 && stop + 1 <= max) return trimmed.slice(0, stop + 1);
  return trimmed.length > max ? `${trimmed.slice(0, max).trimEnd()}…` : trimmed;
}

export function readDriveReceipt(result: DriveTeammateResult): DriveReceipt {
  const changes = result.handoff?.changes ?? null;
  const opened = changes?.openedBetIds?.length ?? 0;
  const staged = changes?.stagedBetIds?.length ?? 0;
  const wallCount = changes?.wallBetIds?.length ?? 0;
  const kind = result.outcome?.kind ?? null;
  const summary = typeof result.outcome?.summary === "string" ? result.outcome.summary.trim() : "";
  const sources = result.completion?.grounding?.sourceRefs?.length ?? 0;
  const participant = result.runtime?.label?.trim() || null;
  const waiting = wallCount > 0 || kind === "paused";

  const targetBetId =
    (waiting && wallCount > 0 ? changes?.wallBetIds?.[0] : null)
    ?? changes?.openedBetIds?.[0]
    ?? changes?.stagedBetIds?.[0]
    ?? result.handoff?.betId
    ?? null;

  let headline: string;
  if (waiting) {
    headline = "Drover reached a decision that's yours to make.";
  } else if (staged > 0 && opened > 0) {
    headline = "New work is underway and a change is ready to review.";
  } else if (staged > 0) {
    headline = staged === 1 ? "A change is ready to review." : `${staged} changes are ready to review.`;
  } else if (opened > 0) {
    headline = opened === 1 ? "A new approach is underway." : `${opened} approaches are underway.`;
  } else if (kind === "cancelled") {
    headline = "Work stopped — what it produced so far is kept.";
  } else if (summary) {
    headline = "Drover worked through it.";
  } else {
    headline = "Work started — it will take shape in this direction.";
  }

  // The supporting line. A pure answer (no work opened) leads with the teammate's own words; anything with
  // work leads with grounding when it exists, then falls back to who worked.
  let detail: string | null = null;
  if (!waiting && opened === 0 && staged === 0 && summary) {
    detail = firstSentence(summary);
  } else if (sources > 0) {
    detail = `Grounded in ${sources} ${sources === 1 ? "source" : "sources"}${participant ? ` · ${participant}` : ""}.`;
  } else if (participant) {
    detail = participant;
  }

  return { headline, detail, waiting, targetBetId };
}

// The receipt for a SCOPED conversation turn — the founder steered/answered/approved an existing direction
// through the venture conversation (replyInConversation), not a fresh drive. The routed act names what the
// turn did in the founder's own vocabulary. Steering and closing apply before resolution; approvals only
// record intent and surface the exact act that still needs founder release at the gate. Terminal by design
// (no "open this direction" — the composer is already inside it), so targetBetId stays null.
export function readReplyReceipt(result: ConversationReplyResult): DriveReceipt {
  const waiting = (result.act === "approve" || result.act === "approve-standing")
    && Boolean(result.waitingItemId);
  let headline: string;
  switch (result.act) {
    case "approve":
      headline = waiting
        ? "Approved — release this act at the gate to carry it out."
        : "Nothing is waiting for approval in this direction.";
      break;
    case "approve-standing":
      headline = waiting
        ? "Standing approval saved — this act still needs your release at the gate."
        : "Standing approval saved.";
      break;
    case "close":
    case "close-thread":
      headline = result.ended ? "This direction is closed — what it produced is kept." : "Closing this direction.";
      break;
    case "new-direction":
      headline = "A new direction is underway.";
      break;
    case "answer":
      headline = "The SDK is answering here.";
      break;
    case "stop-run":
      headline = result.stoppedRunRef ? "Stop requested — the rest of this thread stays active." : "Drover needs a more specific run to stop.";
      break;
    case "parallel-attempts":
      headline = result.needsFounderJudgment ? "Drover needs the two participants you mean." : "Independent attempts are underway in this thread.";
      break;
    case "critique":
      headline = result.needsFounderJudgment ? "Drover needs the exact work to critique." : `${result.teammateRef ?? "A participant"} is critiquing the returned work.`;
      break;
    case "involve-participant":
      headline = result.needsFounderJudgment ? "Drover needs the participant you mean." : `${result.teammateRef ?? "A participant"} is joining this thread.`;
      break;
    case "observe":
      headline = "Returned evidence checked.";
      break;
    default:
      headline = "Your steer is in — Drover is adjusting course.";
  }
  const note = typeof result.note === "string" ? result.note.trim() : "";
  const why = typeof result.why === "string" ? result.why.trim() : "";
  const detail = note ? firstSentence(note) : why ? firstSentence(why) : null;
  return { headline, detail, waiting, targetBetId: null };
}
