// DecideTogetherPanel — rail 5's push, rendered. When a real reply comes back, the machine alerts the
// founder and they DECIDE TOGETHER: this panel shows the reply, the context it joins to (which pipeline /
// lead / run), and the machine's SUGGESTED next move — and hands the founder the choice. It NEVER sends
// or auto-replies: every action here routes the founder to where they act (reply by hand, route it into
// the pipeline, set it aside). The suggested move is a suggestion the founder decides WITH, never an
// action the machine takes. Nothing crosses the wall from this surface.
//
// Opaque content surface (opaque-content-surfaces rule) — the founder reads the reply here, so it is a
// solid panel, never glass. Lives on the shared tokens (light ground, monochrome zinc, semantic accent
// only). The reply is the one thing worth accenting: it is a warm lead, live, needing follow-through.

import { MessageSquareReply, CornerUpLeft, Route, Archive, X } from "lucide-react";
import type { ReplyAlert } from "@/types";
import "@/styles/decide-together.css";

export function DecideTogetherPanel({
  alert,
  onReplyByHand,
  onRouteIntoPipeline,
  onSetAside,
  onClose,
}: {
  alert: ReplyAlert;
  // The founder's decide-together choices. Each ROUTES the founder to where they act — none of them
  // sends from this panel. Route-into-pipeline records the reply against its pipeline (still gates on
  // anything outward); set-aside marks it handled; reply-by-hand opens the founder's own composer.
  onReplyByHand: (alert: ReplyAlert) => void;
  onRouteIntoPipeline: (alert: ReplyAlert) => void;
  onSetAside: (alert: ReplyAlert) => void;
  onClose: () => void;
}) {
  const { reply, context, suggestedMove } = alert;
  const who = reply.from || context.from || "someone";
  const where = context.pipelineName;

  return (
    <aside className="decide-together" role="dialog" aria-label="A reply came back — decide together" aria-modal="false">
      <header className="decide-together-head">
        <div className="decide-together-head-title">
          <MessageSquareReply size={16} />
          <strong>A reply came back</strong>
        </div>
        <button className="decide-together-close" onClick={onClose} type="button" aria-label="Close">
          <X size={15} />
        </button>
      </header>

      <div className="decide-together-body">
        {/* The reply itself — what came back and who from. The one thing worth accenting: a warm lead. */}
        <section className="decide-together-reply">
          <div className="decide-together-reply-from">{who}</div>
          {reply.body ? (
            <blockquote className="decide-together-reply-body">{reply.body}</blockquote>
          ) : (
            <p className="decide-together-reply-empty">A reply landed — no text captured. Open the thread to read it.</p>
          )}
        </section>

        {/* The context it joins to — which pipeline / lead / run. Honestly blank when it joins nothing. */}
        {where || context.joinKey ? (
          <section className="decide-together-context">
            <span className="decide-together-context-label">On</span>
            <span className="decide-together-context-value">
              {where ?? "a pipeline this reply belongs to"}
            </span>
          </section>
        ) : (
          <section className="decide-together-context">
            <span className="decide-together-context-label">Context</span>
            <span className="decide-together-context-value decide-together-context-muted">
              This reply didn't join to a known pipeline — decide where it belongs.
            </span>
          </section>
        )}

        {/* The machine's suggested move — a suggestion the founder decides WITH, never taken. */}
        <section className="decide-together-suggested">
          <span className="decide-together-suggested-label">The machine suggests</span>
          <p className="decide-together-suggested-move">{suggestedMove}</p>
        </section>
      </div>

      {/* The founder's choice. Nothing here sends — each routes the founder to where they act. */}
      <footer className="decide-together-actions">
        <button type="button" className="decide-together-action is-primary" onClick={() => onReplyByHand(alert)}>
          <CornerUpLeft size={14} /> Reply by hand
        </button>
        <button type="button" className="decide-together-action" onClick={() => onRouteIntoPipeline(alert)}>
          <Route size={14} /> Route into pipeline
        </button>
        <button type="button" className="decide-together-action" onClick={() => onSetAside(alert)}>
          <Archive size={14} /> Set aside
        </button>
      </footer>
      <p className="decide-together-guarantee">Nothing is sent until you say so. The machine never replies on its own.</p>
    </aside>
  );
}
