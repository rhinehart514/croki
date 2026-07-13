export type ComposerAltitude = "empty" | "forming" | "contextual" | "activity" | "resting";

export type ComposerAltitudeInput = {
  hasMeaningfulFounderWork: boolean;
  hasActiveSession: boolean;
  hasFormingWork: boolean;
  hasLiveActivity: boolean;
  hasExplicitSelection: boolean;
};

// Precedence is intentional: work being formed is the most immediate state, followed by live execution,
// then the founder's explicit focus. Empty is reserved for a workspace with neither work nor a session;
// every other quiet state rests.
export function resolveComposerAltitude(input: ComposerAltitudeInput): ComposerAltitude {
  if (input.hasFormingWork) return "forming";
  if (input.hasLiveActivity) return "activity";
  if (input.hasExplicitSelection) return "contextual";
  if (!input.hasMeaningfulFounderWork && !input.hasActiveSession) return "empty";
  return "resting";
}
