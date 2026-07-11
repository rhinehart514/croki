import { useState } from "react";
import { Check, Lock } from "lucide-react";
import { recordFounderOutcome } from "@/api";
import "@/styles/outcome-capture.css";

// The payoff tail. After a run reaches the gate (or finishes), the founder spends ~20 seconds saying
// what actually came back — and, unlike before, that isn't swallowed into a faint corner. When there's a
// real win to log, saving flips this panel into a RECEIPT that lands and holds: the mission reads as
// completed, the numbers that came back stand in tabular figures, and the lesson the market taught is
// stamped underneath. It's the one warm moment in the loop — earned, never fabricated: a run with nothing
// but silence to report still saves honestly and never dresses up as a celebration.
//
// Founder language only: "what came back?" as quick chips, "what did the market teach us?" as free text.
// No pipeline / node / channel / graph vocabulary reaches this surface.

type Props = {
  projectId: string;
  runId: string;
  onDone: () => void;
  // The mission this run was chasing, in the founder's own words ("Your first 10 estate-sale clients") —
  // shown completing on the receipt so the payoff names the goal, not a generic "done". Optional: absent,
  // the receipt still lands, just without the mission line.
  missionLabel?: string;
};

// Each chip is one plain-language thing that can come back from a run. `unit` present = the founder can
// optionally drop in a small count (how many replies, how many calls). Silence and "other" carry no count.
// `win` marks the outcomes that are a real result worth a moment — the receipt only celebrates these; a
// run that only got ignored lands as an honest, quiet record instead of a false win.
type OutcomeOption = { id: string; label: string; unit: string | null; win: boolean };

const OUTCOMES: OutcomeOption[] = [
  { id: "replies", label: "Got replies", unit: "replies", win: true },
  { id: "calls", label: "Booked calls", unit: "calls", win: true },
  { id: "paid", label: "Got paid", unit: "deals", win: true },
  { id: "ignored", label: "Got ignored", unit: null, win: false },
  { id: "objections", label: "Got objections", unit: "objections", win: false },
  { id: "other", label: "Something else", unit: null, win: false },
];

// What actually landed, as the receipt reads it back: the picked outcome, its optional count, and whether
// it counts as a win. Held in state after save so the receipt survives without a re-fetch.
type Landed = { label: string; count: number | null; win: boolean };

export default function OutcomeCapture({ projectId, runId, onDone, missionLabel }: Props) {
  // Which chips the founder picked, and any optional counts they typed against them.
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [learned, setLearned] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Once saved, the panel becomes the receipt. Null while the founder is still logging.
  const [landed, setLanded] = useState<{ items: Landed[]; lesson: string } | null>(null);

  const toggle = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setCount = (id: string, raw: string) => {
    // Digits only — a small, forgiving count field, never a required one.
    const clean = raw.replace(/[^\d]/g, "");
    setCounts((prev) => ({ ...prev, [id]: clean }));
  };

  const canSubmit = picked.size > 0 && !saving;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const chosen = OUTCOMES.filter((o) => picked.has(o.id));
      const lesson = learned.trim();
      const items: Landed[] = [];
      // One Result per thing that happened; the single lesson rides on the first call so exactly one
      // Learning lands. Each call joins back to this run and only records what already happened.
      for (let i = 0; i < chosen.length; i++) {
        const o = chosen[i];
        const raw = counts[o.id]?.trim();
        const n = raw ? Number(raw) : NaN;
        const count = o.unit && Number.isFinite(n) ? n : null;
        const happened = count !== null ? { label: o.label, count } : o.label;
        await recordFounderOutcome(projectId, {
          runId,
          happened,
          ...(i === 0 && lesson ? { learned: lesson } : {}),
        });
        items.push({ label: o.label, count, win: o.win });
      }
      // The record is banked — now let it land as a receipt instead of vanishing on onDone().
      setLanded({ items, lesson });
      setSaving(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that. Try again.");
      setSaving(false);
    }
  };

  // ─── The receipt — what came back, held ─────────────────────────────────────
  // A real win (a reply, a call, a deal) makes the mission read complete and the panel warm; a run that
  // only got silence lands the same record, plainly, with no celebration it didn't earn.
  if (landed) {
    const hasWin = landed.items.some((it) => it.win);
    return (
      <section className={`oc-receipt${hasWin ? " is-win" : ""}`} aria-label="What came back" data-testid="joined-outcome">
        <div className="oc-receipt-crown" aria-hidden="true">
          <span className="oc-receipt-seal">
            <Check />
          </span>
        </div>
        <header className="oc-receipt-head">
          <p className="oc-receipt-eyebrow">{hasWin ? "The mission landed" : "Logged — what came back"}</p>
          {missionLabel ? <h2 className="oc-receipt-mission">{missionLabel}</h2> : null}
        </header>

        <ul className="oc-receipt-lines">
          {landed.items.map((it) => (
            <li className={`oc-receipt-line${it.win ? " is-win" : ""}`} key={it.label}>
              <span className="oc-receipt-tick" aria-hidden="true">
                <Check />
              </span>
              <span className="oc-receipt-what">{it.label}</span>
              {it.count !== null ? <span className="oc-receipt-count tnum">{it.count}</span> : null}
            </li>
          ))}
        </ul>

        {landed.lesson ? (
          <div className="oc-receipt-lesson">
            <span className="oc-receipt-lesson-label">What the market taught you</span>
            <p className="oc-receipt-lesson-text">{landed.lesson}</p>
          </div>
        ) : null}

        <p className="oc-receipt-foot">
          <Lock aria-hidden="true" />
          Kept for your crew — the next run starts from this.
        </p>

        <div className="oc-actions">
          <button
            type="button"
            className="oc-save oc-receipt-done"
            onClick={onDone}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              onDone();
            }}
          >
            Done
          </button>
        </div>
      </section>
    );
  }

  // ─── The log — what came back, in ~20 seconds ───────────────────────────────
  return (
    <section className="oc" aria-label="Record what came back">
      <header className="oc-head">
        <h2 className="oc-title">What came back?</h2>
        <p className="oc-sub">Close the loop so the next run starts smarter. Takes a few seconds.</p>
      </header>

      <div className="oc-chips" role="group" aria-label="What came back on this run">
        {OUTCOMES.map((o) => {
          const on = picked.has(o.id);
          return (
            <div key={o.id} className={`oc-chip-wrap${on ? " is-on" : ""}`}>
              <button
                type="button"
                className={`oc-chip${on ? " is-on" : ""}`}
                aria-pressed={on}
                onClick={() => toggle(o.id)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  toggle(o.id);
                }}
              >
                <span className="oc-chip-tick" aria-hidden="true">
                  {on ? <Check /> : null}
                </span>
                {o.label}
              </button>
              {on && o.unit ? (
                <label className="oc-count">
                  <input
                    className="oc-count-input"
                    inputMode="numeric"
                    placeholder="0"
                    value={counts[o.id] ?? ""}
                    onChange={(e) => setCount(o.id, e.target.value)}
                    aria-label={`How many ${o.unit}`}
                  />
                  <span className="oc-count-unit">{o.unit}</span>
                </label>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="oc-learned">
        <label className="oc-learned-label" htmlFor="oc-learned-input">
          What did the market teach us?
        </label>
        <textarea
          id="oc-learned-input"
          className="oc-learned-input"
          placeholder="Optional — the one thing you'd tell yourself before the next run."
          rows={3}
          value={learned}
          onChange={(e) => setLearned(e.target.value)}
        />
      </div>

      {error ? <p className="oc-error" role="alert">{error}</p> : null}

      <div className="oc-actions">
        <button type="button" className="oc-skip" onClick={onDone} disabled={saving}>
          Skip
        </button>
        <button
          type="button"
          className="oc-save"
          onClick={submit}
          disabled={!canSubmit}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            if (canSubmit) void submit();
          }}
        >
          {saving ? "Saving…" : "Log what came back"}
        </button>
      </div>
    </section>
  );
}
