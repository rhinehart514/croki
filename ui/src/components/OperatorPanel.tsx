import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Circle,
  LoaderCircle,
  MessageSquareText,
  Play,
  Send,
  ShieldCheck,
  Square,
  Wrench,
  X,
} from "lucide-react";
import type { OperatorEvent, OperatorSession } from "@/types";

const TERMINAL = new Set(["completed", "blocked", "failed", "cancelled"]);

function eventIcon(event: OperatorEvent) {
  if (event.type === "graph_patched") return <Wrench aria-hidden="true" />;
  if (event.type === "run_completed") return <Play aria-hidden="true" />;
  if (event.type.includes("gate")) return <ShieldCheck aria-hidden="true" />;
  if (event.type.includes("failed") || event.type.includes("interrupted")) return <AlertCircle aria-hidden="true" />;
  if (event.type.includes("completed")) return <CheckCircle2 aria-hidden="true" />;
  if (event.type.includes("founder")) return <MessageSquareText aria-hidden="true" />;
  return <Circle aria-hidden="true" />;
}

function statusLabel(status: OperatorSession["status"]) {
  return status.replaceAll("_", " ");
}

export function OperatorPanel({
  open,
  session,
  onCancel,
  onClose,
  onResume,
  onReviewGate,
}: {
  open: boolean;
  session: OperatorSession | null;
  onCancel: () => void | Promise<void>;
  onClose: () => void;
  onResume: (input: string) => void | Promise<void>;
  onReviewGate: (nodeId: string) => void;
}) {
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    timelineRef.current?.scrollTo({ top: timelineRef.current.scrollHeight, behavior: "smooth" });
  }, [session?.events.length]);

  if (!open || !session) return null;

  const running = session.status === "running" || session.status === "ready";
  const canResume = session.status === "waiting_for_input"
    || session.status === "interrupted"
    || session.status === "failed";
  const pendingGateId = session.pendingGate?.nodeIds[0];

  const submit = async () => {
    const value = input.trim();
    if (!value || submitting) return;
    setSubmitting(true);
    try {
      await onResume(value);
      setInput("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="operator-panel" aria-label="GTM operator session">
      <header className="operator-panel-header">
        <div className="operator-panel-identity">
          <span className={`operator-avatar ${running ? "running" : ""}`}>
            {running ? <LoaderCircle className="spin" aria-hidden="true" /> : <Bot aria-hidden="true" />}
          </span>
          <div>
            <strong>GTM operator</strong>
            <span className={`operator-status operator-status-${session.status}`}>
              {statusLabel(session.status)}
            </span>
          </div>
        </div>
        <div className="operator-panel-actions">
          {!TERMINAL.has(session.status) ? (
            <button type="button" title="Stop session" onClick={() => void onCancel()}>
              <Square aria-hidden="true" />
            </button>
          ) : null}
          <button type="button" title="Close operator" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="operator-goal">
        <span>Goal</span>
        <p>{session.goal}</p>
        <small>{session.stepCount} model turn{session.stepCount === 1 ? "" : "s"} · graph revision {session.graphRevision}</small>
      </div>

      <div className="operator-timeline" ref={timelineRef} aria-live="polite">
        {session.events.map((event) => (
          <article className={`operator-event operator-event-${event.type}`} key={event.id}>
            <span className="operator-event-icon">{eventIcon(event)}</span>
            <div>
              <div className="operator-event-title">
                <strong>{event.title}</strong>
                <time>{new Date(event.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>
              </div>
              {event.detail ? <p>{event.detail}</p> : null}
              {event.type === "graph_patched" && Array.isArray(event.data?.changes) ? (
                <ul>
                  {(event.data.changes as Array<{ detail?: string }>).map((change, index) => (
                    <li key={`${event.id}-${index}`}>{change.detail}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </article>
        ))}
      </div>

      {session.status === "waiting_for_gate" && pendingGateId ? (
        <div className="operator-decision operator-decision-gate">
          <ShieldCheck aria-hidden="true" />
          <div>
            <strong>Founder review required</strong>
            <p>The operator reached the hard wall. Review the exact prepared items before anything continues.</p>
          </div>
          <button type="button" onClick={() => onReviewGate(pendingGateId)}>
            Review gate
          </button>
        </div>
      ) : null}

      {canResume ? (
        <div className="operator-response">
          {session.pendingQuestion ? (
            <div className="operator-question">
              <strong>{session.pendingQuestion.question}</strong>
              <span>{session.pendingQuestion.reason}</span>
            </div>
          ) : session.error ? (
            <div className="operator-question operator-question-error">
              <strong>The operator stopped</strong>
              <span>{session.error}</span>
            </div>
          ) : null}
          <div className="operator-response-row">
            <textarea
              aria-label="Founder response"
              placeholder="Redirect, answer, or ask it to continue…"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void submit();
              }}
            />
            <button disabled={!input.trim() || submitting} type="button" onClick={() => void submit()}>
              {submitting ? <LoaderCircle className="spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
            </button>
          </div>
        </div>
      ) : null}

      {session.summary && TERMINAL.has(session.status) ? (
        <div className="operator-summary">
          <CheckCircle2 aria-hidden="true" />
          <p>{session.summary}</p>
        </div>
      ) : null}
    </section>
  );
}
