// LAYER_DIAGRAMS — the registry mapping a board layer to the diagram that fills its expanded band.
//
// The board (GtmBoard) looks a band up here when it springs open. A registered layer renders its
// diagram; an unregistered one falls back to the board's honest "diagram lands next" placeholder; the
// Channels band stays special-cased to EngineLens in the board itself. Register a layer here to give it
// a real picture — nothing else in the shell changes.

import type { ComponentType } from "react";
import type { LayerDiagramProps } from "./LayerDiagramProps";
import { ArmComparison } from "./diagrams/ArmComparison";
import { LayerArmComparison } from "./diagrams/LayerArmComparison";
import { TriggerStrip } from "./diagrams/TriggerStrip";
import { PlaysStrip } from "./diagrams/PlaysStrip";
import { PipelineDiagram } from "./diagrams/PipelineDiagram";
import { MeasurementScoreboard } from "./diagrams/MeasurementScoreboard";
import { VerdictLedger } from "./diagrams/VerdictLedger";

export const LAYER_DIAGRAMS: Record<string, ComponentType<LayerDiagramProps>> = {
  // Strategy ──────────────────────────────────────────────────────────────────
  // Market / ICP — two motions raced as the arms of one ICP experiment, the offer held constant.
  icp: ArmComparison,
  // Problem & Trigger — the why-now wedges People carry, heat-ranked by recurrence.
  trigger: TriggerStrip,
  // Positioning & Offer — the SAME arm-comparison grammar as Market (an A/B one-liner, a price arm),
  // with an honest "nothing tested yet" invite when no experiment targets the layer.
  positioning: LayerArmComparison,
  offer: LayerArmComparison,

  // Motion ────────────────────────────────────────────────────────────────────
  // (channels is special-cased to EngineLens in GtmBoard itself.)
  // Plays & Assets — the staged plays/assets behind the founder gate.
  artifacts: PlaysStrip,

  // Loop ──────────────────────────────────────────────────────────────────────
  // People / Pipeline — the durable People across channels, drawn with PeopleLens verbatim.
  people: PipelineDiagram,
  // Measurement — a scoreboard from the derived measure signal; reads "blind" when attribution is cut.
  measure: MeasurementScoreboard,
  // Learning — the verdict ledger / decision feed, newest-first: the why-trail behind every belief.
  learn: VerdictLedger,
};
