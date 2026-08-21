import type { MessageId, ScopedThreadRef } from "@croki/contracts";
import { scopeThreadRef, scopedThreadKey } from "@croki/client-runtime/environment";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@croki/client-runtime/state/runtime";
import { useRouter } from "@tanstack/react-router";
import { useCallback } from "react";

import { newThreadId } from "../lib/utils";
import { threadEnvironment } from "../state/threads";
import { useAtomCommand } from "../state/use-atom-command";
import { useThreadSelectionStore } from "../threadSelectionStore";
import { buildThreadRouteParams } from "../threadRoutes";
import { stackedThreadToast, toastManager } from "../components/ui/toast";
import { useSidebar } from "../components/ui/sidebar";

interface ForkThreadOptions {
  readonly sourceMessageId?: MessageId;
  readonly failureTitle?: string;
  readonly prepareTarget?: (targetThreadRef: ScopedThreadRef) => void | Promise<void>;
  readonly shouldOpenTarget?: (targetThreadRef: ScopedThreadRef) => boolean;
}

/** Fork a persisted provider conversation, then open the accepted target thread. */
export function useForkThread() {
  const dispatchFork = useAtomCommand(threadEnvironment.fork, { reportFailure: false });
  const router = useRouter();
  const { isMobile, setOpenMobile } = useSidebar();
  const clearSelection = useThreadSelectionStore((state) => state.clearSelection);
  const setSelectionAnchor = useThreadSelectionStore((state) => state.setAnchor);

  return useCallback(
    async (
      sourceThreadRef: ScopedThreadRef,
      options: ForkThreadOptions = {},
    ): Promise<ScopedThreadRef | null> => {
      const targetThreadRef = scopeThreadRef(sourceThreadRef.environmentId, newThreadId());
      const result = await dispatchFork({
        environmentId: sourceThreadRef.environmentId,
        input: {
          threadId: targetThreadRef.threadId,
          sourceThreadId: sourceThreadRef.threadId,
          ...(options.sourceMessageId === undefined
            ? {}
            : { sourceMessageId: options.sourceMessageId }),
        },
      });

      if (result._tag === "Failure") {
        if (!isAtomCommandInterrupted(result)) {
          const error = squashAtomCommandFailure(result);
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: options.failureTitle ?? "Failed to fork thread",
              description: error instanceof Error ? error.message : "An error occurred.",
            }),
          );
        }
        return null;
      }

      await options.prepareTarget?.(targetThreadRef);
      if (options.shouldOpenTarget?.(targetThreadRef) === false) return targetThreadRef;
      clearSelection();
      setSelectionAnchor(scopedThreadKey(targetThreadRef));
      if (isMobile) setOpenMobile(false);
      void router.navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(targetThreadRef),
      });
      return targetThreadRef;
    },
    [clearSelection, dispatchFork, isMobile, router, setOpenMobile, setSelectionAnchor],
  );
}
