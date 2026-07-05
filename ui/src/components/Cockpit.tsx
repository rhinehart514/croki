import {
  ArrowRight,
  Target,
  CircleCheck,
  Ban,
  ArrowUpRight,
  Lightbulb,
  Compass,
} from "lucide-react";
import type { CockpitState, Solidity, Sureness } from "@/api";
import "@/styles/cockpit.css";

// The cockpit — the five-primitive surface the founder actually lives in: Goal, Bet, Move, Run,
// Learning. The engine underneath is rich; none of that leaks here. The Best Next Move is the hero —
// a founder can open Drover, read one card, and act before understanding anything about how it works.
// Everything is founder language: no pipeline, graph, node, or channel words ever reach this screen.
// Every field renders an honest empty state — a null move, no bets yet, no run yet — never a faked
// number dressed as data.

// "How sure we are" — the four-word solidity scale, translated for the founder. Each carries a quiet
// tint so the eye can sort guessed from gated without reading, but stays near-monochrome.
const SOLIDITY_LABEL: Record<Solidity, string> = {
  guessed: "guessed",
  researched: "researched",
  observed: "observed",
  gated: "gated",
};

const SURE_LABEL: Record<Sureness, string> = {
  low: "low",
  medium: "medium",
  high: "high",
};

function SolidityTag({ solidity }: { solidity: Solidity }) {
  return (
    <span className={`ck-solidity ck-solidity-${solidity}`}>
      <span className="ck-solidity-dot" aria-hidden />
      {SOLIDITY_LABEL[solidity]}
    </span>
  );
}

// The hero. If there isn't enough state to propose a next action, say so plainly rather than inventing
// one — the honest null is itself information the founder can act on (point Drover at more truth).
// Exported so the canvas home can float the same Best Next Move as a hero card over the map, reusing
// the identical styling and data — one hero, two placements.
export function BestNextMove({
  move,
  onDoMove,
}: {
  move: CockpitState["bestMove"];
  onDoMove?: () => void;
}) {
  if (!move) {
    return (
      <section className="ck-hero ck-hero-empty">
        <div className="ck-hero-eyebrow">Best next move</div>
        <p className="ck-hero-emptytext">
          Not enough to call the next move yet. Set a goal and let Drover read your product, and the
          one thing to do next lands here.
        </p>
      </section>
    );
  }
  return (
    <section className="ck-hero">
      <div className="ck-hero-eyebrow">Best next move</div>
      <h1 className="ck-hero-headline">{move.headline}</h1>
      <p className="ck-hero-why">{move.why}</p>

      <div className="ck-hero-do">
        <div className="ck-hero-do-label">Do this today</div>
        <div className="ck-hero-do-action">{move.doToday}</div>
        <button type="button" className="ck-hero-do-btn" onClick={onDoMove}>
          Make this move
          <ArrowRight size={15} strokeWidth={2.25} />
        </button>
      </div>

      <div className="ck-hero-outcomes">
        <div className="ck-outcome ck-outcome-win">
          <div className="ck-outcome-head">
            <CircleCheck size={14} strokeWidth={2.25} />
            Win if
          </div>
          <div className="ck-outcome-body">{move.winIf}</div>
        </div>
        <div className="ck-outcome ck-outcome-kill">
          <div className="ck-outcome-head">
            <Ban size={14} strokeWidth={2.25} />
            Kill if
          </div>
          <div className="ck-outcome-body">{move.killIf}</div>
        </div>
      </div>

      <div className="ck-hero-upgrade">
        <ArrowUpRight size={14} strokeWidth={2.25} />
        <span>
          <span className="ck-hero-upgrade-label">If it works</span> {move.upgrade}
        </span>
      </div>
    </section>
  );
}

export function GoalBar({ goal }: { goal: CockpitState["goal"] }) {
  if (!goal) {
    return (
      <div className="ck-goal ck-goal-empty">
        <Target size={15} strokeWidth={2} />
        <span>No goal set yet — tell Drover what you're trying to make happen.</span>
      </div>
    );
  }
  const meta = [goal.target, goal.timeframe].filter(Boolean).join(" · ");
  return (
    <div className="ck-goal">
      <Target size={15} strokeWidth={2} className="ck-goal-icon" />
      <div className="ck-goal-main">
        <div className="ck-goal-text">{goal.text}</div>
        {(meta || goal.metric) && (
          <div className="ck-goal-meta">
            {goal.metric && <span className="ck-goal-metric">{goal.metric}</span>}
            {meta && <span>{meta}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

export function Beliefs({ bets }: { bets: CockpitState["bets"] }) {
  return (
    <section className="ck-card">
      <h2 className="ck-card-title">What we believe</h2>
      {bets.length === 0 ? (
        <p className="ck-card-empty">
          No bets yet. As Drover reads your product and the market, the beliefs it's acting on show up
          here — each tagged with how sure we are.
        </p>
      ) : (
        <ul className="ck-bets">
          {bets.map((bet, i) => (
            <li key={i} className="ck-bet">
              <div className="ck-bet-main">
                <div className="ck-bet-statement">{bet.statement}</div>
                {bet.basis && <div className="ck-bet-basis">{bet.basis}</div>}
              </div>
              <div className="ck-bet-sure">
                <SolidityTag solidity={bet.solidity} />
                <span className="ck-bet-sure-word">how sure: {SURE_LABEL[bet.sure]}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function fmt(n: number | null): string {
  if (n === null) return "—";
  return n.toLocaleString();
}

export function WhatHappened({ run }: { run: CockpitState["latestRun"] }) {
  return (
    <section className="ck-card">
      <h2 className="ck-card-title">What happened</h2>
      {!run ? (
        <p className="ck-card-empty">
          No run yet. Once you make a move and record what came back, the numbers land here.
        </p>
      ) : (
        <>
          <div className="ck-run">
            <div className="ck-run-cell">
              <div className="ck-run-num">{fmt(run.sent)}</div>
              <div className="ck-run-lbl">Sent</div>
            </div>
            <div className="ck-run-cell">
              <div className="ck-run-num">{fmt(run.replies)}</div>
              <div className="ck-run-lbl">Replies</div>
            </div>
            <div className="ck-run-cell">
              <div className="ck-run-num">{fmt(run.calls)}</div>
              <div className="ck-run-lbl">Calls</div>
            </div>
            <div className="ck-run-cell">
              <div className="ck-run-num">{fmt(run.paid)}</div>
              <div className="ck-run-lbl">Paid</div>
            </div>
            <div className="ck-run-cell ck-run-cell-rev">
              <div className="ck-run-num">
                {run.revenue === null ? "—" : `$${run.revenue.toLocaleString()}`}
              </div>
              <div className="ck-run-lbl">Revenue</div>
            </div>
          </div>
          {run.note && <p className="ck-run-note">{run.note}</p>}
        </>
      )}
    </section>
  );
}

export function Learnings({ learnings }: { learnings: CockpitState["learnings"] }) {
  return (
    <section className="ck-card">
      <h2 className="ck-card-title">What the market taught us</h2>
      {learnings.length === 0 ? (
        <p className="ck-card-empty">
          Nothing learned yet. After a run, the one thing the market told you lands here and sharpens
          the next move.
        </p>
      ) : (
        <ul className="ck-learnings">
          {learnings.map((l, i) => (
            <li key={i} className="ck-learning">
              <Lightbulb size={15} strokeWidth={2} className="ck-learning-icon" />
              <div className="ck-learning-main">
                <div className="ck-learning-statement">{l.statement}</div>
                <div className="ck-learning-meta">
                  <span className="ck-learning-sure">how sure: {SURE_LABEL[l.sure]}</span>
                  {l.action && <span className="ck-learning-action">{l.action}</span>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function Upgrades({ upgrades }: { upgrades: string[] }) {
  if (upgrades.length === 0) return null;
  return (
    <section className="ck-card">
      <h2 className="ck-card-title">Sharper than yesterday</h2>
      <ul className="ck-upgrades">
        {upgrades.map((u, i) => (
          <li key={i} className="ck-upgrade">
            <ArrowUpRight size={14} strokeWidth={2.25} className="ck-upgrade-icon" />
            {u}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Cockpit({
  state,
  onOpenMap,
  onDoMove,
}: {
  state: CockpitState | null;
  onOpenMap?: () => void;
  onDoMove?: () => void;
}) {
  if (!state) {
    return (
      <div className="ck">
        <div className="ck-inner">
          <section className="ck-hero ck-hero-empty">
            <div className="ck-hero-eyebrow">Best next move</div>
            <p className="ck-hero-emptytext">
              Point Drover at a product and tell it what you're trying to make happen. The one thing to
              do next lands right here.
            </p>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="ck">
      <div className="ck-inner">
        <GoalBar goal={state.goal} />
        <BestNextMove move={state.bestMove} onDoMove={onDoMove} />
        <Beliefs bets={state.bets} />
        <WhatHappened run={state.latestRun} />
        <Learnings learnings={state.learnings} />
        <Upgrades upgrades={state.upgrades} />

        {onOpenMap && (
          <button type="button" className="ck-disclose" onClick={onOpenMap}>
            <Compass size={14} strokeWidth={2} />
            Open the evidence, the runs, or the full map
          </button>
        )}
      </div>
    </div>
  );
}
