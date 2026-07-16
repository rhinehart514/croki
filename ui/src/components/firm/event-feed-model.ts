import type { FirmBet, FirmLens } from "@/types";

type BetEvent = NonNullable<FirmBet["events"]>[number];

export type ActivityBeat = {
  label: string | null;
  detail: string | null;
  at: string;
  voice?: boolean;
  recoverable?: boolean;
};

const TOOL_PROGRESS: Record<string, string> = {
  scan_repository: "Reviewing the product",
  read_truth: "Reviewing the product",
  get_taste: "Reviewing your decisions",
  fork_bet: "Exploring another approach",
  stage_artifact: "Preparing work",
  stage_outward: "Preparing work for your review",
  ask_founder: "Preparing a question for you",
};

const TOOL_FAILURES: Record<string, string> = {
  scan_repository: "Couldn’t review the product",
  read_truth: "Couldn’t review the product",
  get_taste: "Couldn’t review your decisions",
  fork_bet: "Couldn’t start another approach",
  stage_artifact: "Couldn’t prepare the work",
  stage_outward: "Couldn’t prepare work for your review",
  ask_founder: "Couldn’t bring the question to you",
};

function cleanDetail(detail: string | null | undefined) {
  const value = detail?.trim();
  return value || null;
}

function toolNameFromFailure(detail: string | null | undefined) {
  const value = cleanDetail(detail);
  if (!value) return null;
  const separator = value.indexOf(":");
  return separator === -1 ? value : value.slice(0, separator).trim();
}

function narrateEvent(event: BetEvent): ActivityBeat | null {
  const detail = cleanDetail(event.detail);
  const withTime = (beat: Omit<ActivityBeat, "at">): ActivityBeat => ({ ...beat, at: event.at });

  switch (event.type) {
    case "speak":
    case "text":
      return detail ? withTime({ label: null, detail, voice: true }) : null;
    case "bet_forked":
      return withTime({ label: "Work began", detail: null });
    case "staged":
      return withTime({ label: "Work ready", detail: null });
    case "parked":
      return withTime({ label: "Needs your hand", detail: null });
    case "asked":
      return withTime({ label: "Needs your input", detail });
    case "tool_started": {
      const label = detail ? TOOL_PROGRESS[detail] : null;
      return label ? withTime({ label, detail: null }) : null;
    }
    case "tool_failed": {
      const toolName = toolNameFromFailure(detail);
      return withTime({ label: (toolName && TOOL_FAILURES[toolName]) || "A work step stopped", detail: null, recoverable: true });
    }
    case "work_stopped":
      return withTime({ label: "Work stopped", detail: "Everything already prepared was kept.", recoverable: true });
    default:
      return null;
  }
}

export function visibleActivity(bet: FirmBet) {
  return (bet.events ?? [])
    .map(narrateEvent)
    .filter((event): event is ActivityBeat => event !== null)
    .slice(-8);
}

export function hasVisibleActivity(lens: FirmLens) {
  return lens.bets.some((bet) => visibleActivity(bet).length > 0);
}
