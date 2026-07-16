import type { FirmConfiguration, FirmLens } from "@/types";

export const COMPATIBLE_FIRM_CONFIGURATION: FirmConfiguration = {
  id: "firm",
  schemaVersion: 1,
  revision: 1,
  presentation: { participant: "teammate", participantLabel: "teammate", collectiveLabel: "teammates" },
  defaults: { runtime: null, model: null, maxSteps: 24 },
  organization: { shape: "flat", instructions: null, relationships: [] },
  coordination: {
    mode: "adaptive",
    coordinatorRef: null,
    maxPasses: 4,
    protocols: ["direct", "consult", "relay", "panel", "debate", "red-team", "synthesis", "watch"],
    stopWhen: ["another pass is unlikely to change the decision", "remaining uncertainty is founder judgment or taste"],
  },
  authority: { outwardEffects: "wall", configurationChanges: "founder" },
  agents: [],
};

export function configurationForLens(lens: FirmLens | null | undefined) {
  return lens?.configuration ?? COMPATIBLE_FIRM_CONFIGURATION;
}
