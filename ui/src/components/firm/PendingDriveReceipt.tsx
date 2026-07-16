import { Clock3 } from "lucide-react";
import type { FirmLens } from "@/types";
import { CrewFace } from "@/components/crew/CrewFace";
import type { DriveState } from "./GoalComposer";
import { visibleActivity } from "./event-feed-model";

const EVENT_TIME = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

function timeLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : EVENT_TIME.format(date);
}

export function PendingDriveReceipt({ lens, driving }: { lens: FirmLens; driving: DriveState }) {
  const bet = driving.betId ? lens.bets.find((candidate) => candidate.id === driving.betId) : null;
  const latest = bet ? visibleActivity(bet).at(-1) : null;
  const at = latest?.at ? timeLabel(latest.at) : null;

  return (
    <section className="firm-app-working" aria-label="Current work status" aria-live="polite">
      {driving.teammateRef ? <CrewFace agentRef={driving.teammateRef} size={30} /> : null}
      <span>
        <strong>{latest?.label ?? "Direction sent"}</strong>
        <small>{latest?.detail ?? `No durable work from ${driving.teammateName} has been recorded yet.`}</small>
        <em>{driving.direction}</em>
      </span>
      {at ? <time dateTime={latest?.at ?? undefined}><Clock3 aria-hidden="true" />{at}</time> : null}
    </section>
  );
}
