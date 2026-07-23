import type { FirmConfiguration, FirmConversationMessage, FirmPlacement } from "@/types";
import type { FirmModelBranch, FirmModelBranchProjection, FirmModelMergeReceipt, FirmSemanticModel, FirmWorkScope, MarketMovementIndex, OutwardActionReceipt, OutwardObservation, OutwardReturnEvidence } from "@/types";
import { finishReturnDecisionTimer, recordUxMetric } from "@/lib/ux-metrics";
import { get, guardedDelete, guardedGet, guardedPost, guardedPut } from "./transport";
import type { FirmVenture } from "./work";
export const getCurrentModel = (ventureId: string) =>
  get<{ model: FirmSemanticModel }>(`/api/ventures/${encodeURIComponent(ventureId)}/model`);

export const listModelBranches = (ventureId: string) =>
  get<{ branches: FirmModelBranch[]; revision: number }>(`/api/ventures/${encodeURIComponent(ventureId)}/model/branches`);

export const getModelBranch = (ventureId: string, branchId: string) =>
  get<{ branch: FirmModelBranchProjection }>(`/api/ventures/${encodeURIComponent(ventureId)}/model/branches/${encodeURIComponent(branchId)}`);

export const mergeModelBranch = (ventureId: string, branchId: string, selectedChangeRefs: string[], reason: string, resolvedConflicts: Record<string, unknown>[] = []) =>
  guardedPost<{ receipt: FirmModelMergeReceipt; model: FirmSemanticModel }>(`/api/ventures/${encodeURIComponent(ventureId)}/model/branches/${encodeURIComponent(branchId)}/merge`, { selectedChangeRefs, reason, resolvedConflicts });

export const closeModelBranch = (ventureId: string, branchId: string, reason: string) =>
  guardedPost<{ branch: FirmModelBranch }>(`/api/ventures/${encodeURIComponent(ventureId)}/model/branches/${encodeURIComponent(branchId)}/close`, { reason });

export const getWorkScopes = (ventureId: string) =>
  get<{ workScopes: FirmWorkScope[] }>(`/api/ventures/${encodeURIComponent(ventureId)}/work-scopes`);

export const createWorkScope = (ventureId: string, body: {
  originThreadRef: string;
  originMessageRef: string;
  objective: string;
  subjectRefs?: string[];
  branchRefs?: string[];
  allowedInwardEffects?: string[];
  wakeOnEvidenceRefs?: string[];
  resumeOnRestart?: boolean;
  spendPolicyRef?: string | null;
  stopConditions?: string[];
}) => guardedPost<{ workScope: FirmWorkScope }>(`/api/ventures/${encodeURIComponent(ventureId)}/work-scopes`, body);

export const revokeWorkScope = (ventureId: string, scopeId: string, reason: string) =>
  guardedPost<{ workScope: FirmWorkScope }>(`/api/ventures/${encodeURIComponent(ventureId)}/work-scopes/${encodeURIComponent(scopeId)}/revoke`, { reason });

export const getMarketMovement = (ventureId: string) =>
  get<{ marketMovement: MarketMovementIndex }>(`/api/ventures/${encodeURIComponent(ventureId)}/market-movement`);

export type JourneyInputKind = "event-rows" | "aggregate-transitions";
export type JourneyFieldMapping =
  | { sequenceKey: string; timestamp: string; route: string; eventName?: string }
  | { from: string; to: string; count: string };

export type JourneyImportProfile = {
  importRef: string;
  name: string;
  mediaType: string;
  byteSize: number;
  digest: string;
  valid: boolean;
  format: "json" | "jsonl" | "csv";
  rowCount: number;
  columns: Array<{ name: string; sensitive: boolean }>;
  inferredMapping: { inputKind: JourneyInputKind | null; fields: Record<string, string | null> };
  routes: Array<{
    token: string;
    count: number;
    shape?: string;
    match: { pageRef: string; pageName: string; basis: "exact-route" } | null;
  }>;
  pageModelRevision: number;
  pageCandidates: Array<{ pageRef: string; name: string; route: string }>;
  issues: Array<{ code: string; message: string }>;
};

export type JourneyMappingProposal = {
  inputKind: JourneyInputKind;
  fields: JourneyFieldMapping;
  routeMappings?: Record<string, string>;
  timezone?: string;
  sourceRef?: string;
};

export type JourneyImportPreview = {
  importRef: string;
  inputKind: JourneyInputKind;
  pageModelRevision: number;
  source: { name: string; mediaType: string; byteSize: number; digest: string };
  mapping: JourneyMappingProposal;
  rejectedRows: { count: number; reasons: Array<{ reason: string; count: number }> };
  window: { from: string; to: string; timezone: string } | null;
  pageCounts: Array<{ pageRef: string; count: number }>;
  transitions: Array<{ fromPageRef: string; toPageRef: string; count: number }>;
  dropOffs: Array<{ pageRef: string; count: number }>;
  unmatchedRoutes: Array<{ route: string; count: number }>;
};

export type JourneyObservationSnapshot = {
  id: string;
  ventureId: string;
  receiptRef: string;
  sourceRef: string;
  window: { from: string; to: string; timezone: string };
  pageCounts: Array<{ pageRef: string; count: number }>;
  transitions: Array<{ fromPageRef: string; toPageRef: string; count: number }>;
  dropOffs: Array<{ pageRef: string; count: number }>;
  unmatchedRoutes: Array<{ route: string; count: number }>;
  createdAt: string;
};

export type JourneyImportReceipt = {
  id: string;
  ventureId: string;
  importRef: string;
  sourceRef: string;
  file: { name: string; mediaType: string; byteSize: number; digest: string };
  inputKind: JourneyInputKind;
  rowCount: number;
  rejectedRows: { count: number; reasons: Array<{ reason: string; count: number }> };
  fieldMapping: JourneyFieldMapping;
  routeToPageMapping: Record<string, string>;
  sourceWindow: { from: string; to: string; timezone: string };
  pageModelRevision: number;
  threadRef: string | null;
  messageRef: string | null;
  importedBy: { authority: "founder"; id: string };
  adoptedAt: string;
};

export type JourneyMappingProposalRecord = {
  id: string;
  ventureId: string;
  importRef: string;
  revision: number;
  status: "proposed";
  mapping: JourneyMappingProposal;
  pageModelRevision: number;
  preview: {
    window: { from: string; to: string; timezone: string };
    pageCounts: Array<{ pageRef: string; count: number }>;
    transitions: Array<{ fromPageRef: string; toPageRef: string; count: number }>;
    dropOffs: Array<{ pageRef: string; count: number }>;
    unmatchedRoutes: Array<{ route: string; count: number }>;
    rejectedRows: { count: number; reasons: Array<{ reason: string; count: number }> };
  };
  threadRef: string | null;
  messageRef: string | null;
  proposedBy: { authority: "agent"; id: string };
  createdAt: string;
  updatedAt: string;
};

export const stageJourneyImport = (ventureId: string, body: { name: string; mediaType?: string; data: string }) =>
  guardedPost<{ import: JourneyImportProfile }>(`/api/ventures/${encodeURIComponent(ventureId)}/journey-imports`, body);

export const previewJourneyImport = (ventureId: string, importRef: string, mapping: JourneyMappingProposal) =>
  guardedPost<{ preview: JourneyImportPreview }>(`/api/ventures/${encodeURIComponent(ventureId)}/journey-imports/${encodeURIComponent(importRef)}/preview`, mapping);

export const adoptJourneyImport = (ventureId: string, importRef: string, mapping: JourneyMappingProposal, body: {
  expectedPageModelRevision: number;
  threadRef?: string | null;
  messageRef?: string | null;
  sourceRef?: string;
}) => guardedPost<{ snapshot: JourneyObservationSnapshot; receipt: JourneyImportReceipt }>(
  `/api/ventures/${encodeURIComponent(ventureId)}/journey-imports/${encodeURIComponent(importRef)}/adopt`,
  { mapping, ...body },
);

export const deleteJourneyImport = (ventureId: string, importRef: string) =>
  guardedDelete<{ deleted: true }>(`/api/ventures/${encodeURIComponent(ventureId)}/journey-imports/${encodeURIComponent(importRef)}`);

export const getJourneyObservations = (ventureId: string) =>
  get<{ observations: JourneyObservationSnapshot[]; receipts: JourneyImportReceipt[] }>(
    `/api/ventures/${encodeURIComponent(ventureId)}/journey-observations`,
  );

export const getJourneyMappingProposals = (ventureId: string, importRef?: string) => {
  const query = importRef ? `?importRef=${encodeURIComponent(importRef)}` : "";
  return get<{ proposals: JourneyMappingProposalRecord[] }>(
    `/api/ventures/${encodeURIComponent(ventureId)}/journey-mapping-proposals${query}`,
  );
};

export const executeOutwardAction = (ventureId: string, actionId: string) =>
  guardedPost<{ outwardAction: OutwardActionReceipt }>(`/api/ventures/${encodeURIComponent(ventureId)}/outward-actions/${encodeURIComponent(actionId)}/execute`, {});

export const grantOutwardObservation = (ventureId: string, actionId: string) =>
  guardedPost<{ observation: OutwardObservation }>(`/api/ventures/${encodeURIComponent(ventureId)}/outward-actions/${encodeURIComponent(actionId)}/observations`, {});

export const checkOutwardObservation = (ventureId: string, actionId: string, observationId: string) =>
  guardedPost<{ contract: OutwardObservation; evidence: OutwardReturnEvidence | null }>(`/api/ventures/${encodeURIComponent(ventureId)}/outward-actions/${encodeURIComponent(actionId)}/observations/${encodeURIComponent(observationId)}/check`, {});

export const getConversation = (ventureId: string) =>
  get<{ messages: FirmConversationMessage[] }>(`/api/ventures/${encodeURIComponent(ventureId)}/conversation`);

export const getImageAttachment = (ventureId: string, imageId: string) =>
  get<{ dataUrl: string }>(`/api/ventures/${encodeURIComponent(ventureId)}/attachments/${encodeURIComponent(imageId)}/data`);

// Review-is-dialogue (build contract §4A.2, Phase 4): a founder reply in the thread, interpreted as
// one dialogue act (steer / approve / approve-standing / close / new-direction) and dispatched to the
// existing seams server-side. `betId` scopes the reply to the effort it answers. INTEGRATION POINT:
// added to the shared api.ts; a conversation component calls this instead of a per-purpose button set.
export type ConversationReplyResult = {
  act: "steer" | "answer" | "stop-run" | "involve-participant" | "parallel-attempts" | "critique" | "approve" | "approve-standing" | "close-thread" | "close" | "new-direction" | "observe";
  betId?: string | null;
  messageId?: string;
  applied?: string;
  ended?: boolean;
  teammateRef?: string;
  threadRef?: string;
  accepted?: boolean;
  stoppedRunRef?: string;
  needsFounderJudgment?: boolean;
  why?: string;
  waitingItemId?: string | null;
  grant?: { actType: string; grantedAt: string } | null;
  note?: string;
  evidence?: { polled?: number; ingested?: unknown[]; reason?: string };
  outcome?: { kind?: string; summary?: string };
  messages?: FirmConversationMessage[];
};

export type ComposerImageInput = { name: string; mediaType: string; data: string };

export const replyInConversation = (
  ventureId: string,
  body: { message: string; images?: ComposerImageInput[]; journeyImportRef?: string; threadRef?: string | null; betId?: string | null; workRef?: string | null; modelBranchRef?: string | null; subjectRefs?: string[]; teammateRefs?: string[]; mode?: "work" | "context"; runtime?: string | null; model?: string | null; effort?: string | null; productGtmView?: boolean; workflowSketch?: boolean; artifactSection?: { title: string; index: number }; workflowStep?: { id: string; label: string; position: number } },
) => guardedPost<ConversationReplyResult>(
  `/api/ventures/${encodeURIComponent(ventureId)}/conversation/reply`,
  body,
);

// Live event stream (build contract §2.4 / Phase 5): subscribe to the brain's SSE push so a present
// founder sees work stream without the 900 ms poll. The stream carries data-free notifications
// ({ ventureId, kind, at }); a listener re-reads the relevant surface through the existing routes. The
// caller keeps the 900 ms poll as the reconnect fallback (see useFirmEventStream). Returns an
// unsubscribe function that closes the connection.
export type FirmStreamEvent = DroverVentureStreamEvent;

export function subscribeVentureEvents(
  ventureId: string,
  onEvent: (event: FirmStreamEvent) => void,
  onStateChange?: (state: "open" | "closed") => void,
): () => void {
  if (window.droverDesktop?.api) {
    let active = true;
    let unsubscribe: (() => void) | null = null;
    void window.droverDesktop.api.subscribe(ventureId, onEvent).then((stop) => {
      if (!active) stop();
      else {
        unsubscribe = stop;
        onStateChange?.("open");
      }
    }).catch(() => onStateChange?.("closed"));
    return () => {
      active = false;
      unsubscribe?.();
      onStateChange?.("closed");
    };
  }
  if (typeof EventSource === "undefined") return () => {};
  const source = new EventSource(`/api/ventures/${encodeURIComponent(ventureId)}/events`);
  const relay = (message: MessageEvent) => {
    try {
      onEvent(JSON.parse(message.data) as FirmStreamEvent);
    } catch {
      /* a malformed frame is ignored; the poll fallback still refreshes the surface */
    }
  };
  for (const kind of ["lens", "conversation", "drive", "wall", "outcome", "timeline", "system", "release"]) {
    source.addEventListener(kind, relay as EventListener);
  }
  source.onopen = () => onStateChange?.("open");
  source.onerror = () => onStateChange?.("closed");
  return () => { source.close(); onStateChange?.("closed"); };
}

export type FirmActiveDrive = {
  id: string;
  ventureId: string;
  teammateRef: string;
  betId: string | null;
  runtime: string;
  startedAt: string;
  abortSupported: boolean;
  abortRequestedAt: string | null;
  activity?: string | null;
  currentStageId?: string | null;
  lastBeatAt?: string | null;
};

export const getActiveDrives = (ventureId: string) =>
  get<{ drives: FirmActiveDrive[] }>(`/api/ventures/${encodeURIComponent(ventureId)}/drives/active`);

export const stopActiveDrive = (ventureId: string, driveId: string) =>
  guardedPost<{ drive: FirmActiveDrive }>(
    `/api/ventures/${encodeURIComponent(ventureId)}/drives/${encodeURIComponent(driveId)}/abort`,
    {},
  );

export type FirmConfigurationReceipt = {
  id: string;
  revision: number;
  source: string;
  summary: string;
};

export const putFirmConfiguration = (
  ventureId: string,
  expectedRevision: number,
  configuration: FirmConfiguration,
  summary: string,
) => guardedPut<{ configuration: FirmConfiguration; receipt: FirmConfigurationReceipt; message: FirmConversationMessage }>(
  `/api/ventures/${encodeURIComponent(ventureId)}/configuration`,
  { expectedRevision, configuration, summary },
);

export const applyConfigurationProposal = (ventureId: string, proposalId: string, expectedRevision: number) =>
  guardedPost<{ configuration: FirmConfiguration; receipt: FirmConfigurationReceipt; message: FirmConversationMessage }>(
    `/api/ventures/${encodeURIComponent(ventureId)}/configuration/proposals/${encodeURIComponent(proposalId)}/apply`,
    { expectedRevision },
  );

export const restoreConfiguration = (ventureId: string, expectedRevision: number, receiptId: string) =>
  guardedPost<{ configuration: FirmConfiguration; receipt: FirmConfigurationReceipt; message: FirmConversationMessage }>(
    `/api/ventures/${encodeURIComponent(ventureId)}/configuration/restore`,
    { expectedRevision, receiptId },
  );

export const proposeCapability = (ventureId: string, agentRef: string, capability: string) =>
  guardedPost<{ proposal: Record<string, unknown>; message: FirmConversationMessage }>(
    `/api/ventures/${encodeURIComponent(ventureId)}/configuration/proposals/capability`,
    { agentRef, capability },
  );

export const putPlacement = (
  ventureId: string,
  body: { positions: Record<string, { x: number; y: number }>; expectedRevision: number },
) => guardedPut<{ placement: FirmPlacement }>(`/api/ventures/${encodeURIComponent(ventureId)}/placement`, body);

export type WallPurpose = "release" | "answer" | "review-outcome" | "end-bet";
export type WallDecision = "release" | "reject" | "authorize-deploy" | "answer" | "dismiss" | "acknowledge" | "kill" | "keep";

export type WallQueueItemView = {
  id: string;
  ventureId: string;
  betId: string | null;
  workRef?: string | null;
  purpose: WallPurpose;
  blocksBet: boolean;
  effect: Record<string, unknown>;
  parkedAt: string;
  decision: string | null;
  deployAuthorizedAt?: string | null;
  lastExecutionError?: string | null;
  needsReconnect?: boolean;
  lastAttemptAt?: string | null;
};

export const getWallQueue = (ventureId: string) =>
  get<{ queue: WallQueueItemView[] }>(`/api/ventures/${encodeURIComponent(ventureId)}/wall`);

export type PortfolioFrontierEligibility = {
  status: "eligible" | "proof-required";
  proofDate: string | null;
  requirement: string;
  activation: string;
};

export type PortfolioWallContext = {
  ventureId: string;
  betId: string | null;
  outcomeId: string | null;
};

export type PortfolioWallGroup = {
  venture: Pick<FirmVenture, "id" | "name">;
  items: Array<WallQueueItemView & { context: PortfolioWallContext }>;
};

export const getPortfolioWall = () =>
  guardedGet<{ eligibility: PortfolioFrontierEligibility; groups: PortfolioWallGroup[] }>("/api/portfolio/wall");

export type VentureTransferFile = {
  format: "drover-venture-transfer";
  version: 1;
  exportedAt: string;
  venture: {
    manifest: Omit<FirmVenture, "repository">;
    documents: Record<string, unknown[]>;
    souls: unknown[];
  };
  resume: {
    provider: "cold";
    productChanges: "refork-required";
    destinationRepository: "rebind-required";
  };
};

export type VentureTransferReceipt = {
  id: "transfer";
  receiptId: string;
  importedAt: string;
  sourceExportedAt: string | null;
  repository: string;
  providerResume: "cold";
  productChangeWorktrees: "refork-required" | "none";
  reforkWorkspaceIds: string[];
};

export const exportVentureTransfer = (ventureId: string) =>
  guardedGet<{ transfer: VentureTransferFile }>(`/api/ventures/${encodeURIComponent(ventureId)}/transfer`);

export const importVentureTransfer = (transfer: VentureTransferFile, repository: string) =>
  guardedPost<{ venture: FirmVenture; receipt: VentureTransferReceipt }>("/api/ventures/import", { transfer, repository });

export const decideWallItem = (
  ventureId: string,
  itemId: string,
  body: { decision: WallDecision; note?: string | null },
) => guardedPost<{ receipt: Record<string, unknown> }>(
  `/api/ventures/${encodeURIComponent(ventureId)}/wall/${encodeURIComponent(itemId)}/decide`,
  body,
).then((result) => {
  finishReturnDecisionTimer(ventureId);
  if (body.decision === "release") {
    recordUxMetric("wall_released", ventureId);
  } else if (body.decision === "reject") {
    recordUxMetric("wall_rejected", ventureId);
  }
  return result;
});

export type ProductChangeReadiness = {
  ready: boolean;
  status: "proposed" | "approved" | "rejected" | "applying" | "applied" | "reverted";
  reasons: string[];
};

export const getProductChangeReadiness = (ventureId: string, workspaceId: string, revisionId: string) =>
  get<{ readiness: ProductChangeReadiness }>(
    `/api/ventures/${encodeURIComponent(ventureId)}/product-change-workspaces/${encodeURIComponent(workspaceId)}/revisions/${encodeURIComponent(revisionId)}/readiness`,
  );

export const reviewProductChange = (
  ventureId: string,
  workspaceId: string,
  revisionId: string,
  body: { decision: "approve" | "reject"; note?: string | null },
) => guardedPost<{ revision: { status: ProductChangeReadiness["status"] } }>(
  `/api/ventures/${encodeURIComponent(ventureId)}/product-change-workspaces/${encodeURIComponent(workspaceId)}/revisions/${encodeURIComponent(revisionId)}/review`,
  body,
);

export const driveTeammate = (
  ventureId: string,
  body: {
    teammateRef?: string;
    teammateRefs?: string[];
    goal: string;
    betId?: string | null;
    // branchFrom names a parent bet to fork a genuinely distinct sibling from before the drive begins —
    // the deterministic HTTP fork verb behind "try another approach". The brain seeds the child bet and
    // scopes the drive to it (work-routes.mjs), so a sibling is guaranteed rather than prompt-dependent.
    branchFrom?: string | null;
    workRef?: string | null;
    threadRef?: string | null;
    subjectRefs?: string[];
    architectureTarget?: { id: string; stepId?: string | null; revision: number };
    theoryTarget?: { theoryId: string; subjectId: string };
    runtime?: string | null;
    model?: string | null;
    effort?: string | null;
    images?: ComposerImageInput[];
  },
) => guardedPost<DriveTeammateResult>(
  `/api/ventures/${encodeURIComponent(ventureId)}/drive`,
  body,
).then((result) => {
  if (body.betId || body.branchFrom) recordUxMetric("correction_sent", ventureId);
  return result;
});

export type DriveTeammateResult = {
  outcome: { kind?: string; summary?: string };
  work: Record<string, unknown>;
  runtime: { id: string; label: string; auth: string | null };
  handoff: FirmConversationMessage | null;
  messages?: FirmConversationMessage[];
  completion?: import("@/types").FirmDriveCompletion;
};
