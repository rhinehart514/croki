// failureChipVisibility — the audience-aware rule for the self-observed-failure chip (docs/production-
// direction/16). The chip is a BUILDER diagnostic (Drover logging its own run failures), not a founder-GTM
// failure. It is hidden on Operator/product altitude so the founder operation reads clean, and shown on
// Engineer/builder altitude when failures exist — where it is the only entry point to the FailureLogPanel.
// Kept as a pure function so it is unit-testable and does not turn the failure log off globally.
export function showSelfObservedFailureChip(input: {
  view: string;
  effectiveLens: "operator" | "engineer";
  failuresToFix: number;
  failureLogOpen: boolean;
}): boolean {
  return input.view === "canvas"
    && input.effectiveLens === "engineer"
    && input.failuresToFix > 0
    && !input.failureLogOpen;
}
