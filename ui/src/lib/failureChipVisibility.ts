// failureChipVisibility — the audience-aware rule for the self-observed-failure chip (docs/production-
// direction/16). The chip is a BUILDER diagnostic (Drover logging its own run failures), not a founder-GTM
// failure. It remains reachable on the one canvas whenever failures exist.
export function showSelfObservedFailureChip(input: {
  view: string;
  failuresToFix: number;
  failureLogOpen: boolean;
}): boolean {
  return input.view === "canvas"
    && input.failuresToFix > 0
    && !input.failureLogOpen;
}
