"use client";

import type { ProjectComponentEntry, ScopedThreadRef } from "@croki/contracts";

import { isPreviewSupportedInRuntime } from "~/previewStateStore";

import { PreviewPanelShell, type PreviewPanelMode } from "./PreviewPanelShell";
import type { PreviewExplorationState } from "./PreviewDecisionBar";
import { PreviewView } from "./PreviewView";

interface Props {
  mode: PreviewPanelMode;
  threadRef: ScopedThreadRef;
  tabId?: string | null;
  configuredUrls?: ReadonlyArray<string> | undefined;
  visible: boolean;
  onAddCanvasEvidence?: ((url: string) => void) | undefined;
  onBuildIdea?: ((idea: string) => void) | undefined;
  workspaceRoot?: string | undefined;
  onPreviewComponent?: ((component: ProjectComponentEntry) => void) | undefined;
  onExploreOptions?: ((annotationId: string) => void) | undefined;
  explorationState?: PreviewExplorationState | undefined;
  onKeepOption?: ((url: string) => void) | undefined;
  onCombineOption?: ((url: string, direction: string) => void) | undefined;
  onDiscardOptions?: ((url: string) => void) | undefined;
  onStopExploration?: (() => void) | undefined;
  optionLabel?: string | undefined;
}

export function PreviewPanel({
  mode,
  threadRef,
  tabId,
  configuredUrls,
  visible,
  onAddCanvasEvidence,
  onBuildIdea,
  workspaceRoot,
  onPreviewComponent,
  onExploreOptions,
  explorationState,
  onKeepOption,
  onCombineOption,
  onDiscardOptions,
  onStopExploration,
  optionLabel,
}: Props) {
  if (!isPreviewSupportedInRuntime()) {
    return (
      <PreviewPanelShell mode={mode}>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="max-w-sm text-sm text-muted-foreground">
            Preview is only available in the Croki desktop app.
          </p>
        </div>
      </PreviewPanelShell>
    );
  }

  return (
    <PreviewPanelShell mode={mode}>
      <PreviewView
        threadRef={threadRef}
        {...(tabId !== undefined ? { tabId } : {})}
        configuredUrls={configuredUrls}
        visible={visible}
        onAddCanvasEvidence={onAddCanvasEvidence}
        onBuildIdea={onBuildIdea}
        workspaceRoot={workspaceRoot}
        onPreviewComponent={onPreviewComponent}
        onExploreOptions={onExploreOptions}
        explorationState={explorationState}
        onKeepOption={onKeepOption}
        onCombineOption={onCombineOption}
        onDiscardOptions={onDiscardOptions}
        onStopExploration={onStopExploration}
        optionLabel={optionLabel}
      />
    </PreviewPanelShell>
  );
}
