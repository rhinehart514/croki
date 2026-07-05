import { ArrowRight, Loader2, ShieldAlert, Target } from "lucide-react";
import type { MoveProposal } from "@/api";
import "@/styles/move-proposals.css";

// Three moves, pick one. This replaces walking the market layer by layer: Claude researches enough to
// propose exactly three next moves, and the founder chooses the one to run. Each card shows what you'd
// be betting, how sure we are about it, the risk, and the literal thing to do. Founder language only —
// no "pipeline", "node", or "channel" leaks here.

const EVIDENCE_WORD: Record<MoveProposal["evidence"], string> = {
  observed: "we've seen it",
  researched: "we looked it up",
  guessed: "a hunch",
};

function Evidence({ value }: { value: MoveProposal["evidence"] }) {
  return (
    <span className={`mvp-ev ${value}`} title={`How sure we are: ${value}`}>
      {value} · {EVIDENCE_WORD[value]}
    </span>
  );
}

export function MoveProposals({
  moves,
  onPick,
  loading = false,
}: {
  moves: MoveProposal[] | null;
  onPick: (m: MoveProposal) => void;
  loading?: boolean;
}) {
  return (
    <div className="mvp">
      <div className="mvp-head">
        <div className="mvp-eyebrow">Three moves · pick one</div>
        <p className="mvp-lede">
          Claude researched enough to put three real next moves on the table. Each one shows what you'd
          be betting, how sure we are, and what could go wrong. Pick the one to run.
        </p>
      </div>

      {loading ? (
        <div className="mvp-state">
          <Loader2 size={15} className="mvp-spin" /> Working out your three best moves…
        </div>
      ) : !moves || moves.length === 0 ? (
        <div className="mvp-state">
          No moves yet. Once Claude has read your product and goal, three next moves land here to choose
          from.
        </div>
      ) : (
        <div className="mvp-list">
          {moves.map((m, i) => (
            <article className="mvp-card" key={i}>
              <div className="mvp-card-top">
                <span className="mvp-num">{i + 1}</span>
                <h3 className="mvp-stmt">{m.statement}</h3>
                <Evidence value={m.evidence} />
              </div>

              <dl className="mvp-facets">
                <div className="mvp-facet">
                  <dt><Target size={12} /> The bet</dt>
                  <dd>{m.bet}</dd>
                </div>
                <div className="mvp-facet">
                  <dt><ShieldAlert size={12} /> The risk</dt>
                  <dd>{m.risk}</dd>
                </div>
              </dl>

              <button type="button" className="mvp-pick" onClick={() => onPick(m)}>
                <span className="mvp-pick-do">{m.action}</span>
                <ArrowRight size={15} className="mvp-pick-arrow" />
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
