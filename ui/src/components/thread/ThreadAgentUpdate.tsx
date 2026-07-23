import { useEffect, useState } from "react";
import type { ThreadTimelineItem } from "@/api";
import type { WorkChatMode } from "@/components/work-mode/WorkComposerBar";

const text = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;

// How many of the most recent safe tool steps stay visible; earlier ones fold behind one toggle.
const VISIBLE_STEPS = 3;

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

function elapsedMilliseconds(startedAt: unknown, now: number) {
  const started = Date.parse(text(startedAt));
  return Number.isFinite(started) ? Math.max(0, now - started) : null;
}

type Step = { id: string; label: string; tone: string; duration: string | null };

function StepRow({ step }: { step: Step }) {
  return (
    <li data-tone={step.tone}>
      <span>{step.label}</span>
      {step.duration ? <small>{step.duration}</small> : null}
    </li>
  );
}

export function ThreadAgentUpdate({ item, surface = "context", chatMode = "code" }: { item: ThreadTimelineItem; surface?: "work" | "context"; chatMode?: WorkChatMode }) {
  const [now, setNow] = useState(() => Date.now());
  const [showEarlier, setShowEarlier] = useState(false);
  const participantRef = text(item.participantRef, "agent");
  const participant = text(item.participantLabel, participantRef);
  const state = text(item.state, "working");
  useEffect(() => {
    if (state !== "working" && state !== "stopping") return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [state]);
  const elapsed = elapsedLabel(item.startedAt, now);
  const elapsedMs = elapsedMilliseconds(item.startedAt, now);
  const summary = text(item.summary, "Working in this thread");
  const summaryTone = text(item.summaryTone);
  const activitySteps: Step[] = Array.isArray(item.activitySteps) ? item.activitySteps.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const step = entry as Record<string, unknown>;
    const label = text(step.label).trim();
    return label ? [{ id: text(step.id, label), label, tone: text(step.tone, "tool"), duration: durationLabel(step.durationMs) }] : [];
  }) : [];
  const earlierSteps = activitySteps.slice(0, Math.max(0, activitySteps.length - VISIBLE_STEPS));
  const latestSteps = activitySteps.slice(-VISIBLE_STEPS);
  const liveTool = item.liveTool && typeof item.liveTool === "object" ? item.liveTool as Record<string, unknown> : null;
  const liveToolName = text(liveTool?.name).trim();
  // Only the tail of the forming arguments fits on one quiet line; the newest characters carry the signal.
  const liveToolInput = text(liveTool?.partialInput).replace(/\s+/g, " ").trim().slice(-140);
  const longWait = state === "working" && elapsedMs != null && elapsedMs >= 90_000;
  const stateLabel = `${longWait ? "Taking longer than usual" : `${state.charAt(0).toUpperCase()}${state.slice(1)}`}${elapsed ? ` · ${elapsed}` : ""}`;
  const showParticipant = surface === "context" || chatMode === "product-gtm";
  const accessibleLabel = showParticipant ? `${participant}: ${summary}. ${stateLabel}` : `${summary}. ${stateLabel}`;
  return (
    <article className="thread-agent-update" id={`agent-update-${participantRef}`} data-state={state} role="status" aria-label={accessibleLabel}>
      <span className="thread-agent-mark" aria-hidden="true" />
      <div>
        <div className="thread-agent-line">
          {showParticipant ? <strong>{participant}</strong> : null}
          <p data-tone={summaryTone || undefined}>{summary}</p>
          <span className="thread-agent-state">{stateLabel}</span>
        </div>
        {longWait ? <p className="thread-agent-wait-note">The work is still active. You can leave this thread and return when it finishes.</p> : null}
        {activitySteps.length ? <div className="thread-agent-steps">
          {earlierSteps.length ? <button
            type="button"
            className="thread-agent-fold"
            aria-expanded={showEarlier}
            onClick={() => setShowEarlier((open) => !open)}
          >{showEarlier ? "Hide earlier steps" : `+${earlierSteps.length} earlier ${earlierSteps.length === 1 ? "step" : "steps"}`}</button> : null}
          <ol>
            {showEarlier ? earlierSteps.map((step) => <StepRow key={step.id} step={step} />) : null}
            {latestSteps.map((step) => <StepRow key={step.id} step={step} />)}
          </ol>
        </div> : null}
        {state === "working" && liveToolName ? <p className="thread-agent-live-tool">
          <code>{liveToolName}</code>
          {liveToolInput ? <span>{liveToolInput}</span> : null}
        </p> : null}
      </div>
    </article>
  );
}
