import { useEffect, useState } from "react";
import { Square } from "lucide-react";
import type { FirmLens } from "@/types";
import { CrewFace } from "@/components/crew/CrewFace";
import { Button } from "@/components/ui/button";
import { visibleActivity } from "./event-feed-model";
import { configuredParticipantName } from "./teammateDisplay";
import { configurationForLens } from "@/lib/firmConfiguration";

const EVENT_TIME = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

export type FirmActiveWork = {
  id: string;
  teammateRef: string;
  betId: string | null;
  runtime: string;
  startedAt: string;
  abortSupported: boolean;
  abortRequestedAt: string | null;
};

function timeLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : EVENT_TIME.format(date);
}

function runtimeLabel(runtime: string) {
  return runtime.split("-").map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(" ");
}

function elapsedLabel(startedAt: string, now: number) {
  const started = new Date(startedAt).getTime();
  if (Number.isNaN(started)) return null;
  const totalSeconds = Math.max(0, Math.floor((now - started) / 1_000));
  if (totalSeconds < 60) return `${totalSeconds}s elapsed`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}m ${totalSeconds % 60}s elapsed`;
  const hours = Math.floor(totalMinutes / 60);
  return `${hours}h ${totalMinutes % 60}m elapsed`;
}

export function ActiveWorkReceipt({
  lens,
  work,
  onStop,
  readOnly = false,
  readOnlyReason,
}: {
  lens: FirmLens;
  work: FirmActiveWork;
  onStop?: (workId: string) => void | Promise<void>;
  readOnly?: boolean;
  readOnlyReason?: string;
}) {
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const bet = work.betId ? lens.bets.find((candidate) => candidate.id === work.betId) : null;
  const latest = bet ? visibleActivity(bet).at(-1) : null;
  const member = lens.crew.find((candidate) => candidate.ref === work.teammateRef);
  const teammate = configuredParticipantName(configurationForLens(lens), work.teammateRef, member, work.teammateRef);
  const startedAt = timeLabel(work.startedAt);
  const elapsed = elapsedLabel(work.startedAt, now);
  const betWork = bet?.work as { spentUsd?: unknown } | undefined;
  const spentUsd = typeof betWork?.spentUsd === "number" && Number.isFinite(betWork.spentUsd)
    ? betWork.spentUsd
    : null;
  const stopRequested = Boolean(work.abortRequestedAt) || stopping;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => window.clearInterval(timer);
  }, [work.id]);

  const stop = async () => {
    if (!onStop || readOnly || stopRequested) return;
    setStopping(true);
    setError(null);
    try {
      await onStop(work.id);
    } catch (cause) {
      setStopping(false);
      setError(cause instanceof Error ? cause.message : "This work could not be stopped.");
    }
  };

  return (
    <section className="firm-app-working" aria-label="Current work" aria-live="polite">
      <CrewFace agentRef={work.teammateRef} size={30} />
      <span>
        <strong>{stopRequested ? "Stopping after the current boundary" : latest?.label ?? "Work is active"}</strong>
        <small>{latest?.detail ?? bet?.intent ?? `No durable step from ${teammate} has landed yet.`}</small>
        <em>{teammate} · {runtimeLabel(work.runtime)}{bet?.configurationRevision ? ` · configuration v${bet.configurationRevision}` : ""}{elapsed ? ` · ${elapsed}` : ""}{startedAt ? ` · started ${startedAt}` : ""}. Stopping keeps this direction and everything already prepared.</em>
        {spentUsd !== null ? <span className="firm-app-working-cost">Cost recorded: ${String(spentUsd)}</span> : null}
        {readOnly && readOnlyReason ? <span role="status" className="firm-app-working-note">{readOnlyReason}</span> : null}
        {error ? <span role="alert" className="firm-app-working-error">{error}</span> : null}
      </span>
      {work.abortSupported && onStop ? (
        <Button type="button" variant="outline" size="sm" onClick={() => void stop()} disabled={readOnly || stopRequested}>
          <Square aria-hidden="true" /> {stopRequested ? "Stop requested" : "Stop current work"}
        </Button>
      ) : null}
    </section>
  );
}
