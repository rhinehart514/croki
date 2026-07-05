import { GoalBar, Beliefs, WhatHappened, Learnings, Upgrades } from "@/components/Cockpit";
import type { CockpitState } from "@/api";
import "@/styles/cockpit.css";

// The Learn lens — the loop closing. It re-projects the SAME founder data the map is built on, but read
// as a story rather than a diagram: the goal you set, what you currently believe and how sure, what the
// last run actually returned, and the one thing the market taught you. Read-only; nothing here acts.
// Reuses the cockpit's own cards (and their honest empty states) so the language and craft stay identical
// across the surfaces. When no product is open yet, it says so plainly instead of faking a loop.
export function LearningsLens({ cockpit }: { cockpit: CockpitState | null }) {
  if (!cockpit) {
    return (
      <div className="ck learn-lens">
        <div className="ck-inner">
          <section className="ck-card">
            <h2 className="ck-card-title">What the market taught us</h2>
            <p className="ck-card-empty">
              Point Drover at a product and set a goal. As you make moves and record what comes back, the
              loop shows up here — what you believed, what happened, and what it changed.
            </p>
          </section>
        </div>
      </div>
    );
  }
  return (
    <div className="ck">
      <div className="ck-inner">
        <GoalBar goal={cockpit.goal} />
        <Beliefs bets={cockpit.bets} />
        <WhatHappened run={cockpit.latestRun} />
        <Learnings learnings={cockpit.learnings} />
        <Upgrades upgrades={cockpit.upgrades} />
      </div>
    </div>
  );
}
