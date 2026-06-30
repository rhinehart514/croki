// LAYER_DIAGRAMS — the registry mapping a board layer to the diagram that fills its expanded band.
//
// The board (GtmBoard) looks a band up here when it springs open. A registered layer renders its
// diagram; an unregistered one falls back to the board's honest "diagram lands next" placeholder; the
// Channels band stays special-cased to EngineLens in the board itself. Register a layer here to give it
// a real picture — nothing else in the shell changes.

import type { ComponentType } from "react";
import type { LayerDiagramProps } from "./LayerDiagramProps";
import { ArmComparison } from "./diagrams/ArmComparison";

export const LAYER_DIAGRAMS: Record<string, ComponentType<LayerDiagramProps>> = {
  // Market / ICP — two motions raced as the arms of one ICP experiment, the offer held constant.
  icp: ArmComparison,
};
