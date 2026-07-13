import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Gauge, Minus, Plus, RotateCcw } from "lucide-react";
import {
  getReallocationTunables,
  saveReallocationTunables,
  type ReallocationTunables,
} from "@/api";
import { Button } from "@/components/ui/button";
import "@/styles/aggressiveness-tunables.css";

// AggressivenessTunables — how fast the machine leans on what's working, and what always-on is allowed
// to spend. LEARN reallocation runs on three taste-call numbers that sit beside the path-ranking leaning
// (SignalWeights): none is derivable, all three are the founder's judgment, and none is ever a hardcoded
// policy buried in the loop. This surface makes them visible and editable, and nothing here sends,
// publishes, or spends on its own — it only sets the ceilings the machine reallocates and probes within.
//
// Three DISTINCT controls, not a slider list — each has its own unit and its own real cost:
//   observationFloor  — how many measured wins a motion needs before it moves the ranking at all
//                       (higher = slower to lean, but no lucky send ever reallocates). A small count.
//   tiltClamp         — how far a single proven motion may bend the ranking away from your saved leaning
//                       (your leaning is always the base and can never be inverted). A bounded percentage.
//   dailyProbeCap     — the hard daily ceiling on paid measurement checks (a geogrid scan runs 50–162
//                       credits), so always-on can never quietly run up a bill. A credit count.

type Bound = { min: number; max: number };

// Each knob's shape: how it reads, how it's bounded, and — the part that earns the surface — what
// turning it actually costs the machine, in the founder's words. Bounds mirror the store's clamps
// (reallocation-tunables-store.mjs) so the UI can never propose a value the backend would silently reject.
type Knob = {
  key: string;
  label: string;
  // What the number governs, plain.
  ask: string;
  // The tradeoff, named — so the founder tunes toward a consequence, not a decimal.
  cost: { lower: string; higher: string };
  bound: Bound;
  step: number;
  // How the live value reads back: a bare count, or a percentage of the saved leaning.
  format: "count" | "percent";
  unit?: string;
};

const KNOBS: Knob[] = [
  {
    key: "observationFloor",
    label: "Proof before it leans",
    ask: "How many measured wins a motion needs before the machine tilts the ranking toward it at all.",
    cost: {
      lower: "Leans faster on early signal — one strong week can reshape the plan.",
      higher: "Waits for a real pattern — no lucky send ever moves the ranking.",
    },
    bound: { min: 0, max: 30 },
    step: 1,
    format: "count",
    unit: "wins",
  },
  {
    key: "tiltClamp",
    label: "How hard it can lean",
    ask: "The furthest a single proven motion may bend the ranking away from your saved leaning.",
    cost: {
      lower: "Keeps your leaning mostly in charge — proof nudges, never takes over.",
      higher: "Lets what's working pull harder — the machine reshapes around it faster.",
    },
    // The store accepts (0, 0.9]; 0 disables reallocation entirely (honest, allowed).
    bound: { min: 0, max: 0.9 },
    step: 0.05,
    format: "percent",
  },
  {
    key: "dailyProbeCap",
    label: "Daily spend on checking",
    ask: "The hard daily ceiling on paid measurement checks — a rank or map scan runs 50–162 credits.",
    cost: {
      lower: "Spends little — measures the few motions that matter most.",
      higher: "Measures more, more often — always-on costs more each day.",
    },
    bound: { min: 0, max: 200 },
    step: 5,
    format: "count",
    unit: "credits",
  },
];

// Read a value back in its own unit: a clamp is a percentage of the base leaning, everything else a
// bare count. Tabular-friendly, holds still, never a raw 0.35.
function readValue(knob: Knob, value: number): string {
  if (knob.format === "percent") return `up to ${Math.round(value * 100)}%`;
  return `${value}${knob.unit ? ` ${knob.unit}` : ""}`;
}

function clamp(knob: Knob, value: number): number {
  const v = Math.min(knob.bound.max, Math.max(knob.bound.min, value));
  // Keep the count knobs integer; the store floors them anyway, but the UI shouldn't show 5.0001.
  return knob.format === "count" ? Math.round(v) : Math.round(v * 100) / 100;
}

export function AggressivenessTunables() {
  const [tunables, setTunables] = useState<ReallocationTunables | null>(null);
  const [defaults, setDefaults] = useState<ReallocationTunables | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
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
  }, []);

  const dirty = useMemo(() => {
    if (!tunables || !defaults) return false;
    return KNOBS.some(
      (k) => Math.abs((tunables[k.key] ?? 0) - (defaults[k.key] ?? 0)) > 1e-9,
    );
  }, [tunables, defaults]);

  const setOne = useCallback((knob: Knob, value: number) => {
    setTunables((t) => (t ? { ...t, [knob.key]: clamp(knob, value) } : t));
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
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [tunables]);

  const reset = useCallback(async () => {
    if (!defaults) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await saveReallocationTunables(defaults);
      setTunables(res.tunables);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [defaults]);

  return (
    <div className="cs at">
      <div className="cs-eyebrow">Reallocation limits</div>
      <h1 className="cs-title">How fast the machine leans on what's working</h1>
      <p className="cs-sub">
        As motions earn wins, the machine tilts its own ranking toward them and measures the rest to see
        what's landing. These three numbers set how <b>eager</b> it is and what it may <b>spend</b> doing
        it — taste calls, yours to hold. Nothing here sends or spends on its own; it only draws the lines
        the machine works inside.
      </p>

      {tunables ? (
        <>
          <div className="at-list">
            {KNOBS.map((knob) => {
              const value = tunables[knob.key] ?? 0;
              const isDefault = defaults
                ? Math.abs(value - (defaults[knob.key] ?? 0)) <= 1e-9
                : true;
              const atMin = value <= knob.bound.min + 1e-9;
              const atMax = value >= knob.bound.max - 1e-9;
              const span = knob.bound.max - knob.bound.min;
              const fill = span > 0 ? (value - knob.bound.min) / span : 0;
              return (
                <div key={knob.key} className="at-row">
                  <div className="at-row-head">
                    <span className="at-label">{knob.label}</span>
                    <span className="at-value" aria-live="polite">
                      {readValue(knob, value)}
                      {isDefault && <span className="at-default-tag">default</span>}
                    </span>
                  </div>
                  <div className="at-ask">{knob.ask}</div>

                  <div className="at-control">
                    <button
                      type="button"
                      className="at-step"
                      disabled={busy || atMin}
                      onClick={() => setOne(knob, value - knob.step)}
                      aria-label={`Lower ${knob.label}`}
                    >
                      <Minus size={13} />
                    </button>
                    <div className="at-track" aria-hidden="true">
                      <div className="at-track-fill" style={{ width: `${fill * 100}%` }} />
                    </div>
                    <button
                      type="button"
                      className="at-step"
                      disabled={busy || atMax}
                      onClick={() => setOne(knob, value + knob.step)}
                      aria-label={`Raise ${knob.label}`}
                    >
                      <Plus size={13} />
                    </button>
                  </div>

                  <div className="at-cost">
                    <span className="at-cost-end">{knob.cost.lower}</span>
                    <span className="at-cost-end at-cost-hi">{knob.cost.higher}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="at-actions">
            <Button
              variant="ghost"
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
                "Save these limits"
              )}
            </Button>
            <Button
              variant="ghost"
              className="cs-btn"
              disabled={busy || !dirty}
              onClick={() => void reset()}
              type="button"
              title="Return to the stated defaults"
            >
              <RotateCcw size={13} /> Reset to defaults
            </Button>
          </div>
        </>
      ) : (
        <div className="at-loading">
          <Gauge size={15} /> Reading your current limits…
        </div>
      )}

      {error && <div className="cs-error">{error}</div>}
    </div>
  );
}
