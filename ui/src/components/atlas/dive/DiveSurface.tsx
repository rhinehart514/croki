import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Orbit, Shield } from "lucide-react";
import type { WallQueueItemView } from "@/api";
import type { FirmBet, FirmConfiguration, FirmOutcome } from "@/types";
import "@/styles/atlas-dive.css";
import { DiveGateInspector } from "./DiveGateInspector";
import { DiveMiniOrbit } from "./DiveMiniOrbit";
import { projectDive, type DiveNode } from "./diveProjection";
import { DiveWorkflowNode } from "./DiveWorkflowNode";

export type DiveSurfaceProps = {
  bet: FirmBet;
  wallItems: WallQueueItemView[];
  outcomes: FirmOutcome[];
  configuration?: FirmConfiguration | null;
  onReturnToOrbit: () => void;
  onReviewWallItem: (item: WallQueueItemView) => void;
  onHoldWallItem: (item: WallQueueItemView) => void;
};

const POSITION_LABEL: Record<FirmBet["position"], string> = {
  live: "Underway",
  "at-wall": "Needs your hand",
  ended: "Ended",
};

function edgePath(source: Pick<DiveNode, "x" | "y" | "kind">, target: Pick<DiveNode, "x" | "y" | "kind">) {
  const startX = source.x + (source.kind === "gate" ? 114 : 96);
  const endX = target.x - (target.kind === "gate" ? 114 : 96);
  const bend = Math.max(32, (endX - startX) * 0.42);
  return `M ${startX} ${source.y} C ${startX + bend} ${source.y}, ${endX - bend} ${target.y}, ${endX} ${target.y}`;
}

export function DiveSurface({ bet, wallItems, outcomes, configuration, onReturnToOrbit, onReviewWallItem, onHoldWallItem }: DiveSurfaceProps) {
  const projection = useMemo(() => projectDive({ bet, wallItems, outcomes, configuration }), [bet, configuration, outcomes, wallItems]);
  const gates = projection.nodes.filter((node) => node.kind === "gate" && node.wallItem);
  const [gateSelection, setGateSelection] = useState<{ betId: string; itemId: string | null }>({ betId: bet.id, itemId: null });
  const selectedGateId = gateSelection.betId === bet.id ? gateSelection.itemId : null;
  const selectedGate = selectedGateId
    ? gates.find((node) => node.wallItem?.id === selectedGateId)?.wallItem ?? null
    : null;
  const byId = new Map(projection.nodes.map((node) => [node.id, node]));
  const sparse = projection.nodes.length === 1;
  const returnButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { returnButtonRef.current?.focus({ preventScroll: true }); }, []);
  return (
    <section
      className="atlas-dive"
      aria-label={`Inside work: ${bet.intent}`}
      data-inspector-open={Boolean(selectedGate)}
    >
      <header className="atlas-dive-chrome">
        <nav aria-label="Work breadcrumb" className="atlas-dive-breadcrumb">
          <button type="button" onClick={onReturnToOrbit}><ArrowLeft aria-hidden="true" /> Venture</button>
          <span aria-hidden="true">/</span>
          <button type="button" onClick={onReturnToOrbit}>The orbit</button>
          <span aria-hidden="true">/</span>
          <strong>{bet.intent}</strong>
        </nav>
        <nav aria-label="Canvas altitude" className="atlas-dive-altitude">
          <button type="button" onClick={onReturnToOrbit}><Orbit aria-hidden="true" /> Venture</button>
          <span aria-current="page">Inside this work</span>
        </nav>
        <button ref={returnButtonRef} type="button" className="atlas-dive-return" onClick={onReturnToOrbit}><ArrowLeft aria-hidden="true" /> Fold back to orbit</button>
      </header>

      <div className="atlas-dive-field">
        <section className="atlas-dive-bet-summary" aria-labelledby="atlas-dive-bet-intent">
          <span>{bet.position === "at-wall" ? <><Shield aria-hidden="true" /> Needs your hand</> : POSITION_LABEL[bet.position]}</span>
          <h1 id="atlas-dive-bet-intent">{bet.intent}</h1>
          <p><time dateTime={bet.createdAt}>Opened {new Date(bet.createdAt).toLocaleDateString()}</time>{bet.teammateRef ? ` · ${configuration?.agents.find((agent) => agent.ref === bet.teammateRef)?.name ?? bet.teammateRef}` : ""}{bet.workflowMeasurementWindow ? ` · Campaign envelope ${bet.workflowMeasurementWindow}` : ""}</p>
        </section>

        <div className="atlas-dive-graph-scroll" data-sparse={sparse ? "true" : "false"} role="region" aria-label="Durable workflow evidence" tabIndex={0}>
          <div className="atlas-dive-graph" style={{ width: projection.width, height: projection.height }}>
            <svg viewBox={`0 0 ${projection.width} ${projection.height}`} aria-hidden="true">
              <defs><marker id="atlas-dive-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8" /></marker></defs>
              {projection.edges.map((edge) => {
                const source = byId.get(edge.source);
                const target = byId.get(edge.target);
                if (!source || !target) return null;
                const labelX = (source.x + target.x) / 2;
                const labelY = (source.y + target.y) / 2 - 8;
                return <g key={edge.id} data-tone={edge.tone}>
                  <path d={edgePath(source, target)} markerEnd="url(#atlas-dive-arrow)" />
                  <text x={labelX} y={labelY} textAnchor="middle">{edge.label}</text>
                </g>;
              })}
            </svg>
            {projection.nodes.map((node) => (
              <div key={node.id} className="atlas-dive-node-position" style={{ left: node.x, top: node.y }}>
                <DiveWorkflowNode node={node} onInspectGate={(itemId) => setGateSelection({ betId: bet.id, itemId })} />
              </div>
            ))}
          </div>
        </div>

        {projection.gaps.length ? <section className="atlas-dive-gaps" aria-labelledby="atlas-dive-gaps-title">
          <h2 id="atlas-dive-gaps-title">Gaps</h2>
          <ul>{projection.gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul>
        </section> : null}
        <DiveMiniOrbit bet={bet} onReturnToOrbit={onReturnToOrbit} />
        {selectedGate ? <DiveGateInspector
          item={selectedGate}
          onClose={() => setGateSelection({ betId: bet.id, itemId: null })}
          onReview={onReviewWallItem}
          onHold={(item) => { onHoldWallItem(item); setGateSelection({ betId: bet.id, itemId: null }); }}
        /> : null}
      </div>
    </section>
  );
}
