import type { ScopedThreadRef } from "@t3tools/contracts";
import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { useRouter } from "@tanstack/react-router";
import { useCallback } from "react";

import { newThreadId } from "../lib/utils";
import { threadEnvironment } from "../state/threads";
import { useAtomCommand } from "../state/use-atom-command";
import { useThreadSelectionStore } from "../threadSelectionStore";
import { buildThreadRouteParams } from "../threadRoutes";
import { stackedThreadToast, toastManager } from "../components/ui/toast";
import { useSidebar } from "../components/ui/sidebar";

/** Fork a persisted provider conversation, then open the accepted target thread. */
export function useForkThread() {
  const dispatchFork = useAtomCommand(threadEnvironment.fork, { reportFailure: false });
  const router = useRouter();
  const { isMobile, setOpenMobile } = useSidebar();
  const clearSelection = useThreadSelectionStore((state) => state.clearSelection);
  const setSelectionAnchor = useThreadSelectionStore((state) => state.setAnchor);

  return useCallback(
    async (sourceThreadRef: ScopedThreadRef): Promise<ScopedThreadRef | null> => {
      const targetThreadRef = scopeThreadRef(sourceThreadRef.environmentId, newThreadId());
      const result = await dispatchFork({
        environmentId: sourceThreadRef.environmentId,
        input: {
          threadId: targetThreadRef.threadId,
          sourceThreadId: sourceThreadRef.threadId,
        },
      });

      if (result._tag === "Failure") {
        if (!isAtomCommandInterrupted(result)) {
          const error = squashAtomCommandFailure(result);
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Failed to fork thread",
              description: error instanceof Error ? error.message : "An error occurred.",
            }),
          );
        }
        return null;
      }

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
