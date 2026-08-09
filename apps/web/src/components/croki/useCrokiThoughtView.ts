import type {
  CrokiPerceptionFrame,
  CrokiProjectPerceptionSnapshot,
  CrokiThoughtView,
} from "@croki/contracts";
import { compileCrokiThoughtView } from "@croki/shared/crokiThoughtView";
import { useCallback, useEffect, useMemo, useState } from "react";

export function useCrokiThoughtView(input: {
  readonly frame?: CrokiPerceptionFrame | CrokiProjectPerceptionSnapshot | null | undefined;
  readonly question?: string | null | undefined;
}) {
  const [frozenView, setFrozenView] = useState<CrokiThoughtView | null>(null);
  const [basisOpen, setBasisOpen] = useState(false);
  const primaryView = useMemo(
    () =>
      input.frame && input.question?.trim()
        ? compileCrokiThoughtView({ frame: input.frame, question: input.question })
        : null,
    [input.frame, input.question],
  );
  const alternateView = useMemo(
    () =>
      input.frame && input.question?.trim()
        ? compileCrokiThoughtView({
            frame: input.frame,
            question: input.question,
            alternate: true,
          })
        : null,
    [input.frame, input.question],
  );
  const thoughtView = frozenView ?? primaryView;

  useEffect(() => {
    setFrozenView(null);
    setBasisOpen(false);
  }, [input.question]);

  const toggleBasis = useCallback(() => setBasisOpen((open) => !open), []);
  const reframe = useCallback(() => {
    if (!primaryView || !alternateView) return;
    setFrozenView(
      thoughtView?.representation === primaryView.representation ? alternateView : primaryView,
    );
  }, [alternateView, primaryView, thoughtView?.representation]);
  const update = useCallback(() => setFrozenView(null), []);

  return {
    thoughtView,
    basisOpen,
    updateAvailable: Boolean(
      frozenView && primaryView && frozenView.sourceRevision !== primaryView.sourceRevision,
    ),
    toggleBasis,
    reframe,
    update,
  };
}
