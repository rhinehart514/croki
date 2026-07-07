import { motion } from "motion/react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { SPRING } from "@/lib/springs";
import "@/styles/altitude.css";

// AltitudeControl — the ONE way you move between the whole go-to-market story and the runnable steps.
// It replaces the old Move/Engineer mode toggle: instead of two named "modes" the founder has to learn,
// there is one axis — altitude. Pull UP to the Story (the why, the whole shape at a glance); drop DOWN
// to the Steps (the how, the runnable pipeline). Same canvas underneath, re-projected in place; this
// control never navigates away. The zoom-out / zoom-in glyphs and the changing one-line hint make the
// altitude reading explicit so it never reads as a pair of generic tabs.
//
// FIRST PASS: this swaps between the two existing lenses (the story bands and the step canvas) at two
// discrete altitudes. A continuous zoom morph between them is the follow-up; this lands the single
// mental model safely without touching either canvas.

export type Altitude = "story" | "steps";

const STOPS: { id: Altitude; label: string; Icon: typeof ZoomOut; hint: string }[] = [
  { id: "story", label: "Story", Icon: ZoomOut, hint: "The why — your whole go-to-market at a glance" },
  { id: "steps", label: "Steps", Icon: ZoomIn, hint: "The how — the runnable steps that reach it" },
];

export function AltitudeControl({
  altitude,
  onChange,
}: {
  altitude: Altitude;
  onChange: (a: Altitude) => void;
}) {
  const active = STOPS.find((s) => s.id === altitude) ?? STOPS[0];
  return (
    <div className="altitude" role="group" aria-label="Canvas altitude — story or steps">
      <div className="altitude-row" role="tablist" aria-label="Altitude">
        {STOPS.map((s) => {
          const on = s.id === altitude;
          const Icon = s.Icon;
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={on}
              className={`altitude-stop ${on ? "active" : ""}`}
              onClick={() => onChange(s.id)}
            >
              {on ? (
                <motion.span layoutId="altitude-fill" className="altitude-fill" transition={SPRING} />
              ) : null}
              <Icon className="altitude-ico" size={13} strokeWidth={2} />
              <span className="altitude-lbl">{s.label}</span>
            </button>
          );
        })}
      </div>
      <div className="altitude-hint">{active.hint}</div>
    </div>
  );
}
