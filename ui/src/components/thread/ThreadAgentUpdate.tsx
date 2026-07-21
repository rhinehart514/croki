import { useEffect, useState } from "react";
import type { ThreadTimelineItem } from "@/api";
import type { WorkChatMode } from "@/components/work-mode/WorkComposerBar";

const text = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;

function durationLabel(value: unknown) {
  const milliseconds = number(value);
  if (milliseconds == null) return null;
  if (milliseconds < 1_000) return `${Math.max(1, Math.round(milliseconds))}ms`;
  return `${(milliseconds / 1_000).toFixed(milliseconds < 10_000 ? 1 : 0)}s`;
}

function elapsedLabel(startedAt: unknown, now: number) {
  const started = Date.parse(text(startedAt));
  if (!Number.isFinite(started)) return null;
  const seconds = Math.max(0, Math.floor((now - started) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return seconds < 3600 ? `${minutes}m ${seconds % 60}s` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function ThreadAgentUpdate({ item, surface = "context", chatMode = "code" }: { item: ThreadTimelineItem; surface?: "work" | "context"; chatMode?: WorkChatMode }) {
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
  const summary = text(item.summary, "Working in this thread");
  const activitySteps = Array.isArray(item.activitySteps) ? item.activitySteps.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const step = entry as Record<string, unknown>;
    const label = text(step.label).trim();
    return label ? [{ id: text(step.id, label), label, duration: durationLabel(step.durationMs) }] : [];
  }) : [];
  const stateLabel = `${state.charAt(0).toUpperCase()}${state.slice(1)}${elapsed ? ` · ${elapsed}` : ""}`;
  const showParticipant = surface === "context" || chatMode === "product-gtm";
  const accessibleLabel = showParticipant ? `${participant}: ${summary}. ${stateLabel}` : `${summary}. ${stateLabel}`;
  return (
    <article className="thread-agent-update" id={`agent-update-${participantRef}`} data-state={state} role="status" aria-label={accessibleLabel}>
      <span className="thread-agent-mark" aria-hidden="true" />
      <div>
        <div className="thread-agent-line">
          {showParticipant ? <strong>{participant}</strong> : null}
          <p>{summary}</p>
          <span className="thread-agent-state">{stateLabel}</span>
        </div>
        {activitySteps.length ? <details className="thread-agent-details">
          <summary>Show activity</summary>
          <ol>{activitySteps.map((step) => <li key={step.id}><span>{step.label}</span>{step.duration ? <small>{step.duration}</small> : null}</li>)}</ol>
        </details> : null}
      </div>
    </article>
  );
}
