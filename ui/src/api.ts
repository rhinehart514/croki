import type {
  FirmArchitectureDocument,
  FirmArchitectureOperation,
  FirmArchitectureProposal,
  FirmArchitectureProposalDecision,
  FirmArchitectureProposalDecisionResponse,
  FirmArchitectureSystemAcceptanceResponse,
  FirmArchitectureProjection,
  FirmArchitectureProposalsResponse,
  FirmConfiguration,
  FirmConversationMessage,
  FirmLens,
  FirmPlacement,
} from "@/types";
import { identityHeaders } from "@/lib/identity";
import { requireFreshConnection } from "@/lib/freshness";
import { finishReturnDecisionTimer, recordUxMetric } from "@/lib/ux-metrics";

type ErrorPayload = { error?: string; code?: string };

export type ApiConnectionObservation = {
  kind: "response" | "network-error";
  path: string;
  method: string;
  observedAt: string;
  ok: boolean;
  status: number | null;
  serverInstance: string | null;
  serverRespondedAt: string | null;
  error: string | null;
};

type ApiConnectionListener = (observation: ApiConnectionObservation) => void;
const connectionListeners = new Set<ApiConnectionListener>();

export function subscribeApiConnection(listener: ApiConnectionListener) {
  connectionListeners.add(listener);
  return () => connectionListeners.delete(listener);
}

function observeConnection(observation: ApiConnectionObservation) {
  for (const listener of connectionListeners) listener(observation);
}

export class ApiError extends Error {
  readonly status: number | null;
  readonly code: string | null;

  constructor(
    message: string,
    status: number | null,
    code: string | null,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export type DroverHealth = {
  ok: boolean;
  instanceId: string;
  startedAt: string;
  now: string;
  founderAuthority: {
    available: boolean;
    transport: "desktop-host";
    header: string;
    replayWindowMs: number;
  };
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = init.method ?? "GET";
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...identityHeaders(),
        ...init.headers,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    observeConnection({
      kind: "network-error", path, method, observedAt: new Date().toISOString(), ok: false,
      status: null, serverInstance: null, serverRespondedAt: null, error: message,
    });
    throw new ApiError(message, null, "network_error");
  }
  const payload = (await response.json().catch(() => ({}))) as T & ErrorPayload;
  const message = response.ok ? null : (payload.error || `${path} failed (${response.status}).`);
  observeConnection({
    kind: "response", path, method, observedAt: new Date().toISOString(), ok: response.ok,
    status: response.status,
    serverInstance: response.headers.get("x-drover-server-instance"),
    serverRespondedAt: response.headers.get("x-drover-responded-at"),
    error: message,
  });
  if (!response.ok) throw new ApiError(message!, response.status, payload.code ?? null);
  return payload;
}

const get = <T,>(path: string) => request<T>(path);
const post = <T,>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) });
const put = <T,>(path: string, body: unknown) => request<T>(path, { method: "PUT", body: JSON.stringify(body) });
const del = <T,>(path: string) => request<T>(path, { method: "DELETE" });
const guardedPost = <T,>(path: string, body: unknown) => {
  requireFreshConnection();
  return post<T>(path, body);
};
const guardedGet = <T,>(path: string) => {
  requireFreshConnection();
  return get<T>(path);
};
const guardedPut = <T,>(path: string, body: unknown) => {
  requireFreshConnection();
  return put<T>(path, body);
};
const guardedDelete = <T,>(path: string) => {
  requireFreshConnection();
  return del<T>(path);
};

export const getHealth = () => get<DroverHealth>("/api/health");

export const markFounderPresent = () => post<{ present: boolean }>("/api/presence", {});
export const markFounderAway = () => post<{ present: boolean }>("/api/presence", { away: true });

export type FirmVenture = {
  id: string;
  name: string;
  repository: string;
  createdAt: string;
  updatedAt: string;
};

export type RepositoryChoice = {
  name: string;
  path: string;
  source: "workspace" | "venture";
};

export const listVentures = () => get<{ ventures: FirmVenture[] }>("/api/ventures");
export const listRepositoryChoices = () => get<{ repositories: RepositoryChoice[] }>("/api/repositories");
export const createVenture = (name: string, repository: string) =>
  guardedPost<{ venture: FirmVenture }>("/api/ventures", { name, repository });

export type FirmHeatSettings = { heat: "off" | "steady" | "full"; dailySpendUsd: number };
export const getHeatSettings = (ventureId: string) =>
  get<FirmHeatSettings>(`/api/ventures/${encodeURIComponent(ventureId)}/heat`);
export const setHeatSettings = (ventureId: string, settings: FirmHeatSettings) =>
  guardedPost<FirmHeatSettings>(`/api/ventures/${encodeURIComponent(ventureId)}/heat`, settings);

export type FirmRuntimeStatus = {
  id: "claude-code" | "codex";
  label: string;
  connected: boolean;
  auth: string | null;
  authLabel: string | null;
  reason: string | null;
};

export const getRuntimeStatuses = () => get<{ runtimes: FirmRuntimeStatus[] }>("/api/runtimes");

export type FounderCredential = {
  provider: string;
  label: string | null;
  savedAt: string;
  hasToken: boolean;
  authType: "oauth" | "token";
  accountAddress?: string;
};

export const getCredentials = () => get<{ credentials: FounderCredential[] }>("/api/credentials");
export const connectGmail = (clientId: string, clientSecret: string) =>
  guardedPost<{ credential: FounderCredential; credentials: FounderCredential[] }>(
    "/api/credentials/gmail/connect",
    { clientId, clientSecret },
  );
export const removeCredential = (provider: string) =>
  guardedDelete<{ removed: boolean; credentials: FounderCredential[] }>(
    `/api/credentials/${encodeURIComponent(provider)}`,
  );

export const getLens = (ventureId: string) =>
  get<{ lens: FirmLens }>(`/api/ventures/${encodeURIComponent(ventureId)}/lens`);

export type WorkIndexLifecycle = "open" | "closed";
export type WorkIndexActivity = "queued" | "running" | "stopping" | "idle";
export type WorkIndexAttention = "decision" | "review" | "failure" | "none";
export type WorkIndexTerminal = "completed" | "failed" | "cancelled" | "paused" | "budget-exhausted" | "interrupted" | null;

export type WorkIndexItem = {
  threadRef: string;
  ventureRef: string;
  parentThreadRef: string | null;
  originMessageRef: string | null;
  subjectRefs: string[];
  focusRef: string;
  founderIntent: string;
  lifecycle: WorkIndexLifecycle;
  activity: WorkIndexActivity;
  attention: WorkIndexAttention;
  terminal: WorkIndexTerminal;
  unread: boolean;
  reviewedThrough: string | null;
  latestMeaningfulEvent: { kind: string; ref: string; at: string | null; summary: string | null };
  runRefs: string[];
  pinnedAt: string | null;
  participantRefs: string[];
  activeParticipantRefs: string[];
  matchRefs?: Array<{ kind: "message" | "artifact" | "evidence" | "decision"; ref: string; label: string }>;
  createdAt: string | null;
  updatedAt: string | null;
};

export type WorkIndexOutlineObject = {
  id: string;
  objectRef: string;
  name: string;
  statement: string;
  type: string;
  territory: "product" | "gtm" | null;
  sectionId: string;
  parentRef: string | null;
  assertion: "tentative" | "founder-asserted";
  provenance: Record<string, unknown> | null;
  details: Record<string, unknown>;
  threadRefs: string[];
  targetable: boolean;
  architectureRole: string | null;
  updatedAt: string | null;
};

export type WorkIndexOutlineRelationship = {
  id: string;
  fromRef: string;
  toRef: string;
  label: string;
  type: string;
  assertion: "tentative" | "founder-asserted";
  sourceRefs: string[];
};

export type WorkIndexOutline = {
  architectureRevision: number;
  objects: WorkIndexOutlineObject[];
  relationships: WorkIndexOutlineRelationship[];
  unplacedThreadRefs: string[];
};

export type WorkIndex = {
  ventureId: string;
  revision: number;
  items: WorkIndexItem[];
  outline?: WorkIndexOutline;
  counts: { total: number; attention: number; active: number; unread: number; matchCount: number };
  legacy: { unindexedRunCount: number };
};

export const getWorkIndex = (ventureId: string, query = "") =>
  get<{ workIndex: WorkIndex }>(`/api/ventures/${encodeURIComponent(ventureId)}/work-index${query ? `?q=${encodeURIComponent(query)}` : ""}`);

export type SystemIndexObject = {
  id: string; objectRef: string; name: string; statement: string; type: string;
  territory: "product" | "gtm" | null; assertion: "tentative" | "founder-asserted";
  provenance: Record<string, unknown> | null; properties: Record<string, unknown>;
  compatibilityOwned: boolean; architectureRole: string | null; threadRefs: string[];
  attention: Array<{ kind: string; reason: string }>; createdAt: string | null; updatedAt: string | null;
};
export type SystemIndexRelationship = WorkIndexOutlineRelationship & { relationshipRef: string; compatibilityOwned: boolean };
export type SystemAttentionItem = SystemIndexObject["attention"][number] & { objectRef: string };
export type SystemIndex = { ventureId: string; revision: number; architectureRevision: number; scope: "system" | "product" | "gtm" | "attention"; objects: SystemIndexObject[]; relationships: SystemIndexRelationship[]; counts: { total: number; product: number; gtm: number; attention: number; matchCount: number } };
export type SystemMutation =
  | { op: "create-object"; name: string; statement: string; territory: "product" | "gtm" }
  | { op: "update-object"; objectRef: string; name?: string; statement?: string; territory?: "product" | "gtm" }
  | { op: "create-relationship"; fromRef: string; toRef: string; label: string }
  | { op: "update-relationship"; relationshipRef: string; label: string }
  | { op: "remove-relationship"; relationshipRef: string };
export const getSystemIndex = (ventureId: string, scope = "system", query = "") => get<{ systemIndex: SystemIndex }>(`/api/ventures/${encodeURIComponent(ventureId)}/system-index?scope=${encodeURIComponent(scope)}${query ? `&q=${encodeURIComponent(query)}` : ""}`);
export const mutateSystem = (ventureId: string, baseRevision: number, mutations: SystemMutation[]) => guardedPost<{ systemIndex: SystemIndex }>(`/api/ventures/${encodeURIComponent(ventureId)}/system/mutations`, { baseRevision, mutations });

export type ReleaseLifecycle = "draft" | "in-market" | "ended";
export type ReleaseAttention = "decision" | "failed-action" | "reconnect" | "judgment";
export type ReleaseSummary = { id: string; releaseRef: string; name: string; statement: string; lifecycle: ReleaseLifecycle; attention: ReleaseAttention[]; updatedAt: string | null; createdAt: string | null; endedAt: string | null; endedBy: string | null; relatedObjectRefs: string[]; threadRefs: string[]; runRefs: string[]; threads?: Array<Record<string, unknown>>; runs?: Array<Record<string, unknown>>; receipts?: Array<Record<string, unknown>>; decisions: Array<Record<string, unknown>>; outcomes: Array<Record<string, unknown>>; relationships: SystemIndexRelationship[]; externalRefs: Record<string, string[]> };
export type ReleaseDetail = ReleaseSummary & { revision: number };
export type ReleaseIndex = { ventureId: string; revision: number; releases: ReleaseSummary[]; unassignedActions: Array<Record<string, unknown>>; counts: { needsYou: number; drafts: number; inMarket: number; ended: number } };
export type ReleaseMutation = { op: "rename"; name: string } | { op: "update"; name?: string; statement?: string } | { op: "end"; at?: string } | { op: "reopen" } | { op: "link-object"; objectRef: string; label: string } | { op: "unlink-object"; relationshipRef: string } | { op: "link-thread" | "unlink-thread"; threadRef: string };
export const getReleaseIndex = (ventureId: string, query = "") => get<{ releaseIndex: ReleaseIndex }>(`/api/ventures/${encodeURIComponent(ventureId)}/releases${query ? `?q=${encodeURIComponent(query)}` : ""}`);
export const getRelease = (ventureId: string, releaseId: string) => get<{ release: ReleaseDetail }>(`/api/ventures/${encodeURIComponent(ventureId)}/releases/${encodeURIComponent(releaseId)}`);
export const createRelease = (ventureId: string, baseRevision: number, release: { name: string; statement?: string; objectRef?: string; threadRef?: string; linkLabel?: string }) => guardedPost<{ release: ReleaseSummary; releaseIndex: ReleaseIndex }>(`/api/ventures/${encodeURIComponent(ventureId)}/releases`, { baseRevision, release });
export const mutateRelease = (ventureId: string, releaseId: string, baseRevision: number, mutations: ReleaseMutation[]) => guardedPost<{ release: ReleaseDetail; releaseIndex: ReleaseIndex }>(`/api/ventures/${encodeURIComponent(ventureId)}/releases/${encodeURIComponent(releaseId)}/mutations`, { baseRevision, mutations });

export const setThreadPinned = (ventureId: string, threadRef: string, pinned: boolean) => {
  const threadId = threadRef.replace(/^thread:/, "");
  return guardedPut<{ item: WorkIndexItem; workIndex: WorkIndex }>(
    `/api/ventures/${encodeURIComponent(ventureId)}/threads/${encodeURIComponent(threadId)}/pin`,
    { pinned },
  );
};

export type VisualReference = {
  kind: "preview" | "diff" | "flow" | "comparison" | "map" | "evidence" | "consequence";
  ref: string;
  threadRef: string;
  title: string;
  relatedRefs?: string[];
};

export type RichArtifactPayload =
  | {
      kind: "flow";
      steps: Array<{ id: string; label: string; detail?: string }>;
      edges: Array<{ from: string; to: string; label?: string }>;
    }
  | {
      kind: "comparison";
      variant: "before-after" | "alternatives";
      columns: Array<{
        id: string;
        title: string;
        items: Array<{ label: string; detail?: string; artifactRef?: string }>;
      }>;
    };

export type ThreadAgentStatus = {
  participantRef: string;
  participantLabel?: string | null;
  state: "queued" | "working" | "stopping" | "complete" | "failed";
  runRef: string;
  betRef: string | null;
  activity?: string | null;
  startedAt?: string | null;
  updatedAt: string | null;
};

export type ThreadTimelineItem = {
  kind: "message" | "agent-status" | "artifact" | "comparison" | "evidence" | "consequence" | "activity-summary" | "return-summary";
  id: string;
  ref: string;
  at: string | null;
  visual?: VisualReference;
  [key: string]: unknown;
};

export type ThreadTimeline = {
  ventureId: string;
  revision: number;
  thread: WorkIndexItem;
  items: ThreadTimelineItem[];
  agents: ThreadAgentStatus[];
  visuals: VisualReference[];
};

export type CodingWorkspace = {
  id: string;
  kind: "native-code";
  ventureId: string;
  threadRef: string;
  betId: string | null;
  goal: string;
  repository: string;
  sourceHead: string;
  branch: string;
  worktree: string | null;
  runRefs: string[];
  participantRefs: string[];
  providerSessions: Array<{ runRef: string; provider: string; sessionId: string | null; startedAt: string; completedAt: string | null; terminal?: string }>;
  checkpoints: Array<{ id: string; ref: string; commit: string; capturedAt: string; runRef?: string }>;
  commands?: Array<{ command: string; kind: string; status: "passed" | "failed" | "running"; exitCode?: number; startedAt?: string | null; completedAt?: string | null; output?: string }>;
  verification: Array<{ command: string; kind: string; status: "passed" | "failed" | "running"; exitCode?: number; startedAt?: string | null; completedAt?: string | null; output?: string }>;
  changedFiles: Array<{ status: string; path: string }>;
  diff: string;
  diffStat: string;
  patchHash: string;
  status: string;
  currentActivity: string | null;
  interruption?: { message: string; recovery: string; at: string } | null;
  consequence?: { review?: "approved" | "rejected"; note?: string; action?: string; commit?: string; preparation?: { pushCommand: string; pullRequestCommand: string; note: string } } | null;
  restoration?: { checkpointId: string; restoredAt: string; note: string } | null;
  productConsequence?: {
    capability: string;
    system: string[];
    claims: Array<{ status: string; statement: string }>;
    releaseQuestion: string;
    review?: { decision: "provisional" | "adopted" | "rejected"; reviewedAt: string };
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type CodingReadiness = { ready: boolean; approved: boolean; verified: boolean; exact: boolean; source: { head: string; patchHash: string; unchanged: boolean }; reasons: string[] };

const codingAction = (ventureId: string, id: string, action: string, body: Record<string, unknown>) =>
  guardedPost<{ workspace: CodingWorkspace; readiness: CodingReadiness | null }>(
    `/api/ventures/${encodeURIComponent(ventureId)}/coding-workspaces/${encodeURIComponent(id)}/${action}`,
    body,
  );

export const reviewCodingWorkspace = (ventureId: string, id: string, decision: "approve" | "reject", note = "") => codingAction(ventureId, id, "review", { decision, note });
export const reviewCodingProductConsequence = (
  ventureId: string,
  id: string,
  input: { decision: "revise" | "adopt" | "reject"; capability: string; releaseQuestion: string },
) => codingAction(ventureId, id, "product-consequence", input);
export const applyCodingWorkspace = (ventureId: string, id: string) => codingAction(ventureId, id, "apply", { confirm: true });
export const revertCodingWorkspaceApply = (ventureId: string, id: string) => codingAction(ventureId, id, "revert", { confirm: true });
export const commitCodingWorkspace = (ventureId: string, id: string, message: string) => codingAction(ventureId, id, "commit", { confirm: true, message });
export const prepareCodingPullRequest = (ventureId: string, id: string) => codingAction(ventureId, id, "prepare-pull-request", {});
export const restoreCodingCheckpoint = (ventureId: string, id: string, checkpointId: string) => codingAction(ventureId, id, "restore", { confirm: true, checkpointId });
export const discardCodingWorkspace = (ventureId: string, id: string) => codingAction(ventureId, id, "discard", { confirm: true });

export const getThreadTimeline = (ventureId: string, threadRef: string) => {
  const threadId = threadRef.replace(/^thread:/, "");
  return get<{ timeline: ThreadTimeline }>(
    `/api/ventures/${encodeURIComponent(ventureId)}/threads/${encodeURIComponent(threadId)}/timeline`,
  );
};

export const markWorkIndexReviewed = (ventureId: string, item: WorkIndexItem) => {
  const threadId = item.threadRef.replace(/^thread:/, "");
  return guardedPut<{ item: WorkIndexItem; workIndex: WorkIndex }>(
    `/api/ventures/${encodeURIComponent(ventureId)}/work-index/${encodeURIComponent(threadId)}/reviewed-through`,
    { reviewedThrough: item.latestMeaningfulEvent.ref },
  );
};

export const getArchitectureProjection = (ventureId: string) =>
  get<{ projection: FirmArchitectureProjection; revision: number }>(
    `/api/ventures/${encodeURIComponent(ventureId)}/architecture/projection`,
  );

export type ArchitectureMutationOperation = FirmArchitectureOperation;

export const mutateArchitecture = (
  ventureId: string,
  body: { baseRevision: number; operations: ArchitectureMutationOperation[]; reason: string },
) => guardedPost<{
  architecture: FirmArchitectureDocument;
  revision: number;
  receipt: Record<string, unknown>;
  affectedContexts: unknown[];
}>(`/api/ventures/${encodeURIComponent(ventureId)}/architecture/mutations`, body);

export const listArchitectureProposals = (ventureId: string) =>
  get<FirmArchitectureProposalsResponse>(
    `/api/ventures/${encodeURIComponent(ventureId)}/architecture/proposals`,
  );

export const getArchitectureProposal = async (ventureId: string, proposalId: string) => {
  const response = await get<FirmArchitectureProposalsResponse>(
    `/api/ventures/${encodeURIComponent(ventureId)}/architecture/proposals/${encodeURIComponent(proposalId)}`,
  );
  const proposal = response.proposals.find((entry): entry is FirmArchitectureProposal => !(
    "mode" in entry && entry.mode === "working-theory"
  )) ?? null;
  return { proposal, revision: response.revision } satisfies {
    proposal: FirmArchitectureProposal | null;
    revision: number;
  };
};

export const decideArchitectureProposal = (
  ventureId: string,
  proposalId: string,
  decision: FirmArchitectureProposalDecision,
) => guardedPost<FirmArchitectureProposalDecisionResponse>(
  `/api/ventures/${encodeURIComponent(ventureId)}/architecture/proposals/${encodeURIComponent(proposalId)}/decide`,
  decision,
);

export const acceptArchitectureSystemProposal = (
  ventureId: string,
  proposalId: string,
  reason?: string | null,
) => guardedPost<FirmArchitectureSystemAcceptanceResponse>(
  `/api/ventures/${encodeURIComponent(ventureId)}/architecture/proposals/${encodeURIComponent(proposalId)}/accept-system`,
  { reason: reason ?? null },
);

export const startArchitectureCampaign = (
  ventureId: string,
  body: {
    baseRevision: number;
    motionId: string;
    campaign: {
      id?: string;
      name: string;
      audience: string;
      objective: string;
      motionIds?: string[];
      measurement: { observation: string; window: string };
      bounds?: { startsAt: string; endsAt: string | null };
    };
    bet: { intent: string; forkedFrom?: string | null; teammateRef?: string | null };
    supportingBetIds?: string[];
    reason?: string;
  },
) => guardedPost<{
  architecture: FirmArchitectureDocument;
  revision: number;
  receipt: Record<string, unknown>;
  affectedContexts: unknown[];
  campaign: FirmArchitectureDocument["elements"][number];
  bet: Record<string, unknown>;
  staleDrives: unknown[];
}>(`/api/ventures/${encodeURIComponent(ventureId)}/architecture/campaigns/start`, body);

export const getConversation = (ventureId: string) =>
  get<{ messages: FirmConversationMessage[] }>(`/api/ventures/${encodeURIComponent(ventureId)}/conversation`);

// Review-is-dialogue (build contract §4A.2, Phase 4): a founder reply in the thread, interpreted as
// one dialogue act (steer / approve / approve-standing / close / new-direction) and dispatched to the
// existing seams server-side. `betId` scopes the reply to the effort it answers. INTEGRATION POINT:
// added to the shared api.ts; a conversation component calls this instead of a per-purpose button set.
export type ConversationReplyResult = {
  act: "steer" | "stop-run" | "involve-participant" | "parallel-attempts" | "critique" | "approve" | "approve-standing" | "close-thread" | "close" | "new-direction" | "observe";
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

export const replyInConversation = (
  ventureId: string,
  body: { message: string; threadRef?: string | null; betId?: string | null; subjectRefs?: string[]; mode?: "work"; runtime?: string | null; model?: string | null },
) => guardedPost<ConversationReplyResult>(
  `/api/ventures/${encodeURIComponent(ventureId)}/conversation/reply`,
  body,
);

// Live event stream (build contract §2.4 / Phase 5): subscribe to the brain's SSE push so a present
// founder sees work stream without the 900 ms poll. The stream carries data-free notifications
// ({ ventureId, kind, at }); a listener re-reads the relevant surface through the existing routes. The
// caller keeps the 900 ms poll as the reconnect fallback (see useFirmEventStream). Returns an
// unsubscribe function that closes the connection.
export type FirmStreamEvent = {
  ventureId: string;
  kind: "lens" | "conversation" | "drive" | "wall" | "outcome" | "timeline" | "system" | "release";
  at: string;
  betId?: string;
  threadRef?: string;
};

export function subscribeVentureEvents(
  ventureId: string,
  onEvent: (event: FirmStreamEvent) => void,
  onStateChange?: (state: "open" | "closed") => void,
): () => void {
  if (typeof EventSource === "undefined") return () => {};
  const source = new EventSource(`/api/ventures/${encodeURIComponent(ventureId)}/events`);
  const relay = (message: MessageEvent) => {
    try {
      onEvent(JSON.parse(message.data) as FirmStreamEvent);
    } catch {
      /* a malformed frame is ignored; the poll fallback still refreshes the surface */
    }
  };
  for (const kind of ["lens", "conversation", "drive", "wall", "outcome", "timeline"]) {
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
    architectureTarget?: { id: string; stepId?: string | null; revision: number };
    theoryTarget?: { theoryId: string; subjectId: string };
    runtime?: string | null;
    model?: string | null;
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
  completion?: import("@/types").FirmDriveCompletion;
};

// Saved views substrate (Law 12: views are disposable; useful questions persist). A saved LIVE view names
// an arrangement id + the atlasTrace SCOPE it was framed over (a set of object refs) — NEVER positions.
// A SNAPSHOT pins a revision/arrangement/scope manifest. Both route through the founder-write boundary in
// view-routes.mjs. The lens NEVER sends positions in either payload — the brain would reject them anyway;
// re-deriving the arrangement from the founder's current positions is the entire point of a live view.
export type SavedView = {
  id: string;
  kind: "live" | "snapshot";
  name: string;
  arrangement: string | null;
  createdAt: string;
};

// Save a generated answer as a synchronized LIVE view: arrangement id + atlasTrace scope refs. No positions.
export const saveLiveView = (
  ventureId: string,
  body: { name: string; arrangement: string; rootRefs: string[]; relationshipRefs?: string[] },
) => guardedPost<{ view: SavedView }>(
  `/api/ventures/${encodeURIComponent(ventureId)}/views`,
  { kind: "live", ...body },
);

// Capture an immutable SNAPSHOT: a manifest pinning revision + arrangement + scope. Rasterization deferred.
export const captureSnapshotView = (
  ventureId: string,
  body: { name: string; arrangement?: string | null; rootRefs: string[]; imageRef?: string | null },
) => guardedPost<{ view: SavedView }>(
  `/api/ventures/${encodeURIComponent(ventureId)}/views`,
  { kind: "snapshot", ...body },
);

// Promote a FINDING out of a view into durable venture truth (Law 11). Authority is set server-side.
export const promoteViewFinding = (
  ventureId: string,
  body: { viewId?: string | null; statement: string; subjectRefs: string[] },
) => guardedPost<{ finding: { id: string; statement: string } }>(
  `/api/ventures/${encodeURIComponent(ventureId)}/findings`,
  body,
);
