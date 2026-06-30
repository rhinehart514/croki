// LayerArmComparison — the Positioning ("positioning") and Offer ("offer") bands, drawn with the SAME
// arm-comparison grammar as the Market band so an A/B one-liner test or a price-arm test reads exactly
// like an ICP race: two arms forking one belief, converging on a founder verdict.
//
// When an experiment already groups two-or-more arms at this layer, this delegates straight to
// ArmComparison's grouped view (verdicts apply by experiment id, layer-agnostic). When nothing targets
// this layer yet, it does NOT borrow Market's channel-grouping form (that races CHANNELS as ICP arms,
// a Market-only move) — it shows an honest "nothing tested yet" invitation worded for this layer.

import type { LayerDiagramProps } from "@/components/lenses/LayerDiagramProps";
import { ArmComparison } from "./ArmComparison";
import "./BandDiagrams.css";

const INVITE: Record<string, { strong: string; span: string }> = {
  positioning: {
    strong: "No positioning test running",
    span: "Race two one-liners as the arms of one test — same audience, same offer, only the promise changes — and the winner grounds the positioning belief. Nothing has been grouped at this layer yet.",
  },
  offer: {
    strong: "No offer test running",
    span: "Race two price or packaging arms with everything else held constant, and the winner grounds the offer belief. Nothing has been grouped at this layer yet.",
  },
};

export function LayerArmComparison(props: LayerDiagramProps) {
  const grouped = props.experiments.some((e) => Array.isArray(e.arms) && e.arms.length >= 2);
  if (grouped) return <ArmComparison {...props} />;

  const copy = INVITE[props.layer] ?? {
    strong: "Nothing tested at this layer yet",
    span: "Group two arms of one test, hold the rest constant, and the winner grounds this belief.",
  };
  return (
    <div className="band-diagram-empty" role="region" aria-label={`${props.layer} — nothing tested yet`}>
      <strong>{copy.strong}</strong>
      <span>{copy.span}</span>
      {props.belief.belief && <span className="band-diagram-empty-hint">{props.belief.belief}</span>}
    </div>
  );
}
