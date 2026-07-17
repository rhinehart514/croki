import { createContext, useContext } from "react";
import type { SemanticBand } from "./semanticBand";
import type { AtlasAltitude } from "./atlasTypes";

// The shared band context + its read hooks live here (not in SemanticBandProvider.tsx) so that the
// provider file exports only a component — fast refresh requires component-only modules, and node anatomies,
// the lens module, and the altimeter all read THIS one state, never a second raw-transform read.

export type BandContextValue = { band: SemanticBand; altitude: AtlasAltitude };

export const BandContext = createContext<BandContextValue>({ band: "structure", altitude: "venture" });

export function useSemanticBand(): SemanticBand {
  return useContext(BandContext).band;
}

export function useSemanticAltitude(): AtlasAltitude {
  return useContext(BandContext).altitude;
}
