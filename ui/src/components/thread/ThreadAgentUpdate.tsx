import { useEffect, useRef, useState } from "react";
import type { ThreadTimelineItem } from "@/api";
import { MessageResponse } from "@/components/ai-elements/message";
import type { WorkChatMode } from "@/components/work-mode/WorkComposerBar";
import { useDriveStream, type DriveStreamStep, type DriveStreamThinking } from "@/hooks/useDriveStream";
import { readActiveVentureId } from "@/lib/venture-session";

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

function startedMilliseconds(value: unknown) {
  const started = Date.parse(text(value));
  return Number.isFinite(started) ? started : null;
}

// After this long in one working state, the label stops pretending the wait is ordinary.
const LONG_WAIT_MS = 90_000;

const thinkingSecondsLabel = (ms: number | null) => `Thinking · ${Math.max(1, Math.round((ms ?? 0) / 1_000))}s`;

// Live timers write their own text node once a second. A working turn must never commit a React
// render just to advance "2m 3s" — on a long thread that per-second commit is real jank.
function AgentState({ prefix, startedAt, active }: { prefix: string; startedAt: unknown; active: boolean }) {
  const node = useRef<HTMLSpanElement | null>(null);
  // Render stays pure: the clock is read once at mount, then only the interval advances the text.
  const [mountedAt] = useState(() => Date.now());
  useEffect(() => {
    if (!active || startedMilliseconds(startedAt) == null) return undefined;
    const tick = () => {
      const label = elapsedLabel(startedAt, Date.now());
      if (node.current) node.current.textContent = label ? `${prefix} · ${label}` : prefix;
    };
    tick();
    const timer = window.setInterval(tick, 1_000);
    return () => window.clearInterval(timer);
  }, [active, prefix, startedAt]);
  const label = elapsedLabel(startedAt, mountedAt);
  return <span className="thread-agent-state" ref={node}>{label ? `${prefix} · ${label}` : prefix}</span>;
}

function ThinkingState({ thinking }: { thinking: DriveStreamThinking | null }) {
  const node = useRef<HTMLSpanElement | null>(null);
  const [observedAt] = useState(() => Date.now());
  const activeStart = thinking?.active && thinking.startedAt != null ? thinking.startedAt : null;
  useEffect(() => {
    if (activeStart == null) return undefined;
    const tick = () => {
      if (node.current) node.current.textContent = thinkingSecondsLabel(Date.now() - activeStart);
    };
    tick();
    const timer = window.setInterval(tick, 1_000);
    return () => window.clearInterval(timer);
  }, [activeStart]);
  if (!thinking) return null;
  const currentMs = activeStart != null ? Math.max(0, observedAt - activeStart) : thinking.durationMs;
  return <span className="thread-agent-state" data-live="thinking" ref={node}>{thinkingSecondsLabel(currentMs)}</span>;
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

// The timeline anchors the live stream: an agent-status item carries `ref: "run:<driveId>"` (and an
// `id` of `agent:<driveId>:<state>` behind it). Nothing else in the transcript names the drive, so the
// anchor is parsed here rather than threaded through a new prop the transcript would have to carry.
function driveIdFromItem(item: ThreadTimelineItem): string | null {
  const ref = text(item.ref);
  if (ref.startsWith("run:")) return ref.slice(4).trim() || null;
  const parts = text(item.id).split(":");
  return parts[0] === "agent" && parts[1]?.trim() ? parts[1].trim() : null;
}

function liveStep(step: DriveStreamStep): Step {
  const target = step.target ? ` ${step.target}` : "";
  return {
    id: step.id,
    label: `${step.name}${target}`,
    tone: step.status === "failed" ? "attention" : "tool",
    duration: null,
  };
}

export function ThreadAgentUpdate({ item, surface = "context", chatMode = "code" }: { item: ThreadTimelineItem; surface?: "work" | "context"; chatMode?: WorkChatMode }) {
  const [showEarlier, setShowEarlier] = useState(false);
  const participantRef = text(item.participantRef, "agent");
  const participant = text(item.participantLabel, participantRef);
  const state = text(item.state, "working");
  const active = state === "working" || state === "stopping";
  // Payload comes from the drive's own stream while it runs. The timeline no longer refetches on drive
  // pings, so its `liveText` / `liveTool` fields are only the last durable read — the stream wins while
  // it is connected and the durable fields remain the honest fallback when it is not.
  const ventureId = text(item.ventureId) || readActiveVentureId() || "";
  const driveId = driveIdFromItem(item);
  const live = useDriveStream(active ? ventureId || null : null, active ? driveId : null);
  // The accessible state label reads the clock once at mount; ElapsedTime owns the live ticking.
  const [observedAt] = useState(() => Date.now());
  const [longWaitReached, setLongWaitReached] = useState(() => {
    const started = startedMilliseconds(item.startedAt);
    return started != null && Date.now() - started >= LONG_WAIT_MS;
  });
  useEffect(() => {
    if (state !== "working" || longWaitReached) return undefined;
    const started = startedMilliseconds(item.startedAt);
    if (started == null) return undefined;
    // One structural flip at the 90s mark — never a per-second poll to notice it.
    const remaining = Math.max(0, started + LONG_WAIT_MS - Date.now());
    const timer = window.setTimeout(() => setLongWaitReached(true), remaining);
    return () => window.clearTimeout(timer);
  }, [state, item.startedAt, longWaitReached]);
  const summary = text(item.summary, "Working in this thread");
  const summaryTone = text(item.summaryTone);
  const durableSteps: Step[] = Array.isArray(item.activitySteps) ? item.activitySteps.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const step = entry as Record<string, unknown>;
    const label = text(step.label).trim();
    return label ? [{ id: text(step.id, label), label, tone: text(step.tone, "tool"), duration: durationLabel(step.durationMs) }] : [];
  }) : [];
  // Completed tool steps arrive on the stream as they settle; a durable read may already carry the same
  // step, so the durable record leads and only steps it does not name yet are appended.
  const activitySteps: Step[] = [
    ...durableSteps,
    ...live.steps.map(liveStep).filter((step) => !durableSteps.some((durable) => durable.label === step.label)),
  ];
  const earlierSteps = activitySteps.slice(0, Math.max(0, activitySteps.length - VISIBLE_STEPS));
  const latestSteps = activitySteps.slice(-VISIBLE_STEPS);
  const durableTool = item.liveTool && typeof item.liveTool === "object" ? item.liveTool as Record<string, unknown> : null;
  const formingTool = live.tool ?? (durableTool ? { name: text(durableTool.name), partialInput: text(durableTool.partialInput) } : null);
  const liveToolName = text(formingTool?.name).trim();
  // Only the tail of the forming arguments fits on one quiet line; the newest characters carry the signal.
  const liveToolInput = text(formingTool?.partialInput).replace(/\s+/g, " ").trim().slice(-140);
  // The stream while it is connected; the timeline's own last durable read of the forming reply when
  // it is not. One painted reply either way — the timeline no longer projects a second live message.
  const replyText = (live.text || text(item.liveText)).trim();
  const longWait = state === "working" && longWaitReached;
  const stateText = longWait ? "Taking longer than usual" : `${state.charAt(0).toUpperCase()}${state.slice(1)}`;
  const elapsedNow = elapsedLabel(item.startedAt, observedAt);
  const stateLabel = `${stateText}${elapsedNow ? ` · ${elapsedNow}` : ""}`;
  const showParticipant = surface === "context" || chatMode === "product-gtm";
  const accessibleLabel = showParticipant ? `${participant}: ${summary}. ${stateLabel}` : `${summary}. ${stateLabel}`;
  return (
    <>
      <article className="thread-agent-update" id={`agent-update-${participantRef}`} data-state={state} role="status" aria-label={accessibleLabel}>
        <span className="thread-agent-mark" aria-hidden="true" />
        <div>
          <div className="thread-agent-line">
            {showParticipant ? <strong>{participant}</strong> : null}
            <p data-tone={summaryTone || undefined}>{summary}</p>
            <AgentState prefix={stateText} startedAt={item.startedAt} active={active} />
            <ThinkingState thinking={live.thinking} />
          </div>
          {longWait ? <p className="thread-agent-wait-note">The work is still active. You can leave this thread and return when it finishes.</p> : null}
          {live.todos.length ? <div className="thread-agent-steps" aria-label="Plan">
            <ol>
              {live.todos.map((todo) => (
                <li key={todo.content} data-tone={todo.status === "in_progress" ? "attention" : todo.status === "completed" ? "thinking" : undefined}>
                  <span>{todo.content}</span>
                  <small>{todo.status === "in_progress" ? "now" : todo.status === "completed" ? "done" : "next"}</small>
                </li>
              ))}
            </ol>
          </div> : null}
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
          {/* A subagent's own forming call stays attributed to it rather than merging into the parent. */}
          {live.children.map((child) => child.tool ? (
            <p className="thread-agent-live-tool" key={child.parentToolUseId}>
              <code>{`↳ ${child.tool.name}`}</code>
              {child.tool.partialInput ? <span>{child.tool.partialInput.replace(/\s+/g, " ").trim().slice(-140)}</span> : null}
            </p>
          ) : null)}
        </div>
      </article>
      {/* The forming reply, painted from the stream in the transcript's own message geometry: unboxed
          agent output in document order, appended in place, never a second scroll container. */}
      {replyText ? (
        <article className="thread-message" data-role="teammate" data-streaming="true">
          <header>{participant}</header>
          <div className="thread-message-body">
            <MessageResponse>{replyText}</MessageResponse>
            <span className="thread-message-caret" aria-label="Responding…" />
          </div>
        </article>
      ) : null}
    </>
  );
}
