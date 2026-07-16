import type { FirmBet } from "@/types";

const pointByPosition: Record<FirmBet["position"], { cx: number; cy: number }> = {
  live: { cx: 76, cy: 43 },
  "at-wall": { cx: 91, cy: 31 },
  ended: { cx: 54, cy: 57 },
};

const positionLabel: Record<FirmBet["position"], string> = {
  live: "underway",
  "at-wall": "needs your hand",
  ended: "ended",
};

export function DiveMiniOrbit({ bet, onReturnToOrbit }: { bet: FirmBet; onReturnToOrbit: () => void }) {
  const point = pointByPosition[bet.position];
  return (
    <aside className="atlas-dive-mini-orbit" aria-label="You are inside this work">
      <header><strong>You are here</strong><button type="button" onClick={onReturnToOrbit}>Orbit ↩</button></header>
      <svg viewBox="0 0 150 92" role="img" aria-label={`This work is ${positionLabel[bet.position]}`}>
        <g className="atlas-dive-mini-rings"><circle cx="66" cy="46" r="14" /><circle cx="66" cy="46" r="28" /><circle cx="66" cy="46" r="42" /></g>
        <path className="atlas-dive-mini-wall" d="M 108 46 A 42 42 0 0 0 87 10" />
        <circle className="atlas-dive-mini-intent" cx="66" cy="46" r="5" />
        <circle className="atlas-dive-mini-current" cx={point.cx} cy={point.cy} r="5" />
        <circle className="atlas-dive-mini-halo" cx={point.cx} cy={point.cy} r="9" />
      </svg>
      <p>This work · <b>{positionLabel[bet.position]}</b></p>
    </aside>
  );
}
