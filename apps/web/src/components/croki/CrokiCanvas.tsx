import { CrokiCanvasArtifactView } from "./CrokiCanvasArtifact";
import { CrokiContextCanvas } from "./CrokiContextCanvas";
import { CrokiReleaseCanvas } from "./CrokiReleaseCanvas";
import type { CrokiCanvasProps } from "./crokiCanvasProps";

export type { CrokiCanvasProps } from "./crokiCanvasProps";

export function CrokiCanvas(props: CrokiCanvasProps) {
  if (props.artifact !== undefined) {
    if (props.artifact === null) {
      return (
        <CrokiReleaseCanvas
          environmentId={props.environmentId}
          productName={props.productName}
          workspaceRoot={props.workspaceRoot}
          {...(props.activeThread !== undefined ? { activeThread: props.activeThread } : {})}
          {...(props.onOpenThread ? { onOpenThread: props.onOpenThread } : {})}
          {...(props.onOpenContext ? { onOpenContext: props.onOpenContext } : {})}
          {...(props.onOpenReference ? { onOpenReference: props.onOpenReference } : {})}
          {...(props.onPendingChange ? { onPendingChange: props.onPendingChange } : {})}
        />
      );
    }
    return (
      <CrokiCanvasArtifactView
        artifact={props.artifact}
        {...(props.viewedRevision !== undefined ? { viewedRevision: props.viewedRevision } : {})}
        {...(props.latestArtifact !== undefined ? { latestArtifact: props.latestArtifact } : {})}
        {...(props.artifacts !== undefined ? { artifacts: props.artifacts } : {})}
        {...(props.selectedNodeIds !== undefined ? { selectedNodeIds: props.selectedNodeIds } : {})}
        {...(props.onSelectArtifactNodes
          ? { onSelectArtifactNodes: props.onSelectArtifactNodes }
          : {})}
        {...(props.onUseArtifactSelection
          ? { onUseArtifactSelection: props.onUseArtifactSelection }
          : {})}
        {...(props.onUseSelectionInThread
          ? { onUseSelectionInThread: props.onUseSelectionInThread }
          : {})}
        {...(props.onViewArtifactRevision
          ? { onViewArtifactRevision: props.onViewArtifactRevision }
          : {})}
        {...(props.onViewRevision ? { onViewRevision: props.onViewRevision } : {})}
        {...(props.onOpenArtifactThread
          ? { onOpenArtifactThread: props.onOpenArtifactThread }
          : {})}
        {...(props.onBackToRelease ? { onBackToRelease: props.onBackToRelease } : {})}
        {...(props.onOpenReference ? { onOpenReference: props.onOpenReference } : {})}
      />
    );
  }
  return <CrokiContextCanvas {...props} />;
}
