import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, RotateCcw, TrendingUp, CircleSlash, Activity } from "lucide-react";
import {
  getReallocation,
  getReallocationTunables,
  saveReallocationTunables,
  type ReallocationReceipt as Receipt,
  type ReallocationTunables as Tunables,
} from "@/api";
import "@/styles/reallocation.css";

// ReallocationReceipt — the Overdrive card for LEARN (Area 3). The machine reads which of your motions
// actually earned wins and quietly leans your next runs toward those shapes. This is the RECEIPT of that
// leaning, not a policy it hides from you: what it tilted, why, and drawn from which real outcomes — all
// overturnable. It also flags the motions that have drawn nothing so you can decide, in your own time,
// whether to keep them running. Nothing here is auto-killed and nothing sends; the machine proposes, you
// confirm in your batch.
//
// Beside the receipt sit the three knobs that decide HOW FAST the machine leans and what always-on costs:
// how many wins it needs before it tilts at all, how far a single tilt may move your ranking, and the hard
// daily cap on paid research probes. Taste calls, yours to tune — never hardcoded.

// The three tunables, each phrased as what it MEANS — never the store's camelCase.
const KNOBS: {
  key: string;
  label: string;
  ask: string;
  min: number;
  max: number;
  step: number;
  fmt: (n: number) => string;
}[] = [
  {
    key: "observationFloor",
    label: "Wins before it leans",
    ask: "How many real outcomes a motion needs before the machine tilts toward it — so one lucky reply never reshapes everything.",
    min: 1,
    max: 20,
    step: 1,
    fmt: (n) => `${Math.round(n)} win${Math.round(n) === 1 ? "" : "s"}`,
  },
  {
    key: "tiltClamp",
    label: "How hard it can lean",
    ask: "The ceiling on how far a single learned lean may move your ranking — your own weights always stay the anchor and can never be flipped.",
    min: 0,
    max: 0.9,
    step: 0.05,
    fmt: (n) => `${Math.round(n * 100)}% at most`,
  },
  {
    key: "dailyProbeCap",
    label: "Daily research budget",
    ask: "The hard cap on paid research probes a day (a rank-grid scan alone costs 50–162 credits) — the machine never spends past it.",
    min: 0,
    max: 100,
    step: 5,
    fmt: (n) => `${Math.round(n)} probes/day`,
  },
];

function outcomeLine(byKind: Record<string, number>): string {
  const parts = Object.entries(byKind ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([kind, n]) => `${n} ${kind}`);
  return parts.join(", ");
}

export function ReallocationReceipt() {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [tunables, setTunables] = useState<Tunables | null>(null);
  const [defaults, setDefaults] = useState<Tunables | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getReallocation()
      .then((r) => setReceipt(r))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(() => {
    let live = true;
    load();
    getReallocationTunables()
      .then(({ tunables, defaults }) => {
        if (!live) return;
        setTunables(tunables);
        setDefaults(defaults);
      })
      .catch((err) => {
        if (live) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      live = false;
    };
  }, [load]);

  const dirty = useMemo(() => {
    if (!tunables || !defaults) return false;
    return KNOBS.some((k) => Math.abs((tunables[k.key] ?? 0) - (defaults[k.key] ?? 0)) > 1e-9);
  }, [tunables, defaults]);

  const setKnob = useCallback((key: string, value: number) => {
    setTunables((t) => (t ? { ...t, [key]: value } : t));
    setSaved(false);
  }, []);

  const save = useCallback(async () => {
    if (!tunables) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await saveReallocationTunables(tunables);
      setTunables(res.tunables);
      setSaved(true);
      load(); // the receipt re-reads against the new floor/clamp
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [tunables, load]);

  const reset = useCallback(async () => {
    if (!defaults) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await saveReallocationTunables(defaults);
      setTunables(res.tunables);
      setSaved(true);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [defaults, load]);

  const working = receipt?.working ?? [];
  const starved = receipt?.starved ?? [];
  const hasSignal = working.length > 0 || starved.length > 0;

  return (
    <div className="cs ra">
      <div className="cs-eyebrow">What your outcomes are teaching the machine</div>
      <h1 className="cs-title">Where the wins are coming from</h1>
      <p className="cs-sub">
        The machine watches which of your motions actually earn wins and leans your next runs toward those
        shapes. Here's exactly what it leaned toward and why — yours to overturn. It never pauses or kills a
        motion on its own; a motion that's drawn nothing is flagged here for your call, not cut.
      </p>

      {receipt ? (
        hasSignal ? (
          <div className="ra-body">
            {working.length > 0 && (
              <section className="ra-section">
                <div className="ra-section-head">
                  <TrendingUp size={14} /> Earning wins — the machine is leaning here
                </div>
                <div className="ra-list">
                  {working.map((m) => (
                    <div key={m.motionRef ?? m.motionKind} className="ra-card ra-card-up">
                      <div className="ra-card-title">{m.motionKind}</div>
                      <div className="ra-card-detail">
                        {outcomeLine(m.outcomesByKind) || `${m.observed} measured`} — above this product's
                        average
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {receipt.applied && receipt.reasons?.length > 0 && (
              <section className="ra-section">
                <div className="ra-section-head">
                  <Activity size={14} /> What it tilted
                </div>
                <ul className="ra-reasons">
                  {receipt.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </section>
            )}

            {starved.length > 0 && (
              <section className="ra-section">
                <div className="ra-section-head">
                  <CircleSlash size={14} /> Drawing nothing — your call, not cut
                </div>
                <div className="ra-list">
                  {starved.map((m) => (
                    <div key={m.motionRef ?? m.motionKind} className="ra-card ra-card-flag">
                      <div className="ra-card-title">{m.motionKind}</div>
                      <div className="ra-card-detail">{m.reason}</div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : (
          <div className="ra-empty">
            Nothing measured yet. Once your motions start earning outcomes, the machine will show you which
            shapes are working here — and lean toward them.
          </div>
        )
      ) : (
        <div className="ra-empty">Reading what your outcomes have taught the machine…</div>
      )}

      <div className="ra-tune">
        <div className="ra-tune-head">How aggressively it leans</div>
        <p className="ra-tune-sub">
          These decide how fast the machine reallocates and what always-on costs. Taste calls — yours to
          tune.
        </p>
        {tunables ? (
          <>
            <div className="ra-knobs">
              {KNOBS.map((k) => {
                const value = tunables[k.key] ?? 0;
                return (
                  <div key={k.key} className="ra-knob">
                    <div className="ra-knob-head">
                      <span className="ra-knob-label">{k.label}</span>
                      <span className="ra-knob-value">{k.fmt(value)}</span>
                    </div>
                    <div className="ra-knob-ask">{k.ask}</div>
                    <input
                      className="ra-slider"
                      type="range"
                      min={k.min}
                      max={k.max}
                      step={k.step}
                      value={value}
                      onChange={(e) => setKnob(k.key, Number(e.target.value))}
                      aria-label={k.label}
                    />
                  </div>
                );
              })}
            </div>
            <div className="ra-actions">
              <button
                className="cs-btn primary"
                disabled={busy || !dirty}
                onClick={() => void save()}
                type="button"
              >
                {saved && !dirty ? (
                  <>
                    <Check size={14} /> Saved
                  </>
                ) : busy ? (
                  "Saving…"
                ) : (
                  "Save"
                )}
              </button>
              <button
                className="cs-btn"
                disabled={busy || !dirty}
                onClick={() => void reset()}
                type="button"
                title="Return to the shipped defaults"
              >
                <RotateCcw size={13} /> Reset
              </button>
            </div>
          </>
        ) : null}
      </div>

      {error && <div className="cs-error">{error}</div>}
    </div>
  );
}
