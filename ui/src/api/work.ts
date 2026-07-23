import type { FirmLens } from "@/types";
import { get, guardedDelete, guardedPost, guardedPut } from "./transport";
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


export type FirmRuntimeStatus = {
  id: "claude-code" | "codex";
  label: string;
  connected: boolean;
  auth: string | null;
  authLabel: string | null;
  reason: string | null;
};

export const getRuntimeStatuses = () => get<{ runtimes: FirmRuntimeStatus[] }>("/api/runtimes");

export type RuntimeCapabilityInventoryItem = {
  id: string;
  label: string;
  provider: string;
  kind: "source" | "workspace" | "tool" | "action";
  authority: "read" | "inward" | "founder-gate";
  status: "available" | "unavailable" | "reconnect";
  detail: string;
  accountAddress?: string;
  relevance?: {
    atRest?: boolean;
    territories?: Array<"product" | "shared" | "gtm">;
    objectTypes?: string[];
    objectRefs?: string[];
    terms?: string[];
  };
};

export const getCapabilityInventory = () => get<{ capabilities: RuntimeCapabilityInventoryItem[] }>("/api/capabilities");

export type FounderCredential = {
  provider: string;
  label: string | null;
  savedAt: string;
  hasToken: boolean;
  authType: "oauth" | "token";
  accountAddress?: string;
};

export const getCredentials = () => get<{ credentials: FounderCredential[] }>("/api/credentials");
export const saveCredential = (provider: string, token: string, label?: string) =>
  guardedPost<{ credential: FounderCredential; credentials: FounderCredential[] }>(
    "/api/credentials",
    { provider, token, label },
  );
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
  settled: boolean;
  reviewedThrough: string | null;
  latestMeaningfulEvent: { kind: string; ref: string; at: string | null; summary: string | null };
  runRefs: string[];
  pinnedAt: string | null;
  participantRefs: string[];
  activeParticipantRefs: string[];
  matchRefs?: Array<{ kind: "message" | "artifact" | "evidence" | "decision"; ref: string; label: string }>;
  drift?: ShipDrift | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type ShipDrift = {
  threadRef?: string;
  workspaceRef?: string;
  branch: string | null;
  baseRef: string | null;
  hasUpstream: boolean;
  upstreamRef: string | null;
  upstreamAheadCount: number;
  upstreamBehindCount: number;
  aheadOfDefaultCount: number;
  behindDefaultCount: number;
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

export const getRepositoryFiles = (ventureId: string) =>
  get<{ files: string[] }>(`/api/ventures/${encodeURIComponent(ventureId)}/repository-files`);

export type SystemIndexObject = {
  id: string; objectRef: string; name: string; statement: string; type: string;
  territory: "product" | "gtm" | null; assertion: "tentative" | "founder-asserted";
  provenance: Record<string, unknown> | null; properties: Record<string, unknown>;
  compatibilityOwned: boolean; architectureRole: string | null; threadRefs: string[];
  attention: Array<{ kind: string; reason: string }>; createdAt: string | null; updatedAt: string | null;
  projectionOnly?: boolean;
};
export type SystemIndexRelationship = WorkIndexOutlineRelationship & { relationshipRef: string; compatibilityOwned: boolean; projectionOnly?: boolean };
export type SystemAttentionItem = SystemIndexObject["attention"][number] & { objectRef: string };
export type SystemIndex = { ventureId: string; revision: number; architectureRevision: number; scope: "system" | "product" | "gtm" | "attention"; objects: SystemIndexObject[]; relationships: SystemIndexRelationship[]; counts: { total: number; product: number; gtm: number; attention: number; matchCount: number } };
export type SystemMutation =
  | { op: "create-object"; id?: string; name: string; statement: string; territory: "product" | "gtm"; type?: string; properties?: Record<string, unknown> }
  | { op: "update-object"; objectRef: string; name?: string; statement?: string; territory?: "product" | "gtm"; properties?: Record<string, unknown> }
  | { op: "create-relationship"; fromRef: string; toRef: string; label: string }
  | { op: "update-relationship"; relationshipRef: string; label: string }
  | { op: "remove-relationship"; relationshipRef: string };
export const getSystemIndex = (ventureId: string, scope = "system", query = "") => get<{ systemIndex: SystemIndex }>(`/api/ventures/${encodeURIComponent(ventureId)}/system-index?scope=${encodeURIComponent(scope)}${query ? `&q=${encodeURIComponent(query)}` : ""}`);
export const mutateSystem = (ventureId: string, baseRevision: number, mutations: SystemMutation[]) => guardedPost<{ systemIndex: SystemIndex }>(`/api/ventures/${encodeURIComponent(ventureId)}/system/mutations`, { baseRevision, mutations });

export const setThreadPinned = (ventureId: string, threadRef: string, pinned: boolean) => {
  const threadId = threadRef.replace(/^thread:/, "");
  return guardedPut<{ item: WorkIndexItem; workIndex: WorkIndex }>(
    `/api/ventures/${encodeURIComponent(ventureId)}/threads/${encodeURIComponent(threadId)}/pin`,
    { pinned },
  );
};

export const setThreadName = (ventureId: string, threadRef: string, name: string) => {
  const threadId = threadRef.replace(/^thread:/, "");
  return guardedPut<{ item: WorkIndexItem; workIndex: WorkIndex }>(
    `/api/ventures/${encodeURIComponent(ventureId)}/threads/${encodeURIComponent(threadId)}/name`,
    { name },
  );
};

export const deleteThread = (ventureId: string, threadRef: string) => {
  const threadId = threadRef.replace(/^thread:/, "");
  return guardedDelete<{
    deleted: true;
    threadRef: string;
    stoppedRunRefs: string[];
    revokedWorkScopeRefs: string[];
    workIndex: WorkIndex;
  }>(`/api/ventures/${encodeURIComponent(ventureId)}/threads/${encodeURIComponent(threadId)}`);
};

export type VisualReference = {
  kind: "preview" | "diff" | "flow" | "model-view" | "comparison" | "map" | "evidence" | "consequence";
  ref: string;
  threadRef: string;
  title: string;
  relatedRefs?: string[];
};

export type RichArtifactPayload =
  | {
      kind: "model-view";
      purpose: "product-gtm-local-model";
      question: string;
      branchRef: string;
      nodes: Array<{
        id: string;
        label: string;
        detail?: string;
        kind: "question" | "truth" | "proposal" | "alternative" | "unknown" | "evidence" | "action" | "gate" | "outcome";
        state: "current" | "provisional" | "unresolved";
        sourceRef?: string;
      }>;
      edges: Array<{ from: string; to: string; label?: string; kind?: "relationship" | "dependency" | "alternative" | "return" }>;
    }
  | {
      kind: "flow";
      purpose?: "product-gtm-workflow";
      steps: Array<{
        id: string;
        label: string;
        detail?: string;
        type?: "trigger" | "source" | "agent-work" | "tool" | "condition" | "wait" | "founder-decision" | "founder-gate" | "external-action" | "observation" | "outcome";
      }>;
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

// Measured spend for a Thread: adapter-reported dollars and SDK-reported tokens summed from drive
// receipts. Null when nothing was measured — the UI shows nothing rather than a fabricated zero.
export type ThreadUsage = {
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  driveCount: number;
};

export type ThreadTimeline = {
  ventureId: string;
  revision: number;
  thread: WorkIndexItem;
  items: ThreadTimelineItem[];
  usage?: ThreadUsage | null;
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
  status: "preparing" | "running" | "interrupted" | "cancelled" | "reviewable" | "needs-verification" | "failed-verification" | "no-change" | "applied" | "committed" | "discarded";
  currentActivity: string | null;
  interruption?: { message: string; recovery: string; at: string } | null;
  consequence?: { review?: "approved" | "rejected"; note?: string; action?: string; commit?: string; preparation?: { pushCommand: string; pullRequestCommand: string; note: string } } | null;
  restoration?: { checkpointId: string; restoredAt: string; note: string } | null;
  ship?: { drafts?: ShipDrafts; preparedAt?: string; attempt?: ShipAttempt | null } | null;
  shipReceipts?: ShipAttempt[];
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

export type ShipDrafts = {
  branch: string;
  commitSubject: string;
  commitBody: string;
  commitMessage: string;
  prTitle: string;
  prBody: string;
};

export type ShipPhase = {
  phase: "branch" | "commit" | "push" | "pr";
  status: "pending" | "running" | "ready" | "done" | "skipped" | "failed";
  detail: string | null;
  at: string | null;
};

export type ShipAttempt = {
  id: string;
  dryRun: boolean;
  startedAt: string;
  completedAt: string | null;
  outcome: "running" | "completed" | "dry-run" | "failed";
  error: string | null;
  failedPhase: string | null;
  branch: string;
  baseBranch: string | null;
  commitSha: string | null;
  pushed: boolean;
  prUrl: string | null;
  prNote: string | null;
  content: { commitMessage: string; prTitle: string; prBody: string };
  phases: ShipPhase[];
};

export type ShipInfo = {
  drafts: ShipDrafts;
  drift: ShipDrift | null;
  baseBranch: string | null;
  gh: { available: boolean; authenticated: boolean; reason: string | null };
  attempt: ShipAttempt | null;
  receipts: ShipAttempt[];
};

const codingAction = (ventureId: string, id: string, action: string, body: Record<string, unknown>) =>
  guardedPost<{ workspace: CodingWorkspace; readiness: CodingReadiness | null; ship?: ShipInfo | null }>(
    `/api/ventures/${encodeURIComponent(ventureId)}/coding-workspaces/${encodeURIComponent(id)}/${action}`,
    body,
  );

export const getCodingWorkspaceShip = (ventureId: string, id: string) =>
  get<{ workspace: CodingWorkspace; readiness: CodingReadiness | null; ship: ShipInfo | null }>(
    `/api/ventures/${encodeURIComponent(ventureId)}/coding-workspaces/${encodeURIComponent(id)}`,
  );

export type ShipRequest = { dryRun?: boolean; branch?: string; commitMessage?: string; prTitle?: string; prBody?: string };

export const shipCodingWorkspace = (ventureId: string, id: string, body: ShipRequest = {}) =>
  codingAction(ventureId, id, "ship", body.dryRun ? { ...body } : { ...body, confirm: true });

// Stage founder edits through the brain's sanitizers so the confirmation shows the exact branch and
// content that will ship, not the raw text before shaping.
export const prepareCodingWorkspaceShip = (ventureId: string, id: string, body: Omit<ShipRequest, "dryRun"> = {}) =>
  codingAction(ventureId, id, "prepare-ship", { ...body });

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
