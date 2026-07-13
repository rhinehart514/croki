import {
  isRestorableViewport,
  viewportShowsAnyObject,
  type CanvasRect,
  type CanvasViewport,
  type CanvasViewportSize,
} from "./canvasViewportContract";

export type CanvasFocusCandidate<TFocus> = {
  id: string;
  focus: TFocus;
  occurredAt: string | null | undefined;
};

export type CanvasOutcomeFocusCandidate<TFocus> = CanvasFocusCandidate<TFocus> & {
  kind: "sent" | "observed-response" | "product-activation" | "business-outcome" | "founder-entered" | "unmeasured";
};

export type CanvasInitialFocusInput<TFocus> = {
  explicitFocus?: TFocus | null;
  restoredFocus?: TFocus | null;
  savedViewport?: CanvasViewport | null;
  viewportSize?: CanvasViewportSize | null;
  canvasObjects?: readonly CanvasRect[];
  unresolvedReplies?: readonly CanvasFocusCandidate<TFocus>[];
  outcomes?: readonly CanvasOutcomeFocusCandidate<TFocus>[];
  parkedGates?: readonly CanvasFocusCandidate<TFocus>[];
};

export type CanvasInitialFocus<TFocus> =
  | { kind: "focus"; source: "explicit" | "restored" | "unresolved-reply" | "observed-response" | "business-or-product-outcome" | "parked-gate" | "latest-outcome"; focus: TFocus }
  | { kind: "viewport"; source: "saved-viewport"; viewport: CanvasViewport }
  | { kind: "overview"; source: "overview" };

function timestampValue(value: string | null | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function newest<TFocus>(candidates: readonly CanvasFocusCandidate<TFocus>[]): CanvasFocusCandidate<TFocus> | null {
  return candidates.reduce<CanvasFocusCandidate<TFocus> | null>((winner, candidate) => {
    if (!winner) return candidate;
    const timeDelta = timestampValue(candidate.occurredAt) - timestampValue(winner.occurredAt);
    if (timeDelta > 0) return candidate;
    if (timeDelta < 0) return winner;
    return candidate.id.localeCompare(winner.id) < 0 ? candidate : winner;
  }, null);
}

export function resolveCanvasInitialFocus<TFocus>(input: CanvasInitialFocusInput<TFocus>): CanvasInitialFocus<TFocus> {
  if (input.explicitFocus != null) return { kind: "focus", source: "explicit", focus: input.explicitFocus };
  if (input.restoredFocus != null) return { kind: "focus", source: "restored", focus: input.restoredFocus };

  if (
    isRestorableViewport(input.savedViewport)
    && input.viewportSize
    && viewportShowsAnyObject(input.savedViewport, input.viewportSize, [...(input.canvasObjects ?? [])])
  ) {
    return { kind: "viewport", source: "saved-viewport", viewport: input.savedViewport };
  }

  const unresolvedReply = newest(input.unresolvedReplies ?? []);
  if (unresolvedReply) return { kind: "focus", source: "unresolved-reply", focus: unresolvedReply.focus };

  const observedResponse = newest((input.outcomes ?? []).filter((outcome) => outcome.kind === "observed-response"));
  if (observedResponse) return { kind: "focus", source: "observed-response", focus: observedResponse.focus };

  const businessOrProductOutcome = newest(
    (input.outcomes ?? []).filter((outcome) => outcome.kind === "business-outcome" || outcome.kind === "product-activation"),
  );
  if (businessOrProductOutcome) {
    return { kind: "focus", source: "business-or-product-outcome", focus: businessOrProductOutcome.focus };
  }

  const parkedGate = newest(input.parkedGates ?? []);
  if (parkedGate) return { kind: "focus", source: "parked-gate", focus: parkedGate.focus };

  const latestRemainingOutcome = newest(
    (input.outcomes ?? []).filter((outcome) => (
      outcome.kind !== "observed-response"
      && outcome.kind !== "business-outcome"
      && outcome.kind !== "product-activation"
    )),
  );
  if (latestRemainingOutcome) {
    return { kind: "focus", source: "latest-outcome", focus: latestRemainingOutcome.focus };
  }

  return { kind: "overview", source: "overview" };
}
