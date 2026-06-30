// AttributionRibbon — the Measurement band's bespoke diagram: an alluvial ribbon from the touches a
// motion stages on the left to the win event on the right. The whole point is the SEAM in the middle —
// where a touch should connect to the outcome it caused. RodentRadar's wedge is that this seam is
// SEVERED: the win fires with no source carried, so a send can never be tied to a result. When the
// band has no real measure signal the ribbon reads honestly BROKEN — the right half is a ghost, the
// seam glows (danger / blind, never amber), and there is NO fabricated conversion number. Only as the
// signal grounds does the ribbon close and the confidence count up.
//
// Hand-laid SVG in the EngineLens register (geometry carries the meaning; color is rationed to status,
// from tokens, via CSS classes — amber is the founder gate's alone and appears nowhere here). The empty
// state is the severed read itself, so there is no separate blank.

import { useEffect, useRef, useState } from "react";
import { animate, motion, useMotionValue, useMotionValueEvent, useReducedMotion } from "motion/react";
import type { LayerDiagramProps } from "@/components/lenses/LayerDiagramProps";
import "./BandDiagrams.css";

type Seam = "severed" | "provisional" | "proven";

// A Sankey-style band between two stations: left edge (x0, centered yL, thickness hL) curving to a
// right edge (x1, yR, hR). The board's quiet S-curve connector grammar, given width.
function flow(x0: number, yL: number, hL: number, x1: number, yR: number, hR: number): string {
  const cx = (x0 + x1) / 2;
  const lt = yL - hL / 2, lb = yL + hL / 2, rt = yR - hR / 2, rb = yR + hR / 2;
  return `M ${x0} ${lt} C ${cx} ${lt}, ${cx} ${rt}, ${x1} ${rt} L ${x1} ${rb} C ${cx} ${rb}, ${cx} ${lb}, ${x0} ${lb} Z`;
}

// Pull a real win-event name out of the band's derived text if one is quoted (the engine emits
// `"signup"` / `"pilot_requested"` inside its measure issues). Never invented — falls back to a plain
// label so the diagram stays honest when no name is grounded.
function winEventName(belief: LayerDiagramProps["belief"]): string | null {
  for (const s of [belief.belief ?? "", ...belief.evidence]) {
    const m = s.match(/"([a-z0-9_.-]{2,})"/i);
    if (m) return m[1];
  }
  return null;
}

// The confidence number, counted up on the rare moment it actually changes (a measure grounds).
function RibbonConfidence({ value, severed }: { value: number; severed: boolean }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(value);
  const prev = useRef(value);
  const [shown, setShown] = useState(value);
  useMotionValueEvent(mv, "change", (v) => setShown(Math.round(v)));
  useEffect(() => {
    if (reduce || prev.current === value) { mv.set(value); setShown(value); prev.current = value; return; }
    const c = animate(mv, value, { duration: 0.8, ease: [0.22, 1, 0.36, 1] });
    prev.current = value;
    return () => c.stop();
  }, [value, reduce, mv]);
  if (severed) return <span className="ribbon-read-blind">blind</span>;
  return <span className="ribbon-read-num">{shown}<small>/100</small></span>;
}

export function AttributionRibbon({ belief }: LayerDiagramProps) {
  const reduce = useReducedMotion();
  const severed = !belief.belief || belief.status === "blind";
  const seam: Seam = severed ? "severed" : belief.status === "validated" ? "proven" : "provisional";
  const conf = Math.max(0, Math.min(100, belief.confidence));
  const win = winEventName(belief);

  // Ribbon thickness scales with how observable the outcome is — thin when unproven, full when proven.
  // (Geometry, not a fabricated number: it reads "weak/strong", it never claims a conversion count.)
  const strength = severed ? 0.34 : 0.34 + (conf / 100) * 0.66;
  const trunkH = Math.round(38 * strength);

  // Stations across the 760-wide field: three touch lanes → one trunk → the seam → the win event.
  const TOUCH_X = 96, MERGE_X = 300, SEAM_L = 372, SEAM_R = 432, WIN_X = 660, MID_Y = 110;
  const lanes = [MID_Y - 40, MID_Y, MID_Y + 40];

  const drawT = reduce ? { duration: 0 } : { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const };

  return (
    <div className="band-diagram ribbon" role="region" aria-label="Attribution ribbon">
      <div className="band-diagram-head">
        <div className="ribbon-head-row">
          <span className="band-diagram-kicker">attribution</span>
          <span className={`ribbon-seam-tag is-${seam}`}>
            <span className="dot" />
            {seam === "severed" ? "severed seam" : seam === "proven" ? "seam closed" : "seam provisional"}
          </span>
        </div>
        <p className="band-diagram-sub">
          {seam === "severed"
            ? "The win fires with no source carried, so a touch can't be tied to the outcome it caused — attribution is blind. This is a break in the ribbon, not a zero."
            : seam === "proven"
              ? "Touch connects to the win event — outcomes attribute back to the motion that caused them."
              : "The ribbon is forming — outcomes are partly observable, but the seam isn't proven end to end yet."}
        </p>
      </div>

      <div className="ribbon-stage">
        <svg className={`ribbon-svg is-${seam}`} viewBox="0 0 760 220" preserveAspectRatio="xMidYMid meet" role="img"
          aria-label={seam === "severed" ? "Touches flow to a severed seam; the path to the win event is broken" : "Touches flow through the seam into the win event"}>
          {/* left station — the touches a motion stages */}
          <text x={TOUCH_X} y={MID_Y - 60} className="ribbon-eyebrow" textAnchor="middle">touch</text>
          {lanes.map((y, i) => (
            <circle key={i} cx={TOUCH_X} cy={y} r={5} className="ribbon-source" />
          ))}

          {/* the three touch streams converging into the trunk */}
          {lanes.map((y, i) => (
            <motion.path
              key={i}
              d={flow(TOUCH_X, y, 12, MERGE_X, MID_Y, trunkH)}
              className="ribbon-stream"
              initial={reduce ? false : { opacity: 0, pathLength: 0 }}
              animate={{ opacity: 1, pathLength: 1 }}
              transition={reduce ? { duration: 0 } : { ...drawT, delay: 0.04 * i }}
            />
          ))}

          {/* the trunk up to the seam */}
          <motion.path
            d={flow(MERGE_X, MID_Y, trunkH, SEAM_L, MID_Y, trunkH)}
            className="ribbon-trunk"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={reduce ? { duration: 0 } : { ...drawT, delay: 0.16 }}
          />

          {/* the seam — the dramatized moment */}
          {seam === "severed" ? (
            <g className="ribbon-seam severed">
              {/* the right half is a ghost the touch never reaches */}
              <path d={flow(SEAM_R, MID_Y, trunkH, WIN_X, MID_Y, trunkH)} className="ribbon-ghost" />
              {/* the clean break, glowing — danger, never amber */}
              <motion.line
                x1={SEAM_L} y1={MID_Y - trunkH / 2 - 16} x2={SEAM_L} y2={MID_Y + trunkH / 2 + 16}
                className="ribbon-cut"
                initial={reduce ? false : { opacity: 0, scaleY: 0.4 }}
                animate={{ opacity: 1, scaleY: 1 }}
                style={{ transformOrigin: `${SEAM_L}px ${MID_Y}px` }}
                transition={reduce ? { duration: 0 } : { delay: 0.34, duration: 0.28, ease: [0.34, 1.56, 0.64, 1] }}
              />
              <motion.line
                x1={SEAM_R} y1={MID_Y - trunkH / 2 - 16} x2={SEAM_R} y2={MID_Y + trunkH / 2 + 16}
                className="ribbon-cut ghost"
                initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }}
                transition={reduce ? { duration: 0 } : { delay: 0.4, duration: 0.24 }}
              />
              <motion.g
                className="ribbon-break-mark"
                initial={reduce ? false : { opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={reduce ? { duration: 0 } : { delay: 0.46, type: "spring", stiffness: 460, damping: 16 }}
              >
                <circle cx={(SEAM_L + SEAM_R) / 2} cy={MID_Y} r={13} className="ribbon-break-disc" />
                <path d={`M ${(SEAM_L + SEAM_R) / 2 - 5} ${MID_Y - 5} L ${(SEAM_L + SEAM_R) / 2 + 5} ${MID_Y + 5} M ${(SEAM_L + SEAM_R) / 2 + 5} ${MID_Y - 5} L ${(SEAM_L + SEAM_R) / 2 - 5} ${MID_Y + 5}`} className="ribbon-break-x" />
              </motion.g>
            </g>
          ) : (
            <g className="ribbon-seam joined">
              <motion.path
                d={flow(SEAM_L, MID_Y, trunkH, WIN_X, MID_Y, trunkH)}
                className={`ribbon-trunk ${seam}`}
                strokeDasharray={seam === "provisional" ? "5 5" : undefined}
                initial={reduce ? false : { opacity: 0, pathLength: 0 }}
                animate={{ opacity: 1, pathLength: 1 }}
                transition={reduce ? { duration: 0 } : { ...drawT, delay: 0.24 }}
              />
              <motion.circle
                cx={(SEAM_L + SEAM_R) / 2} cy={MID_Y} r={7} className={`ribbon-join-dot ${seam}`}
                initial={reduce ? false : { scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={reduce ? { duration: 0 } : { delay: 0.42, type: "spring", stiffness: 500, damping: 17 }}
              />
            </g>
          )}

          {/* right station — the win event */}
          <motion.g
            className={`ribbon-win is-${seam}`}
            initial={reduce ? false : { opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={reduce ? { duration: 0 } : { delay: 0.3, duration: 0.3 }}
          >
            <rect x={WIN_X - 4} y={MID_Y - 26} width={64} height={52} rx={10} className="ribbon-win-box" />
            <text x={WIN_X + 28} y={MID_Y - 34} className="ribbon-eyebrow" textAnchor="middle">win event</text>
          </motion.g>
          {win && <text x={WIN_X + 28} y={MID_Y + 5} className="ribbon-win-name" textAnchor="middle">{win}</text>}
        </svg>
      </div>

      {/* the honest read-out — a number only when there's real signal, "blind" otherwise */}
      <div className="ribbon-readout">
        <div className="ribbon-read">
          <span className="ribbon-read-label">observable</span>
          <RibbonConfidence value={conf} severed={severed} />
        </div>
        <div className={`ribbon-read ribbon-read-status is-${seam}`}>
          <span className="ribbon-read-label">read</span>
          <span className="ribbon-read-tag"><span className="dot" />{severed ? "attribution blind" : belief.status}</span>
        </div>
      </div>

      {belief.evidence.length > 0 && (
        <ul className="score-issues">
          <span className="score-issues-eyebrow">what the measure read found</span>
          {belief.evidence.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}
    </div>
  );
}
