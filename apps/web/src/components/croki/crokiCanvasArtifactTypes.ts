import type {
  CrokiCanvasArtifact,
  CrokiCanvasArtifactEdge,
  CrokiCanvasArtifactNode,
} from "@croki/shared/crokiCanvasArtifact";
import type { CrokiContextReference } from "@croki/shared/crokiContext";

export type { CrokiCanvasArtifactPositions } from "./crokiCanvasArtifactLayout";

export type CrokiCanvasArtifactNodeLike = CrokiCanvasArtifactNode & {
  readonly why?: string | null;
  readonly consequence?: string | null;
};

export type CrokiCanvasArtifactEdgeLike = CrokiCanvasArtifactEdge;

export type CrokiCanvasArtifactLike = CrokiCanvasArtifact;

export interface CrokiCanvasArtifactViewProps {
  /** The immutable revision currently being inspected. */
  readonly artifact: CrokiCanvasArtifactLike | null;
  readonly viewedRevision?: number;
  /** A newer immutable revision, if one exists. It never replaces `artifact`. */
  readonly latestArtifact?: CrokiCanvasArtifactLike | null;
  /** Optional complete revision list for callers that let the view switch revisions. */
  readonly artifacts?: readonly CrokiCanvasArtifactLike[];
  readonly selectedNodeIds?: readonly string[];
  readonly onSelectArtifactNodes?: (ids: readonly string[]) => void;
  readonly onUseArtifactSelection?: (nodes: readonly CrokiCanvasArtifactNodeLike[]) => void;
  readonly onUseSelectionInThread?: (ids: readonly string[]) => void;
  readonly onViewArtifactRevision?: (artifact: CrokiCanvasArtifactLike) => void;
  readonly onViewRevision?: (artifact: CrokiCanvasArtifactLike) => void;
  readonly onOpenArtifactThread?: (threadId: string) => void;
  readonly onBackToRelease?: () => void;
  readonly onOpenReference?: (reference: CrokiContextReference) => void;
}
