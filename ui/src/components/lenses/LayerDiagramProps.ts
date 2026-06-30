// LayerDiagramProps — the shared contract for a per-layer board diagram, one level below LensDef.
//
// A LensDef is a whole canvas surface; a LayerDiagram is the picture that fills ONE expanded board band
// (the Market band's arm-comparison, a future Positioning 2x2, an Offer ladder). The board renders the
// diagram registered for a band when it springs open; every diagram speaks this one prop bag so a new
// layer picture plugs in without touching the board shell.
//
// A diagram gets the band's belief and its experiments (already filtered to this layer), the shared
// cross-lens selection so a touched object stays lit, the projectId so it can reach anything else it
// needs (channels, the verdict/grouping write paths), and onVerdict — the callback to re-read the board
// after a founder verdict or a fresh grouping, so the belief visibly flips.

import type { GtmExperiment, LayerBelief } from "@/types";

export type LayerDiagramProps = {
  // The band's layer key (icp, positioning, offer, …).
  layer: string;
  // The band's full belief: its current belief line, grounding, confidence, status, evidence.
  belief: LayerBelief;
  // The experiments testing this layer, with each channel arm carrying its real run tally.
  experiments: GtmExperiment[];
  // The shared cross-lens selection (an experiment / arm id) and the setter that lights it everywhere.
  selected: string | null;
  onSelect: (id: string) => void;
  // The active project — a diagram reads channels and writes verdicts / groupings against it.
  projectId: string | null;
  // Re-read the board (a verdict landed, or a grouping was stated) so the belief flips on the band.
  onVerdict: () => void;
};
