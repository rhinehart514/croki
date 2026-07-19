import { useEffect, useState } from "react";
import type { ThreadTimelineItem } from "@/api";

const text = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;

function elapsedLabel(startedAt: unknown, now: number) {
  const started = Date.parse(text(startedAt));
  if (!Number.isFinite(started)) return null;
  const seconds = Math.max(0, Math.floor((now - started) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return seconds < 3600 ? `${minutes}m ${seconds % 60}s` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function ThreadAgentUpdate({ item }: { item: ThreadTimelineItem }) {
  const [now, setNow] = useState(() => Date.now());
  const participantRef = text(item.participantRef, "agent");
  const participant = text(item.participantLabel, participantRef);
  const state = text(item.state, "working");
  useEffect(() => {
    if (state !== "working" && state !== "stopping") return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [state]);
  const elapsed = elapsedLabel(item.startedAt, now);
  return (
    <article className="thread-agent-update" id={`agent-update-${participantRef}`} data-state={state}>
      <span className="thread-agent-mark" aria-hidden="true" />
      <div><strong>{participant}</strong><p>{text(item.summary, "Working in this thread")}</p></div>
      <span className="thread-agent-state">{state}{elapsed ? ` · ${elapsed}` : ""}</span>
    </article>
  );
}
