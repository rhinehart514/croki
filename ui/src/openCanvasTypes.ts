export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

// Stable references identify authority records without copying provider-private state into the canvas.
export type StableRef = {
  type: string;
  id: string;
};

export type GoalStatus =
  | "active"
  | "needs-founder"
  | "waiting"
  | "paused"
  | "completed"
  | "abandoned"
  | "failed"
  | "stale";

export type Goal = {
  schemaVersion: number;
  id: string;
  projectId: string;
  statement: string;
  desiredChange?: string;
  scopeRefs: StableRef[];
  relatedGoalRefs: StableRef[];
  originRef?: StableRef;
  createdBy: string;
  revisionAuthor: string;
  status: GoalStatus;
  statusReason?: string;
  currentWorkRefs: StableRef[];
  revision: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  retiredAt?: string;
};

export type RelationReasoning = {
  type?: string;
  statement: string;
  provenance?: string;
};

export type GoalRelation = {
  schemaVersion: number;
  id: string;
  projectId: string;
  sourceRef: StableRef;
  targetRef: StableRef;
  kind: string;
  label?: string;
  basis: Array<StableRef | RelationReasoning>;
  declaredProvenance: string;
  provenance: string;
  createdBy: string;
  revisionAuthor: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  retiredAt?: string;
};

export type CanvasRegion = {
  schemaVersion: number;
  id: string;
  projectId: string;
  title: string;
  purpose: string | null;
  memberRefs: StableRef[];
  position: { x: number; y: number };
  size: { width: number; height: number };
  collapsed: boolean;
  founderPlaced: boolean;
  revision: number;
  createdBy: string;
  revisionAuthor: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
};

// Provider identity belongs on attributable receipts. The authority itself only requires an open actor type.
export type WorkActor = {
  type: string;
  [key: string]: JsonValue;
};

export type WorkReceipt = {
  [key: string]: JsonValue;
};

export type WorkArtifactRevision = {
  id: string;
  artifactId: string;
  projectId: string;
  lineageId: string;
  revision: number;
  parentRefs: StableRef[];
  kind: string;
  title: string | null;
  summary: string | null;
  format: string;
  contentType: string;
  status: string;
  content: JsonValue;
  contentHash: string;
  refs: StableRef[];
  evidence: WorkReceipt[];
  provenance: string;
  createdBy: WorkActor;
  modelReceipts: WorkReceipt[];
  toolReceipts: WorkReceipt[];
  createdAt: string;
  updatedAt: string;
  retiredAt?: string;
};

export type WorkRelationshipRevision = {
  id: string;
  relationshipId: string;
  projectId: string;
  revision: number;
  parentRefs: StableRef[];
  sourceRef: StableRef;
  targetRef: StableRef;
  kind: string;
  label: string | null;
  basis: JsonValue[];
  declaredProvenance: string;
  provenance: string;
  createdBy: WorkActor;
  modelReceipts: WorkReceipt[];
  toolReceipts: WorkReceipt[];
  createdAt: string;
  updatedAt: string;
  retiredAt?: string;
};

export type OpenCanvasErrorPayload = { error: string };
export type OpenCanvasConflictPayload = OpenCanvasErrorPayload & {
  code?: string;
  scope?: string;
  id?: string | null;
  expectedRevision?: number;
  actualRevision?: number;
};

export type GoalListResponse = { goals: Goal[] };
export type GoalRelationListResponse = { relations: GoalRelation[] };
export type GoalRelationHistoryResponse = { history: GoalRelation[] };
export type WorkArtifactListResponse = { artifacts: WorkArtifactRevision[]; storeRevision: number };
export type WorkRelationshipListResponse = { relationships: WorkRelationshipRevision[]; storeRevision: number };
export type WorkArtifactHistoryResponse = { history: WorkArtifactRevision[] };
export type WorkRelationshipHistoryResponse = { history: WorkRelationshipRevision[] };
export type CanvasRegionListResponse = { regions: CanvasRegion[]; storeRevision: number };

export type GoalConflictResolution = "keep-separate" | "choose-goal" | "acknowledge-coexistence";
export type GoalConflictDecision = {
  schemaVersion: number;
  id: string;
  conflictId: string;
  projectId: string;
  objectRef: StableRef;
  goalRefs: StableRef[];
  receiptFingerprint: string;
  resolution: GoalConflictResolution;
  chosenGoalRef?: StableRef;
  note: string | null;
  decidedBy: { type: "founder"; id: string };
  revision: number;
  createdAt: string;
  updatedAt: string;
};
export type GoalConflictDecisionListResponse = {
  projectId: string;
  storeRevision: number;
  decisions: GoalConflictDecision[];
};
export type RecordGoalConflictDecisionInput = IdempotentWrite & {
  expectedStoreRevision: number;
  expectedDecisionRevision?: number;
  resolution: GoalConflictResolution;
  chosenGoalRef?: StableRef;
  note?: string;
  decidedBy: { type: "founder"; id: string };
};

export type CanvasStructureHistoryEntry = {
  id: string;
  sequence: number;
  projectId: string;
  scope: "region" | "layout";
  operation: string;
  targetRef: StableRef;
  actor: string;
  summary: string;
  status: "applied" | "undone";
  createdAt: string;
  updatedAt: string;
  undoReceipt?: { idempotencyKey: string; actor: string; at: string; summary: string };
  redoReceipt?: { idempotencyKey: string; actor: string; at: string; summary: string };
};
export type CanvasStructureHistoryResponse = {
  projectId: string;
  revision: number;
  entries: CanvasStructureHistoryEntry[];
};
export type CanvasStructureHistoryMutationInput = IdempotentWrite & {
  expectedHistoryRevision: number;
  revisionAuthor: string;
};

export type IncludeRetiredOptions = { includeRetired?: boolean };
export type IdempotentWrite = { idempotencyKey: string };
export type GoalMutationActor = { revisionAuthor: string };

export type CreateGoalInput = IdempotentWrite & {
  id?: string;
  statement: string;
  desiredChange?: string;
  scopeRefs?: StableRef[];
  originRef?: StableRef;
  createdBy: string;
  status?: GoalStatus;
  statusReason?: string;
  currentWorkRefs?: StableRef[];
  expectedRevision?: number;
};

export type ReviseGoalInput = IdempotentWrite & GoalMutationActor & {
  expectedRevision: number;
  statement?: string;
  desiredChange?: string;
  scopeRefs?: StableRef[];
  originRef?: StableRef | null;
  statusReason?: string;
  currentWorkRefs?: StableRef[];
};

export type ChangeGoalStatusInput = IdempotentWrite & GoalMutationActor & {
  expectedRevision: number;
  status: GoalStatus;
  statusReason?: string;
};

export type RetireGoalInput = IdempotentWrite & GoalMutationActor & { expectedRevision: number };
export type RestoreGoalInput = RetireGoalInput;

export type CreateGoalRelationInput = IdempotentWrite & {
  id?: string;
  sourceRef: StableRef;
  targetRef: StableRef;
  kind: string;
  label?: string;
  basis: Array<StableRef | RelationReasoning | string>;
  provenance: string;
  createdBy: string;
};

export type ReviseGoalRelationInput = IdempotentWrite & GoalMutationActor & {
  expectedRevision: number;
  kind?: string;
  label?: string;
  basis?: Array<StableRef | RelationReasoning | string>;
  provenance?: string;
};

export type RetireGoalRelationInput = IdempotentWrite & GoalMutationActor & { expectedRevision: number };
export type RestoreGoalRelationInput = RetireGoalRelationInput;

export type CanvasRegionFields = {
  title?: string;
  purpose?: string;
  memberRefs?: StableRef[];
  position?: { x: number; y: number };
  size?: { width: number; height: number };
  collapsed?: boolean;
  placementMode?: "founder" | "automatic";
};

export type CreateCanvasRegionInput = IdempotentWrite & CanvasRegionFields & {
  expectedStoreRevision: number;
  title: string;
  id?: string;
  createdBy: string;
  revisionAuthor: string;
};
export type ReviseCanvasRegionInput = IdempotentWrite & CanvasRegionFields & {
  expectedRevision: number;
  revisionAuthor: string;
};
export type ArchiveCanvasRegionInput = IdempotentWrite & {
  expectedRevision: number;
  revisionAuthor: string;
};

export type WorkAttributionInput = {
  createdBy: WorkActor;
  modelReceipts?: WorkReceipt[];
  toolReceipts?: WorkReceipt[];
};

export type WorkArtifactFields = {
  kind: string;
  title?: string;
  summary?: string;
  format?: string;
  contentType?: string;
  status?: string;
  content?: JsonValue;
  refs?: StableRef[];
  evidence?: WorkReceipt[];
  provenance?: string;
  parentRef?: StableRef;
  parentRefs?: StableRef[];
};

export type CreateWorkArtifactInput = IdempotentWrite & WorkAttributionInput & WorkArtifactFields & {
  expectedStoreRevision: number;
  id?: string;
  artifactId?: string;
  lineageId?: string;
};

export type ReviseWorkArtifactInput = IdempotentWrite & WorkAttributionInput & Partial<WorkArtifactFields> & {
  expectedArtifactRevision: number;
};

export type BranchWorkArtifactInput = IdempotentWrite & WorkAttributionInput & Partial<WorkArtifactFields> & {
  expectedArtifactRevision: number;
  id?: string;
  artifactId?: string;
};

export type RetireWorkArtifactInput = IdempotentWrite & WorkAttributionInput & {
  expectedArtifactRevision: number;
  reason?: string;
  status?: string;
};

export type RestoreWorkArtifactInput = IdempotentWrite & WorkAttributionInput & {
  expectedArtifactRevision: number;
  revision?: number;
  status?: string;
};

export type WorkRelationshipFields = {
  sourceRef: StableRef;
  targetRef: StableRef;
  kind: string;
  label?: string;
  basis?: JsonValue[];
  provenance?: string;
};

export type CreateWorkRelationshipInput = IdempotentWrite & WorkAttributionInput & WorkRelationshipFields & {
  expectedStoreRevision: number;
  id?: string;
  relationshipId?: string;
};

export type ReviseWorkRelationshipInput = IdempotentWrite & WorkAttributionInput & Partial<WorkRelationshipFields> & {
  expectedRelationshipRevision: number;
};

export type RetireWorkRelationshipInput = IdempotentWrite & WorkAttributionInput & {
  expectedRelationshipRevision: number;
};

export type RestoreWorkRelationshipInput = RetireWorkRelationshipInput;
