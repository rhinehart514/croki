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
  act: "steer" | "approve" | "approve-standing" | "close" | "new-direction";
  betId?: string | null;
  messageId?: string;
  applied?: string;
  ended?: boolean;
  teammateRef?: string;
  why?: string;
  waitingItemId?: string | null;
  grant?: { actType: string; grantedAt: string } | null;
  note?: string;
  outcome?: { kind?: string; summary?: string };
  messages?: FirmConversationMessage[];
};

export const replyInConversation = (
  ventureId: string,
  body: { message: string; betId?: string | null },
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
  kind: "lens" | "conversation" | "drive" | "wall" | "outcome";
  at: string;
  betId?: string;
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
  for (const kind of ["lens", "conversation", "drive", "wall", "outcome"]) {
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
