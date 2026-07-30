import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@t3tools/contracts";
import {
  CROKI_CONTEXT_RELATIVE_PATH,
  serializeCrokiContext,
  type CrokiContextNode,
} from "@t3tools/shared/crokiContext";
import { useCallback, useEffect, useMemo } from "react";

import { projectEnvironment } from "~/state/projects";
import { useAtomCommand } from "~/state/use-atom-command";
import { useProjectFileQuery } from "../files/projectFilesQueryState";
import { stackedThreadToast, toastManager } from "../ui/toast";
import {
  acceptCrokiCanvasFile,
  acceptCrokiCanvasMissing,
  acceptCrokiCanvasReadError,
  makeCrokiCanvasWorkspaceKey,
  markCrokiCanvasSaved,
  replaceCrokiCanvasDraft,
  setCrokiCanvasSaving,
  useCrokiCanvasDraft,
} from "./crokiCanvasDraftStore";
import { addCrokiNode, updateCrokiNode, validateCrokiContextForSave } from "./crokiCanvasModel";

interface CrokiCanvasControllerProps {
  readonly environmentId: EnvironmentId;
  readonly onPendingChange?: (pending: boolean) => void;
  readonly productName: string;
  readonly workspaceRoot: string;
}

export function useCrokiCanvasController(props: CrokiCanvasControllerProps) {
  const workspaceKey = useMemo(
    () => makeCrokiCanvasWorkspaceKey(props.environmentId, props.workspaceRoot),
    [props.environmentId, props.workspaceRoot],
  );
  const state = useCrokiCanvasDraft(workspaceKey, props.productName);
  const fileQuery = useProjectFileQuery(
    props.environmentId,
    props.workspaceRoot,
    CROKI_CONTEXT_RELATIVE_PATH,
  );
  const writeProjectFile = useAtomCommand(projectEnvironment.writeFile, {
    reportFailure: false,
  });
  const validationErrors = validateCrokiContextForSave(state.context);
  const pending = state.dirty || state.isSaving;

  useEffect(() => props.onPendingChange?.(pending), [pending, props.onPendingChange]);

  useEffect(() => {
    if (fileQuery.data) {
      if (fileQuery.data.truncated) {
        acceptCrokiCanvasReadError(
          workspaceKey,
          "Canvas is too large to edit safely.",
          props.productName,
        );
      } else {
        acceptCrokiCanvasFile(workspaceKey, fileQuery.data.contents, props.productName);
      }
    } else if (fileQuery.error) {
      acceptCrokiCanvasReadError(workspaceKey, fileQuery.error, props.productName);
    } else if (!fileQuery.isPending) {
      acceptCrokiCanvasMissing(workspaceKey, props.productName);
    }
  }, [fileQuery.data, fileQuery.error, fileQuery.isPending, props.productName, workspaceKey]);

  const applyTransition = useCallback(
    (transition: ReturnType<typeof addCrokiNode>) => {
      replaceCrokiCanvasDraft(workspaceKey, transition.context, transition.error);
    },
    [workspaceKey],
  );

  const updateNode = useCallback(
    (id: string, patch: Partial<Pick<CrokiContextNode, "title" | "body" | "kind" | "status">>) => {
      applyTransition(updateCrokiNode(state.context, id, patch, new Date().toISOString()));
    },
    [applyTransition, state.context],
  );

  const save = useCallback(() => {
    if (
      validationErrors.length > 0 ||
      (state.sourceState === "malformed" && !state.repairInProgress)
    ) {
      return;
    }
    const nextContext = {
      ...state.context,
      updatedAt: new Date().toISOString(),
    };
    const contents = serializeCrokiContext(nextContext);
    setCrokiCanvasSaving(workspaceKey, true);
    void (async () => {
      const expectedContentsSha256 =
        state.baselineContents === null ? null : await sha256(state.baselineContents);
      const result = await writeProjectFile({
        environmentId: props.environmentId,
        input: {
          cwd: props.workspaceRoot,
          relativePath: CROKI_CONTEXT_RELATIVE_PATH,
          contents,
          expectedContentsSha256,
        },
      });
      if (result._tag === "Success") {
        markCrokiCanvasSaved(workspaceKey, nextContext, contents);
        fileQuery.refresh();
        toastManager.add({
          type: "success",
          title: "Canvas saved",
          description: CROKI_CONTEXT_RELATIVE_PATH,
        });
        return;
      }
      setCrokiCanvasSaving(workspaceKey, false);
      fileQuery.refresh();
      if (isAtomCommandInterrupted(result)) return;
      const error = squashAtomCommandFailure(result);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: isStaleWrite(error) ? "Canvas changed in the workspace" : "Could not save Canvas",
          description: error instanceof Error ? error.message : "An error occurred.",
        }),
      );
    })();
  }, [
    fileQuery,
    props.environmentId,
    props.workspaceRoot,
    state.baselineContents,
    state.context,
    state.repairInProgress,
    state.sourceState,
    validationErrors.length,
    workspaceKey,
    writeProjectFile,
  ]);

  return {
    applyTransition,
    retry: fileQuery.refresh,
    save,
    selectedNode: state.context.nodes.find((node) => node.id === state.selectedNodeId) ?? null,
    state,
    updateNode,
    validationErrors,
    workspaceKey,
  };
}

async function sha256(contents: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(contents));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isStaleWrite(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "failure" in error &&
    error.failure === "stale_write"
  );
}
