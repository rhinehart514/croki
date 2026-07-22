import type { FounderCredential, SystemIndexObject } from "@/api";
import type { FirmConfiguredAgent } from "@/types";

export type WorkflowCapabilityAuthority = "read" | "inward" | "founder-gate";
export type WorkflowCapabilityKind = "source" | "workspace" | "tool" | "action" | "agent-skill" | "markdown";
export type WorkflowCapabilityStatus = "available" | "unavailable" | "reconnect";

export type WorkflowCapabilityRelevance = {
  atRest?: boolean;
  territories?: Array<"product" | "gtm" | "shared">;
  objectTypes?: string[];
  objectRefs?: string[];
  terms?: string[];
};

export type RuntimeCapabilityInventoryItem = {
  id: string;
  label: string;
  provider: string;
  kind: WorkflowCapabilityKind;
  authority: WorkflowCapabilityAuthority;
  status: WorkflowCapabilityStatus;
  detail: string;
  accountAddress?: string | null;
  relevance?: WorkflowCapabilityRelevance;
};

export type WorkflowCapability = RuntimeCapabilityInventoryItem;

const REPOSITORY: WorkflowCapability = {
  id: "repository",
  label: "Repository",
  provider: "native",
  kind: "workspace",
  authority: "inward",
  status: "available",
  detail: "Read and change isolated product work",
  relevance: {
    atRest: true,
    territories: ["product"],
    terms: ["build", "code", "implementation", "product", "repository", "ship"],
  },
};

const PROVIDER_RELEVANCE: Record<string, WorkflowCapabilityRelevance> = {
  browser: { terms: ["browser", "competitor", "evidence", "page", "research", "site", "web"] },
  exa: { territories: ["gtm", "shared"], terms: ["competitor", "evidence", "market", "research", "search", "source", "web"] },
  gmail: { territories: ["gtm"], terms: ["email", "gmail", "message", "outreach", "reply", "send"] },
};

function title(value: string) {
  return value.split(/[-_.\s]+/).filter(Boolean).map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
}

function normalizeList(values: string[] | undefined) {
  return values?.map((value) => value.trim().toLowerCase()).filter(Boolean);
}

function normalizeRelevance(capability: RuntimeCapabilityInventoryItem): WorkflowCapabilityRelevance | undefined {
  const fallback = PROVIDER_RELEVANCE[capability.provider.toLowerCase()]
    ?? (capability.id === "browser" ? PROVIDER_RELEVANCE.browser : undefined)
    ?? (capability.id === "repository" ? REPOSITORY.relevance : undefined);
  const supplied = capability.relevance;
  if (!fallback && !supplied) return undefined;
  return {
    atRest: supplied?.atRest ?? fallback?.atRest,
    territories: supplied?.territories ?? fallback?.territories,
    objectTypes: normalizeList(supplied?.objectTypes ?? fallback?.objectTypes),
    objectRefs: supplied?.objectRefs ?? fallback?.objectRefs,
    terms: normalizeList([...(fallback?.terms ?? []), ...(supplied?.terms ?? [])]),
  };
}

function normalizeInventoryItem(item: RuntimeCapabilityInventoryItem, credentials: FounderCredential[]): WorkflowCapability | null {
  const id = item.id.trim().toLowerCase();
  if (!id || !item.label.trim() || !item.provider.trim()) return null;
  const credential = credentials.find((entry) => entry.provider.toLowerCase() === item.provider.toLowerCase());
  const detail = item.accountAddress?.trim()
    || (item.kind === "source" ? credential?.accountAddress?.trim() : null)
    || item.detail.trim();
  return {
    ...item,
    id,
    label: item.label.trim(),
    provider: item.provider.trim().toLowerCase(),
    detail: detail || "No capability detail reported by the host",
    relevance: normalizeRelevance(item),
  };
}

function gmailCapabilities(credential: FounderCredential): WorkflowCapability[] {
  const status: WorkflowCapabilityStatus = credential.hasToken ? "available" : "reconnect";
  const account = credential.accountAddress?.trim();
  return [
    {
      id: "gmail.read",
      label: "Gmail Read",
      provider: "gmail",
      kind: "source",
      authority: "read",
      status,
      detail: account || (status === "reconnect" ? "Reconnect Gmail to observe replies" : "Observe replies and attributable evidence"),
      relevance: PROVIDER_RELEVANCE.gmail,
    },
    {
      id: "gmail.send",
      label: "Gmail Send",
      provider: "gmail",
      kind: "action",
      authority: "founder-gate",
      status,
      detail: status === "reconnect" ? "Reconnect Gmail before preparing email" : "Prepare email; founder approves every send",
      relevance: PROVIDER_RELEVANCE.gmail,
    },
  ];
}

function configuredAgentCapabilities(agents: FirmConfiguredAgent[]): WorkflowCapability[] {
  const names = new Map<string, string>();
  for (const capability of agents.flatMap((agent) => agent.capabilities.additional)) {
    const id = capability.trim().toLowerCase();
    if (id && !names.has(id)) names.set(id, capability);
  }
  return [...names].map(([id, label]) => ({
    id,
    label: title(label),
    provider: "agent",
    kind: "agent-skill" as const,
    authority: "inward" as const,
    status: "unavailable" as const,
    detail: "Configured for an agent, but the host did not report it callable",
    relevance: { terms: normalizeList([id, label]) },
  }));
}

/**
 * Projects the capabilities the host can actually call. When an inventory is supplied it is
 * authoritative; credentials only enrich its account detail. The fallback keeps today's native
 * repository and Gmail connector honest while older hosts adopt the inventory endpoint.
 */
export function workflowCapabilities(
  credentials: FounderCredential[],
  agents: FirmConfiguredAgent[] = [],
  inventory?: RuntimeCapabilityInventoryItem[],
) {
  const supplied = inventory !== undefined;
  const candidates = supplied
    ? inventory.map((item) => normalizeInventoryItem(item, credentials)).filter((item): item is WorkflowCapability => Boolean(item))
    : [
        REPOSITORY,
        ...credentials.filter((credential) => credential.provider.toLowerCase() === "gmail").flatMap(gmailCapabilities),
        ...configuredAgentCapabilities(agents),
      ];
  const byId = new Map<string, WorkflowCapability>();
  for (const capability of candidates) byId.set(capability.id, capability);
  return [...byId.values()].sort((left, right) => left.label.localeCompare(right.label));
}

const STATUS_RANK: Record<WorkflowCapabilityStatus, number> = { available: 2, reconnect: 1, unavailable: 0 };

function focusPropertyText(properties: Record<string, unknown>) {
  return Object.values(properties).flatMap((value) => {
    if (typeof value === "string" || typeof value === "number") return [String(value)];
    if (Array.isArray(value)) return value.filter((entry): entry is string | number => typeof entry === "string" || typeof entry === "number").map(String);
    return [];
  }).join(" ");
}

function relevanceScore(capability: WorkflowCapability, focus: SystemIndexObject | null) {
  const relevance = normalizeRelevance(capability);
  if (!focus) return relevance?.atRest ? 10 : 0;
  const focusText = `${focus.name} ${focus.statement} ${focus.type} ${focusPropertyText(focus.properties)}`.toLowerCase();
  const words = new Set(focusText.split(/[^a-z0-9.]+/).filter(Boolean));
  const explicitIds = new Set(
    [focus.objectRef, ...focusPropertyText(focus.properties).split(/\s+/)]
      .map((value) => value.toLowerCase().replace(/["',]/g, "")),
  );
  let score = relevance?.atRest ? 4 : 0;
  let contextualMatch = false;
  if (relevance?.objectRefs?.some((ref) => ref === focus.objectRef)) { score += 100; contextualMatch = true; }
  if (explicitIds.has(capability.id) || focusText.includes(capability.id)) { score += 80; contextualMatch = true; }
  if (relevance?.objectTypes?.includes(focus.type.toLowerCase())) { score += 35; contextualMatch = true; }
  const matchedTerms = relevance?.terms?.filter((term) => words.has(term) || focusText.includes(term)) ?? [];
  score += Math.min(45, matchedTerms.length * 15);
  contextualMatch ||= matchedTerms.length > 0;
  if (contextualMatch && focus.territory && relevance?.territories?.includes(focus.territory)) score += 20;
  return score;
}

/** Keeps the rail quiet at rest, then surfaces the few capabilities relevant to the selected branch object. */
export function relevantWorkflowCapabilities(
  capabilities: WorkflowCapability[],
  focus: SystemIndexObject | null,
  limits: { resting?: number; focused?: number } = {},
) {
  const limit = focus ? (limits.focused ?? 5) : (limits.resting ?? 3);
  return capabilities
    .map((capability) => ({ capability, score: relevanceScore(capability, focus) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score
      || STATUS_RANK[right.capability.status] - STATUS_RANK[left.capability.status]
      || left.capability.label.localeCompare(right.capability.label))
    .slice(0, limit)
    .map(({ capability }) => capability);
}
