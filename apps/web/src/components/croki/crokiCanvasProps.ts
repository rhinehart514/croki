import type { EnvironmentId } from "@croki/contracts";
import type { CrokiContextReference } from "@croki/shared/crokiContext";
import type { CrokiReleaseSourceThread } from "@croki/shared/crokiReleaseCandidate";

import type { ActivePlanState } from "~/session-logic";

import type { CrokiCanvasView } from "./crokiCanvasLanguage";
import type { CrokiCanvasArtifactLike, CrokiCanvasArtifactNodeLike } from "./CrokiCanvasArtifact";
import type {
  CrokiPerceptionFrame,
  CrokiProjectPerceptionSnapshot,
} from "@croki/shared/crokiPerception";

export interface CrokiCanvasProps {
  readonly environmentId: EnvironmentId;
  /** Primary live sense packet. Legacy project data is only a fallback projection. */
  readonly perceptionFrame?: CrokiPerceptionFrame | CrokiProjectPerceptionSnapshot | null;
  /** Legacy projections are accepted during migration and rendered into the same scene. */
  readonly artifact?: CrokiCanvasArtifactLike | null;
  readonly viewedRevision?: number;
  readonly latestArtifact?: CrokiCanvasArtifactLike | null;
  readonly artifacts?: readonly CrokiCanvasArtifactLike[];
  readonly selectedNodeIds?: readonly string[];
  readonly onSelectArtifactNodes?: (ids: readonly string[]) => void;
  readonly onUseArtifactSelection?: (nodes: readonly CrokiCanvasArtifactNodeLike[]) => void;
  readonly onUseSelectionInThread?: (ids: readonly string[]) => void;
  readonly onViewArtifactRevision?: (artifact: CrokiCanvasArtifactLike) => void;
  readonly onViewRevision?: (artifact: CrokiCanvasArtifactLike) => void;
  /** Optional founder authority seams. The projection stays read-only when omitted. */
  readonly onApproveCanvasObjects?: (ids: readonly string[]) => void;
  readonly onChooseCanvasBranch?: (artifact: CrokiCanvasArtifactLike) => void;
  readonly onOpenArtifactThread?: (threadId: string) => void;
  readonly onBackToRelease?: () => void;
  readonly onOpenContext?: () => void;
  readonly activeThread?: CrokiReleaseSourceThread | null;
  readonly onOpenThread?: (threadId: string) => void;
  readonly externalNodeIds?: readonly string[];
  readonly externalQuestion?: string | null;
  readonly externalRevision?: string | null;
  readonly externalView?: CrokiCanvasView | null;
  readonly activePlan?: ActivePlanState | null;
  readonly onBuildFromRepository?: () => void;
  readonly onOpenReference?: (reference: CrokiContextReference) => void;
  readonly onPendingChange?: (pending: boolean) => void;
  readonly onPrepareGtm?: () => void;
  readonly onOpenPlan?: () => void;
  readonly productName: string;
  readonly workspaceRoot: string;
}

export type CrokiReleaseCanvasProps = Pick<
  CrokiCanvasProps,
  | "activeThread"
  | "environmentId"
  | "onOpenReference"
  | "onOpenContext"
  | "onOpenThread"
  | "onPendingChange"
  | "productName"
  | "workspaceRoot"
>;
