import { HelpCircle, MessageSquare, Radar, ScrollText, Split, X } from "lucide-react";
import { CrewFace } from "@/components/crew/CrewFace";
import { humanizeRef } from "@/lib/agentPersona";
import type { ClarityObject, TeammatePosition } from "@/types";
import "@/styles/question-focus.css";

// QuestionFocus — the QUESTION-ALTITUDE sidecar (docs/production-direction/09). Focusing a pinned
// question expands its causal neighborhood in place: each teammate's distinct position (belief,
// uncertainty, recommendation, and "what would change my mind"), evidence kept distinct by stance, the
// unknowns beyond it, and the founder's stamped calls. Disagreement is preserved as SEPARATE branches —
// never a blended consensus (doc 05 §Disagreement is a feature).
//
// Everything shown is a projection over durable records; the current server omits the enrichment and the
// sidecar reads honest empties. The four primary actions (Ask the crew · Find evidence · Make the call ·
// Turn into a pipeline) route through the same composer channel every canvas → chat handoff uses —
// reversible, nothing sends. Answering a question is never approving execution (doc 06 §Founder decisions).

export type QuestionFocusProps = {
  question: ClarityObject;
  onClose: () => void;
  onOpenTeammate?: (ref: string) => void;
  onAskCrew: (question: ClarityObject) => void;
  onFindEvidence: (question: ClarityObject) => void;
  onMakeCall: (question: ClarityObject) => void;
  onTurnIntoPipeline: (question: ClarityObject) => void;
};

function PositionCard({ pos, onOpenTeammate }: { pos: TeammatePosition; onOpenTeammate?: (ref: string) => void }) {
  const who = humanizeRef(pos.ref);
  return (
    <div className="qfocus-pos">
      <div className="qfocus-pos-head">
        <button
          type="button"
          className="qfocus-pos-face"
          title={`Open ${who}'s profile`}
          onClick={() => onOpenTeammate?.(pos.ref)}
        >
          <CrewFace agentRef={pos.ref} size={26} />
        </button>
        <span className="qfocus-pos-who">{who}</span>
      </div>
      <p className="qfocus-pos-claim">{pos.claim}</p>
      {pos.uncertainty ? <p className="qfocus-pos-line"><b>Unsure:</b> {pos.uncertainty}</p> : null}
      {pos.recommendation ? <p className="qfocus-pos-line"><b>Would do next:</b> {pos.recommendation}</p> : null}
      {pos.falsifier ? <p className="qfocus-pos-line"><b>Would change my mind:</b> {pos.falsifier}</p> : null}
      {pos.disagreesWith?.length ? (
        <span className="qfocus-pos-conflict">
          <Split size={12} /> disagrees with {pos.disagreesWith.map((r) => humanizeRef(r)).join(", ")}
        </span>
      ) : null}
    </div>
  );
}

export function QuestionFocus({
  question, onClose, onOpenTeammate, onAskCrew, onFindEvidence, onMakeCall, onTurnIntoPipeline,
}: QuestionFocusProps) {
  const positions = question.positions ?? [];
  const evidence = question.evidence ?? [];
  const supporting = evidence.filter((e) => e.stance === "supporting");
  const challenging = evidence.filter((e) => e.stance === "challenging");
  const unknowns = question.unknowns ?? [];
  const decisions = question.decisions ?? [];

  return (
    <aside className="qfocus" role="complementary" aria-label="Focused question">
      <div className="qfocus-head">
        <div className="qfocus-head-main">
          <span className="qfocus-eyebrow"><HelpCircle size={12} /> Open question</span>
          <p className="qfocus-text">{question.text}</p>
        </div>
        <button type="button" className="qfocus-close" aria-label="Close question focus" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <div className="qfocus-body">
        <section className="qfocus-sec">
          <div className="qfocus-slabel">What the crew thinks</div>
          {positions.length ? (
            positions.map((p, i) => <PositionCard key={`${p.ref}-${i}`} pos={p} onOpenTeammate={onOpenTeammate} />)
          ) : (
            <p className="qfocus-empty">No crew positions recorded yet. Ask the crew and each teammate takes its own stance — with its evidence and what would change its mind, kept distinct.</p>
          )}
        </section>

        <section className="qfocus-sec">
          <div className="qfocus-slabel">Evidence</div>
          {supporting.length || challenging.length ? (
            <>
              {supporting.map((e) => (
                <div className="qfocus-ev support" key={e.id}>
                  <span className="qfocus-ev-tag">for</span>
                  <span>{e.claim}{e.ref ? <> <span className="qfocus-ev-ref">{e.ref}</span></> : null}</span>
                </div>
              ))}
              {challenging.map((e) => (
                <div className="qfocus-ev challenge" key={e.id}>
                  <span className="qfocus-ev-tag">against</span>
                  <span>{e.claim}{e.ref ? <> <span className="qfocus-ev-ref">{e.ref}</span></> : null}</span>
                </div>
              ))}
            </>
          ) : (
            <p className="qfocus-empty">No evidence gathered for or against this yet.</p>
          )}
        </section>

        <section className="qfocus-sec">
          <div className="qfocus-slabel">Still unknown</div>
          {unknowns.length ? (
            unknowns.map((u, i) => <div className="qfocus-unknown" key={`u-${i}`}><span className="mk">?</span>{u}</div>)
          ) : (
            <p className="qfocus-empty">Nothing flagged as unknown yet.</p>
          )}
        </section>

        <section className="qfocus-sec">
          <div className="qfocus-slabel">Your calls</div>
          {decisions.length ? (
            decisions.map((d) => (
              <div className="qfocus-receipt" key={d.id}>
                <div className="qfocus-receipt-w">{d.wording}</div>
                <div className="qfocus-receipt-m">{d.kind} · {new Date(d.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>
              </div>
            ))
          ) : (
            <p className="qfocus-empty">You haven't made a call on this yet. Answering never sends anything — it only settles the direction.</p>
          )}
        </section>
      </div>

      <div className="qfocus-acts">
        <button type="button" className="qfocus-act" onClick={() => onAskCrew(question)}>
          <MessageSquare size={14} /> Ask the crew
        </button>
        <button type="button" className="qfocus-act" onClick={() => onFindEvidence(question)}>
          <Radar size={14} /> Find evidence
        </button>
        <button type="button" className="qfocus-act" onClick={() => onMakeCall(question)}>
          <ScrollText size={14} /> Make the call
        </button>
        <button type="button" className="qfocus-act is-primary" onClick={() => onTurnIntoPipeline(question)}>
          <Split size={14} /> Turn into a pipeline
        </button>
      </div>
    </aside>
  );
}
