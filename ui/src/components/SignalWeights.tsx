import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, RotateCcw, Scale } from "lucide-react";
import { getSignalWeights, saveSignalWeights, type SignalWeights as Weights } from "@/api";
import "@/styles/signal-weights.css";

// SignalWeights — the founder's strategic judgment about which go-to-market paths are worth trying
// FIRST. When your crew ranks the paths it could take, it scores each one on seven things and adds them
// up. How much each of those seven MATTERS is a judgment, not a fact — and it's yours. Lean the ranking
// toward what's already proven, or toward the biggest upside; toward what's fastest to test, or toward
// what fits you best. This only reorders the crew's suggestions; it sends, publishes, and charges nothing.
//
// Presented as a set of leanings, not a spreadsheet: each signal is a plain-language question with a
// slider and a live bar showing how much weight it carries relative to the others. Reset returns to the
// balanced defaults the product ships with.

// The seven ranking signals, each phrased as what it MEANS to the founder — never the store's camelCase.
const SIGNALS: { key: string; label: string; ask: string }[] = [
  { key: "evidenceStrength", label: "Proof it'll work", ask: "How much real evidence backs this path — grounded facts over hunches." },
  { key: "productReadiness", label: "The product's ready", ask: "Whether what you've built can actually deliver on this path today." },
  { key: "channelReachability", label: "You can reach them", ask: "Whether there's a real, open way to reach the people this path targets." },
  { key: "measurementReadiness", label: "You'll see the result", ask: "Whether you can actually tell if this path worked." },
  { key: "speedToTest", label: "Fast to try", ask: "How quickly you could get a real signal back from this path." },
  { key: "upside", label: "Big if it lands", ask: "How much this path is worth if it works out." },
  { key: "founderFit", label: "It fits you", ask: "Whether this path plays to how you actually work and what you're good at." },
];

export function SignalWeights() {
  const [weights, setWeights] = useState<Weights | null>(null);
  const [defaults, setDefaults] = useState<Weights | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getSignalWeights()
      .then(({ weights, defaults }) => { if (!live) return; setWeights(weights); setDefaults(defaults); })
      .catch((err) => { if (live) setError(err instanceof Error ? err.message : String(err)); });
    return () => { live = false; };
  }, []);

  // The relative share each signal carries — how the bars read. Normalized against the sum so a founder
  // sees "this one matters twice as much as that one", which is the real decision, not the raw decimal.
  const total = useMemo(
    () => (weights ? SIGNALS.reduce((s, sig) => s + (weights[sig.key] ?? 0), 0) : 0),
    [weights],
  );

  const dirty = useMemo(() => {
    if (!weights || !defaults) return false;
    return SIGNALS.some((sig) => Math.abs((weights[sig.key] ?? 0) - (defaults[sig.key] ?? 0)) > 1e-9);
  }, [weights, defaults]);

  const setOne = useCallback((key: string, value: number) => {
    setWeights((w) => (w ? { ...w, [key]: value } : w));
    setSaved(false);
  }, []);

  const save = useCallback(async () => {
    if (!weights) return;
    setBusy(true); setError(null); setSaved(false);
    try {
      const res = await saveSignalWeights(weights);
      setWeights(res.weights);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [weights]);

  const reset = useCallback(async () => {
    if (!defaults) return;
    setBusy(true); setError(null); setSaved(false);
    try {
      const res = await saveSignalWeights(defaults);
      setWeights(res.weights);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [defaults]);

  return (
    <div className="cs sw">
      <div className="cs-eyebrow">Path ranking</div>
      <h1 className="cs-title">What makes a path worth trying first</h1>
      <p className="cs-sub">
        When your crew lays out the ways it could go to market, it puts the strongest ones first. What
        counts as strongest is <b>your</b> call. Lean the ranking toward proof, or toward upside; toward
        what's fast to test, or what fits you best. This only reorders suggestions — it never sends anything.
      </p>

      {weights ? (
        <>
          <div className="sw-list">
            {SIGNALS.map((sig) => {
              const value = weights[sig.key] ?? 0;
              const share = total > 0 ? value / total : 0;
              return (
                <div key={sig.key} className="sw-row">
                  <div className="sw-row-head">
                    <span className="sw-label">{sig.label}</span>
                    <span className="sw-share">{Math.round(share * 100)}% of the call</span>
                  </div>
                  <div className="sw-ask">{sig.ask}</div>
                  <div className="sw-bar-track" aria-hidden="true">
                    <div className="sw-bar-fill" style={{ width: `${Math.min(100, share * 100 * 2)}%` }} />
                  </div>
                  <input
                    className="sw-slider"
                    type="range"
                    min={0}
                    max={0.5}
                    step={0.01}
                    value={value}
                    onChange={(e) => setOne(sig.key, Number(e.target.value))}
                    aria-label={`How much "${sig.label}" matters`}
                  />
                </div>
              );
            })}
          </div>

          <div className="sw-actions">
            <button
              className="cs-btn primary"
              disabled={busy || !dirty}
              onClick={() => void save()}
              type="button"
            >
              {saved && !dirty ? <><Check size={14} /> Saved</> : busy ? "Saving…" : "Save your leaning"}
            </button>
            <button
              className="cs-btn"
              disabled={busy || !dirty}
              onClick={() => void reset()}
              type="button"
              title="Return to the balanced default"
            >
              <RotateCcw size={13} /> Reset to balanced
            </button>
          </div>
        </>
      ) : (
        <div className="sw-loading"><Scale size={15} /> Reading your current leaning…</div>
      )}

      {error && <div className="cs-error">{error}</div>}
    </div>
  );
}
