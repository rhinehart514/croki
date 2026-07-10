import { useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";

// The contextual boot state — never an anonymous spinner. When the workspace is resolving (initial
// load, or switching products) the founder watches a short, honest plan check off with a running clock,
// in the crew's voice, instead of a bare "Loading…". The steps are the real work the boot does:
// finding the workspace, reading its pipelines, and putting the crew on the canvas. The clock is real
// elapsed time; the steps advance on a gentle cadence so the surface is alive, and the last step stays
// active (never prematurely "done") until the real canvas replaces this whole surface.

type Step = { label: string; hint: string };

// Two register variants — a first cold boot reads differently than switching between products already
// grounded. Both stay in operator voice: the crew is getting your desk ready, you are not waiting on a
// machine.
const BOOT_STEPS: Step[] = [
  { label: "Finding your workspace", hint: "Locating the product you left open." },
  { label: "Reading your pipelines", hint: "Loading every motion and its last run." },
  { label: "Putting the crew on the canvas", hint: "Laying out the woven mission." },
];

const SWITCH_STEPS: Step[] = [
  { label: "Switching products", hint: "Setting down the last one, opening this one." },
  { label: "Reading its pipelines", hint: "Loading every motion and its last run." },
  { label: "Weaving the canvas", hint: "Laying out the crew and the shared objects." },
];

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`;
}

export function WorkspaceBooting({ productName, mode = "boot" }: {
  productName?: string | null;
  // "boot" = first cold load; "switch" = moving to another already-grounded product.
  mode?: "boot" | "switch";
}) {
  const steps = mode === "switch" ? SWITCH_STEPS : BOOT_STEPS;
  // The start time is stamped in the effect (never in render — Date.now() is impure), so the clock is
  // honest elapsed time from when this surface mounted.
  const started = useRef(0);
  const [elapsed, setElapsed] = useState(0);
  // The active step index. Advances on a gentle cadence so the plan reads as live progress, and holds
  // on the last step — the real canvas swaps this whole surface out the moment the graph is ready, so
  // we never fake a "done" the founder would see stall.
  const [active, setActive] = useState(0);

  useEffect(() => {
    started.current = Date.now();
    const clock = window.setInterval(() => setElapsed(Date.now() - started.current), 200);
    // Advance through the earlier steps, then park on the last one until the canvas takes over.
    const advance = window.setInterval(() => {
      setActive((a) => (a < steps.length - 1 ? a + 1 : a));
    }, 900);
    return () => { window.clearInterval(clock); window.clearInterval(advance); };
  }, [steps.length]);

  const title = useMemo(() => {
    const name = productName?.trim();
    if (mode === "switch" && name) return `Opening ${name}`;
    return name ? `Getting ${name} ready` : "Getting your desk ready";
  }, [mode, productName]);

  return (
    <div className="boot-state" role="status" aria-live="polite">
      <div className="boot-card">
        <div className="boot-head">
          <span className="boot-eyebrow">Your crew</span>
          <span className="boot-clock tnum mono">{fmt(elapsed)}</span>
        </div>
        <h2 className="boot-title">{title}</h2>
        <ol className="boot-steps">
          {steps.map((step, i) => {
            const state = i < active ? "done" : i === active ? "now" : "next";
            return (
              <li key={step.label} className={`boot-step ${state}`}>
                <span className="boot-mk">
                  {state === "done" ? <Check size={11} strokeWidth={2.6} /> : state === "now" ? <span className="boot-spin" /> : null}
                </span>
                <span className="boot-step-body">
                  <span className="boot-step-label">{step.label}</span>
                  <span className="boot-step-hint">{step.hint}</span>
                </span>
              </li>
            );
          })}
        </ol>
        <p className="boot-foot">Read-only. Nothing sends — you approve everything at the gate.</p>
      </div>
    </div>
  );
}
