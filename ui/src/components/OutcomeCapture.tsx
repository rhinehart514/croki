import { useState } from "react";
import { Check } from "lucide-react";
import { recordFounderOutcome } from "@/api";
import "@/styles/outcome-capture.css";

// The manual loop-closer. After a run reaches the gate (or finishes), the founder spends ~20 seconds
// saying what actually happened and what the market taught them. That founder-entered outcome is enough
// for alpha — it writes a real Result + Learning and never sends, publishes, or runs anything.
//
// Founder language only: "what happened?" as quick chips, "what did the market teach us?" as free text.
// No pipeline / node / channel / graph vocabulary reaches this surface.

type Props = {
  projectId: string;
  runId: string;
  onDone: () => void;
};

// Each chip is one plain-language thing that can come back from a run. `unit` present = the founder can
// optionally drop in a small count (how many replies, how many calls). Silence and "other" carry no count.
type OutcomeOption = { id: string; label: string; unit: string | null };

const OUTCOMES: OutcomeOption[] = [
  { id: "replies", label: "Got replies", unit: "replies" },
  { id: "calls", label: "Booked calls", unit: "calls" },
  { id: "paid", label: "Got paid", unit: "deals" },
  { id: "ignored", label: "Got ignored", unit: null },
  { id: "objections", label: "Got objections", unit: "objections" },
  { id: "other", label: "Something else", unit: null },
];

export default function OutcomeCapture({ projectId, runId, onDone }: Props) {
  // Which chips the founder picked, and any optional counts they typed against them.
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [learned, setLearned] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      // One Result per thing that happened; the single lesson rides on the first call so exactly one
      // Learning lands. Each call joins back to this run and only records what already happened.
      for (let i = 0; i < chosen.length; i++) {
        const o = chosen[i];
        const raw = counts[o.id]?.trim();
        const n = raw ? Number(raw) : NaN;
        const happened =
          o.unit && Number.isFinite(n) ? { label: o.label, count: n } : o.label;
        await recordFounderOutcome(projectId, {
          runId,
          happened,
          ...(i === 0 && lesson ? { learned: lesson } : {}),
        });
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that. Try again.");
      setSaving(false);
    }
  };

  return (
    <section className="oc" aria-label="Record what happened">
      <header className="oc-head">
        <h2 className="oc-title">What happened?</h2>
        <p className="oc-sub">Close the loop so the next run starts smarter. Takes a few seconds.</p>
      </header>

      <div className="oc-chips" role="group" aria-label="What happened on this run">
        {OUTCOMES.map((o) => {
          const on = picked.has(o.id);
          return (
            <div key={o.id} className={`oc-chip-wrap${on ? " is-on" : ""}`}>
              <button
                type="button"
                className={`oc-chip${on ? " is-on" : ""}`}
                aria-pressed={on}
                onClick={() => toggle(o.id)}
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
        <button type="button" className="oc-save" onClick={submit} disabled={!canSubmit}>
          {saving ? "Saving…" : "Save what happened"}
        </button>
      </div>
    </section>
  );
}
