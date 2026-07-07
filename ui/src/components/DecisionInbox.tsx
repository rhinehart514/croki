// DecisionInbox — the one place every decision waiting on you gathers. The product pauses for you in
// several spots (a run staged at your gate, proposed changes to a pipeline, a set of directions to
// weigh, pipeline shapes to pick, a question mid-run, a run that stalled or died, a signal that just
// came in). Each used to sit on its own screen, so a run that reached your gate or died while you were
// looking elsewhere waited silently. This surface lists them all — across every product — with enough
// context to know what it is, and an Open that jumps you to where you actually decide it. It never
// decides anything itself: Open hands you to the real gate / review / inbox, exactly as before.

import { CircleCheck, GitPullRequestArrow, Lightbulb, Route, MessageCircleQuestion, OctagonAlert, CircleSlash, Inbox } from "lucide-react";
import type { PendingDecision, PendingDecisionKind } from "@/types";
import "@/styles/decision-inbox.css";

// Each kind, in founder words — what it is and the icon that reads it at a glance. No machine vocab.
const KIND_META: Record<PendingDecisionKind, { label: string; icon: typeof Inbox; accent: boolean }> = {
  gate: { label: "Ready for your approval", icon: CircleCheck, accent: true },
  proposal: { label: "Changes to review", icon: GitPullRequestArrow, accent: false },
  ideas: { label: "Directions to weigh", icon: Lightbulb, accent: false },
  candidates: { label: "Pipeline shapes to pick", icon: Route, accent: false },
  question: { label: "A question for you", icon: MessageCircleQuestion, accent: false },
  blocked: { label: "Blocked — needs you", icon: OctagonAlert, accent: false },
  failed: { label: "Stopped early", icon: CircleSlash, accent: false },
  signal: { label: "A signal to route", icon: Inbox, accent: false },
};

function relativeWhen(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m waiting`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h waiting`;
  return `${Math.round(hrs / 24)}d waiting`;
}

export function DecisionInbox({
  decisions,
  onOpen,
}: {
  decisions: PendingDecision[];
  onOpen: (decision: PendingDecision) => void;
}) {
  if (decisions.length === 0) {
    return (
      <div className="decision-inbox decision-inbox-empty">
        <CircleCheck className="decision-inbox-empty-glyph" />
        <p className="decision-inbox-empty-title">Nothing's waiting on you.</p>
        <p className="decision-inbox-empty-note">
          When a run reaches your gate, stalls, or a signal comes in — here or in any other product —
          it lands here so you never miss it.
        </p>
      </div>
    );
  }

  return (
    <ul className="decision-inbox">
      {decisions.map((d) => {
        const meta = KIND_META[d.kind];
        const Icon = meta.icon;
        const where = [d.projectName, d.pipelineName].filter(Boolean).join(" · ");
        return (
          <li key={d.id} className={`decision-row ${meta.accent ? "is-gate" : ""}`}>
            <span className={`decision-row-glyph ${meta.accent ? "is-gate" : ""}`}>
              <Icon size={15} />
            </span>
            <div className="decision-row-body">
              <div className="decision-row-head">
                <span className="decision-row-kind">{meta.label}</span>
                <span className="decision-row-when">{relativeWhen(d.waitingSince)}</span>
              </div>
              {d.title ? <p className="decision-row-title">{d.title}</p> : null}
              {d.summary ? <p className="decision-row-summary">{d.summary}</p> : null}
              {where ? <p className="decision-row-where">{where}</p> : null}
            </div>
            <button
              type="button"
              className="decision-row-open"
              onClick={() => onOpen(d)}
            >
              Open
            </button>
          </li>
        );
      })}
    </ul>
  );
}
