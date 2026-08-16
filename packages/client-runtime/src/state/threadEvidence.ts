import type {
  CheckpointRef,
  EventId,
  MessageId,
  OrchestrationCheckpointSummary,
  OrchestrationLatestTurn,
  OrchestrationMessage,
  OrchestrationProposedPlan,
  OrchestrationSession,
  OrchestrationThread,
  OrchestrationThreadActivity,
  ThreadId,
  TurnId,
} from "@croki/contracts";

/** Existing Croki surfaces that can inspect a source fact in context. */
export type ThreadEvidenceSurface =
  | "thread"
  | "diff"
  | "files"
  | "preview"
  | "terminal"
  | "review"
  | "git";

export type ThreadEvidenceSourceKind =
  | "thread"
  | "message"
  | "turn"
  | "session"
  | "plan"
  | "worker-thread"
  | "activity"
  | "checkpoint"
  | "file"
  | "ui-history"
  | "git"
  | "derived";

/**
 * A typed destination for opening evidence. The parent Thread remains the
 * canonical source; these targets only select an existing inspection surface.
 */
export interface ThreadEvidenceOpenTarget {
  readonly surface: ThreadEvidenceSurface;
  readonly threadId: ThreadId;
  readonly turnId?: TurnId;
  readonly messageId?: MessageId;
  readonly activityId?: EventId;
  readonly checkpointRef?: CheckpointRef;
  readonly filePath?: string;
  readonly screenId?: string;
  readonly workerThreadId?: ThreadId;
}

/** Every displayed fact carries this provenance and a real open destination. */
export interface ThreadEvidenceProvenance {
  readonly id: string;
  readonly kind: ThreadEvidenceSourceKind;
  readonly label: string;
  readonly observedAt: string | null;
  readonly target: ThreadEvidenceOpenTarget;
}

export type ThreadEvidenceFactState =
  | "observed"
  | "active"
  | "pending"
  | "failed"
  | "missing"
  | "settled";

export type CurrentRealitySection =
  | "outcome"
  | "direction"
  | "lane"
  | "work"
  | "judgment"
  | "repository"
  | "checks"
  | "shipping";

export interface CurrentRealityFact {
  readonly id: string;
  readonly section: CurrentRealitySection;
  readonly label: string;
  /** Exact source text or a bounded, deterministic projection of source fields. */
  readonly value: string;
  readonly detail?: string;
  readonly state: ThreadEvidenceFactState;
  readonly source: ThreadEvidenceProvenance;
  readonly supportingSources?: ReadonlyArray<ThreadEvidenceProvenance>;
}

export interface CurrentRealityWorkerInput {
  readonly threadId: ThreadId;
  readonly title: string;
  readonly state: string;
  readonly updatedAt: string;
  readonly attempt?: number | null;
}

/** Optional facts supplied by an existing Git/Review/environment read model. */
export type CurrentRealityAdditionalFact = CurrentRealityFact;

export type CurrentRealityThread = Pick<
  OrchestrationThread,
  | "id"
  | "title"
  | "branch"
  | "worktreePath"
  | "latestTurn"
  | "createdAt"
  | "updatedAt"
  | "messages"
  | "proposedPlans"
  | "activities"
  | "checkpoints"
  | "session"
>;

export interface CurrentRealityInput {
  readonly thread: CurrentRealityThread;
  readonly lastVisitedAt?: string | null;
  readonly workers?: ReadonlyArray<CurrentRealityWorkerInput>;
  readonly additionalFacts?: ReadonlyArray<CurrentRealityAdditionalFact>;
}

export interface CurrentRealityProjection {
  readonly threadId: ThreadId;
  readonly changedAt: string | null;
  readonly showOnEntry: boolean;
  readonly facts: ReadonlyArray<CurrentRealityFact>;
  readonly sections: Readonly<Record<CurrentRealitySection, ReadonlyArray<CurrentRealityFact>>>;
}

export type TurnResultStatus = "completed" | "interrupted" | "failed";

export type TurnResultFactKind =
  | "changed-files"
  | "check"
  | "visual-evidence"
  | "judgment"
  | "failure"
  | "git"
  | "provider-conclusion";

export interface TurnResultFact {
  readonly id: string;
  readonly kind: TurnResultFactKind;
  readonly label: string;
  readonly value: string;
  readonly detail?: string;
  readonly state: ThreadEvidenceFactState;
  readonly source: ThreadEvidenceProvenance;
  readonly supportingSources?: ReadonlyArray<ThreadEvidenceProvenance>;
  readonly attributedTo?: "provider" | "environment";
}

export type TurnResultAdditionalFact = TurnResultFact;

export interface TurnResultInput {
  readonly thread: CurrentRealityThread;
  readonly turnId?: TurnId | null;
  readonly additionalFacts?: ReadonlyArray<TurnResultAdditionalFact>;
}

export interface TurnResultProjection {
  readonly id: string;
  readonly threadId: ThreadId;
  readonly turnId: TurnId;
  readonly status: TurnResultStatus;
  readonly settledAt: string;
  readonly facts: ReadonlyArray<TurnResultFact>;
}

/** Narrow helper for tests and clients constructing a source-labelled fact. */
export function evidenceSource(input: ThreadEvidenceProvenance): ThreadEvidenceProvenance {
  return input;
}

export type ThreadEvidenceSourcePayload =
  | OrchestrationMessage
  | OrchestrationThreadActivity
  | OrchestrationCheckpointSummary
  | OrchestrationLatestTurn
  | OrchestrationSession
  | OrchestrationProposedPlan;
