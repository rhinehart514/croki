import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@croki/client-runtime/state/runtime";
import type { NativeReviewTarget, ScopedThreadRef } from "@croki/contracts";
import { SearchCodeIcon } from "lucide-react";
import { useState } from "react";

import { reviewEnvironment } from "../../state/review";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

interface NativeReviewControlProps {
  readonly threadRef: ScopedThreadRef;
  readonly target: NativeReviewTarget | null;
  readonly disabledReason?: string | undefined;
}

export function NativeReviewControl({
  threadRef,
  target,
  disabledReason,
}: NativeReviewControlProps) {
  const startReview = useAtomCommand(reviewEnvironment.startNative, { reportFailure: false });
  const [isStarting, setIsStarting] = useState(false);
  const unavailableReason =
    disabledReason ??
    (target === null ? "Codex review supports Working tree and Branch changes." : undefined);

  const handleStart = () => {
    if (!target || unavailableReason || isStarting) return;
    setIsStarting(true);
    void (async () => {
      const result = await startReview({
        environmentId: threadRef.environmentId,
        input: { threadId: threadRef.threadId, target },
      });
      setIsStarting(false);
      if (result._tag === "Success") {
        toastManager.add({
          title: "Independent review started",
          description:
            "Codex is reviewing in a read-only child Thread. This Thread remains usable.",
          type: "success",
        });
        return;
      }
      if (isAtomCommandInterrupted(result)) return;
      const error = squashAtomCommandFailure(result);
      toastManager.add(
        stackedThreadToast({
          title: "Unable to start review",
          description: error instanceof Error ? error.message : "Codex review failed to start.",
          type: "error",
        }),
      );
    })();
  };

  const label = isStarting ? "Starting review" : "Run Codex review";
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            size="xs"
            variant="outline"
            aria-label={label}
            disabled={Boolean(unavailableReason) || isStarting}
            onClick={handleStart}
          >
            <SearchCodeIcon aria-hidden="true" className="size-3" />
            <span>{label}</span>
          </Button>
        }
      />
      <TooltipPopup side="top">
        {unavailableReason ??
          "Run Codex's native read-only review in a child Thread without interrupting this one."}
      </TooltipPopup>
    </Tooltip>
  );
}
