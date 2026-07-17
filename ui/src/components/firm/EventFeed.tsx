import type { FirmLens } from "@/types";
import { CrewFace } from "@/components/crew/CrewFace";
import { visibleActivity } from "./event-feed-model";
import { configuredParticipantName } from "./teammateDisplay";
import { configurationForLens } from "@/lib/firmConfiguration";

function teammateName(lens: FirmLens, ref: string | null) {
  const member = lens.crew.find((candidate) => candidate.ref === ref);
  return configuredParticipantName(configurationForLens(lens), ref, member, "The agents");
}

export function EventFeed({
  lens,
  includeVoice = true,
  betIds,
  onRetryBet,
  onRedirectBet,
}: {
  lens: FirmLens;
  includeVoice?: boolean;
  betIds?: string[];
  onRetryBet?: (betId: string) => void;
  onRedirectBet?: (betId: string) => void;
}) {
  const included = betIds ? new Set(betIds) : null;
  const bets = lens.bets
    .filter((bet) => !included || included.has(bet.id))
    .map((bet) => ({ bet, activity: visibleActivity(bet).filter((event) => includeVoice || !event.voice) }))
    .filter(({ activity }) => activity.length > 0);

  if (bets.length === 0) {
    const first = lens.crew[0];
    const ref = first?.ref ?? "founding-teammate";
    const name = first ? teammateName(lens, first.ref) : "Your first agent";
    return (
      <div className="firm-app-feed-empty">
        <CrewFace agentRef={ref} size={54} />
        <strong>{name} is ready</strong>
        <p>Say what this venture should accomplish. Work, questions, and market returns will collect here while the canvas shows the whole venture.</p>
      </div>
    );
  }

  return (
    <div className="firm-app-feed">
      {bets.map(({ bet, activity }) => (
        <section key={bet.id} className="firm-app-feed-bet" aria-labelledby={`activity-${bet.id}`}>
          <header>
            <CrewFace agentRef={bet.teammateRef ?? "unassigned-teammate"} size={30} />
            <span>
              <strong>{teammateName(lens, bet.teammateRef)}</strong>
              <small id={`activity-${bet.id}`}>{bet.intent}</small>
            </span>
            <em>{bet.position === "at-wall" ? "Needs you" : bet.position === "live" ? "Underway" : "Ended"}</em>
          </header>
          <ol>
            {activity.map((event, index) => (
              <li key={`${bet.id}-${index}`} className={event.voice ? "firm-app-feed-voice" : undefined}>
                {event.label ? <span className="firm-app-feed-label">{event.label}</span> : null}
                {event.detail ? <span className="firm-app-feed-detail">{event.detail}</span> : null}
              </li>
            ))}
          </ol>
          {activity.some((event) => event.recoverable) && (onRetryBet || onRedirectBet) ? (
            <div className="firm-app-feed-recovery" aria-label={`Recover ${bet.intent}`}>
              {onRetryBet ? <button type="button" onClick={() => onRetryBet(bet.id)}>Retry current move</button> : null}
              {onRedirectBet ? <button type="button" onClick={() => onRedirectBet(bet.id)}>Redirect this work</button> : null}
            </div>
          ) : null}
        </section>
      ))}
    </div>
  );
}
