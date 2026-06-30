// ExperimentOverlay — the split → race → converge bracket drawn over an expanded band.
//
// One glyph carries the whole loop: a FORK on the left is the belief splitting into candidate arms; the
// two PARALLEL tracks are the held-constant race; the ◇ on the right is the verdict where they
// converge. The verdict ◇ wears a single amber gate pip — the ONLY amber on the board — because that is
// where the motion resolves behind the founder's approval. For the SELECTED experiment a vertical
// STAPLE drops from the bracket toward the Channels band (focus-to-trace): the arms ARE channels, so the
// belief at the top of the board is stapled to the motion that tests it at the bottom.
//
// Motion: the two tracks draw in with a quick stagger, the ◇ lands with a soft spring, and a resolved
// verdict crossfades the winning track to grounded. All of it is reduced-motion guarded.

import { motion, useReducedMotion } from "motion/react";

export type OverlayArm = { id: string; label: string; winner?: boolean; loser?: boolean };

const FORK = { x: 44, y: 80 };
const VERDICT = { x: 628, y: 80 };
const ARM_TOP = { x: 372, y: 42 };
const ARM_BOT = { x: 372, y: 118 };

// A smooth S-curve between two points (horizontal control handles), the board's quiet connector grammar.
function curve(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const mx = (a.x + b.x) / 2;
  return `M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`;
}

export function ExperimentOverlay({
  arms, resolved, traced,
}: {
  // Up to two arms drive the two-track bracket; extra arms still tally below, they just don't get a track.
  arms: OverlayArm[];
  // The experiment carries a founder verdict — the race is decided, the ◇ is filled.
  resolved: boolean;
  // This experiment is the selected one — drop the staple toward the Channels band.
  traced: boolean;
}) {
  const reduce = useReducedMotion();
  const a = arms[0];
  const b = arms[1];
  const armNode = (arm: OverlayArm | undefined, at: { x: number; y: number }, delay: number) => {
    if (!arm) return null;
    const tone = arm.winner ? "win" : arm.loser ? "lose" : "neutral";
    return (
      <motion.g
        className={`xo-arm xo-arm-${tone}`}
        initial={reduce ? false : { opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={reduce ? { duration: 0 } : { delay, duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      >
        <circle cx={at.x} cy={at.y} r={7} className="xo-arm-dot" />
        <text x={at.x + 14} y={at.y + 4} className="xo-arm-label">{arm.label}</text>
      </motion.g>
    );
  };

  return (
    <svg className="xo" viewBox="0 0 720 160" role="img" aria-label="Experiment bracket: belief splits into two arms and converges at a verdict">
      {/* fork — the belief */}
      <g className="xo-fork">
        <circle cx={FORK.x} cy={FORK.y} r={6} className="xo-fork-dot" />
        <text x={FORK.x} y={FORK.y - 16} className="xo-eyebrow" textAnchor="middle">belief</text>
      </g>

      {/* the two racing tracks (split out, then converge) */}
      {[
        { p: curve(FORK, ARM_TOP), arm: a, delay: 0.04 },
        { p: curve(FORK, ARM_BOT), arm: b, delay: 0.1 },
        { p: curve(ARM_TOP, VERDICT), arm: a, delay: 0.16 },
        { p: curve(ARM_BOT, VERDICT), arm: b, delay: 0.22 },
      ].map((t, i) =>
        t.arm ? (
          <motion.path
            key={i}
            d={t.p}
            className={`xo-track ${t.arm.winner ? "xo-track-win" : t.arm.loser ? "xo-track-lose" : ""}`}
            initial={reduce ? false : { pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={reduce ? { duration: 0 } : { delay: t.delay, duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
          />
        ) : null,
      )}

      {armNode(a, ARM_TOP, 0.12)}
      {armNode(b, ARM_BOT, 0.18)}

      {/* converge — the verdict ◇, with the single amber gate pip */}
      <motion.g
        className={`xo-verdict ${resolved ? "xo-verdict-on" : ""}`}
        initial={reduce ? false : { scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={reduce ? { duration: 0 } : { delay: 0.3, type: "spring", stiffness: 520, damping: 16, mass: 0.7 }}
      >
        <rect
          x={VERDICT.x - 11} y={VERDICT.y - 11} width={22} height={22}
          transform={`rotate(45 ${VERDICT.x} ${VERDICT.y})`}
          className="xo-diamond"
        />
        {/* the ONLY amber on the board — the founder gate pip where this resolves */}
        <circle cx={VERDICT.x + 12} cy={VERDICT.y - 12} r={4} className="xo-gate-pip" />
        <text x={VERDICT.x} y={VERDICT.y - 22} className="xo-eyebrow" textAnchor="middle">verdict</text>
      </motion.g>

      {/* the staple toward the Channels band — focus-to-trace, only for the selected experiment */}
      {traced && (
        <motion.g
          className="xo-staple"
          initial={reduce ? false : { opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduce ? { duration: 0 } : { delay: 0.36, duration: 0.2 }}
        >
          <path d={`M ${FORK.x} ${FORK.y + 8} V 150`} className="xo-staple-line" />
          <path d="M0 0 L5 6 L10 0" transform={`translate(${FORK.x - 5} 148)`} className="xo-staple-head" />
          <text x={FORK.x + 12} y={150} className="xo-staple-label">traces to Pipelines — the arms are motions</text>
        </motion.g>
      )}
    </svg>
  );
}
