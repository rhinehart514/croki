import type { ReleaseDetail, SystemIndexObject, WallQueueItemView, WorkIndexItem } from "@/api";

export type ReleasePathKey = "product" | "customer" | "distribution" | "action" | "evidence";

export type ReleasePathEntry = {
  id: string;
  objectRef?: string;
  eyebrow?: string;
  label: string;
  detail?: string;
  relationshipRef?: string;
  raw?: Record<string, unknown>;
};

export type ReleasePathStep = {
  key: ReleasePathKey;
  title: string;
  prompt: string;
  entries: ReleasePathEntry[];
};

const ROLE_MATCHERS: Array<{ key: Exclude<ReleasePathKey, "action" | "evidence">; pattern: RegExp }> = [
  { key: "product", pattern: /\b(product|capability|feature|workflow|intelligence|surface|ships? in|implements?|delivers?)\b/i },
  { key: "customer", pattern: /\b(customer|user|buyer|recipient).*(consequence|change|value|benefit|experience)|\b(consequence|value)\b/i },
  { key: "distribution", pattern: /\b(distribution|audience|claim|offer|channel|market|launch|reach|travel|campaign|invitation|opportunit(?:y|ies)|gtm)\b/i },
];

export const RELEASE_PATH_META: Record<ReleasePathKey, Pick<ReleasePathStep, "title" | "prompt">> = {
  product: { title: "Product delta", prompt: "Link the capability, workflow, or product change this release makes real." },
  customer: { title: "Customer consequence", prompt: "Link what becomes meaningfully different for the customer." },
  distribution: { title: "Distribution", prompt: "Link the audience, offer, or route that carries this value outward." },
  action: { title: "Outward action", prompt: "Join exact work that prepares a founder-held action." },
  evidence: { title: "Evidence", prompt: "No market return is joined yet. Silence remains an open loop." },
};

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function recordLabel(value: Record<string, unknown>) {
  const terminal = value.terminal && typeof value.terminal === "object"
    ? text((value.terminal as Record<string, unknown>).kind)
    : null;
  return text(value.name) ?? text(value.summary) ?? text(value.note) ?? text(value.body)
    ?? text(value.action) ?? text(value.decision) ?? text(value.outcomeKind) ?? terminal ?? "Recorded";
}

export function recordDetail(value: Record<string, unknown>) {
  return text(value.from) ?? text(value.source) ?? text(value.attribution) ?? text(value.lastExecutionError)
    ?? text(value.purpose) ?? undefined;
}

export function recordTime(value: Record<string, unknown>) {
  return text(value.completedAt) ?? text(value.releasedAt) ?? text(value.observedAt) ?? text(value.decidedAt)
    ?? text(value.createdAt) ?? text(value.parkedAt) ?? "";
}

const PURPOSES = new Set(["release", "answer", "review-outcome", "end-bet"]);
export function pendingGate(value: Record<string, unknown>): WallQueueItemView | null {
  if (typeof value.id !== "string" || typeof value.ventureId !== "string" || typeof value.purpose !== "string"
    || !PURPOSES.has(value.purpose) || value.decision != null || typeof value.effect !== "object" || value.effect == null) return null;
  return value as WallQueueItemView;
}

function stageFor(label: string, object: SystemIndexObject | undefined) {
  const explicit = ROLE_MATCHERS.find((matcher) => matcher.pattern.test(label))?.key;
  if (explicit) return explicit;
  if (/\b(experience|need|customer|persona)\b/i.test(object?.type ?? "")) return "customer";
  if (object?.territory === "product") return "product";
  if (object?.territory === "gtm") return "distribution";
  return null;
}

export function deriveReleasePath(release: ReleaseDetail, objects: SystemIndexObject[], threads: WorkIndexItem[]): ReleasePathStep[] {
  const objectNames = new Map(objects.map((object) => [object.objectRef, object.name]));
  const threadNames = new Map(threads.map((thread) => [thread.threadRef, thread.founderIntent]));
  const grouped = new Map<ReleasePathKey, ReleasePathEntry[]>([
    ["product", []], ["customer", []], ["distribution", []], ["action", []], ["evidence", []],
  ]);

  for (const relationship of release.relationships) {
    const otherRef = relationship.fromRef === release.releaseRef ? relationship.toRef : relationship.fromRef;
    const object = objects.find((candidate) => candidate.objectRef === otherRef);
    const key = stageFor(relationship.label, object);
    if (!key) continue;
    grouped.get(key)?.push({
      id: relationship.id,
      objectRef: otherRef,
      eyebrow: relationship.label,
      label: objectNames.get(otherRef) ?? otherRef,
      relationshipRef: relationship.relationshipRef || `relationship:${relationship.id}`,
    });
  }

  for (const threadRef of release.threadRefs) {
    grouped.get("product")?.push({ id: threadRef, eyebrow: "Exact work", label: threadNames.get(threadRef) ?? threadRef });
  }
  for (const decision of release.decisions) {
    grouped.get("action")?.push({ id: String(decision.id ?? `decision-${grouped.get("action")?.length ?? 0}`), label: recordLabel(decision), detail: recordDetail(decision), raw: decision });
  }
  for (const outcome of release.outcomes) {
    grouped.get("evidence")?.push({ id: String(outcome.id ?? `evidence-${grouped.get("evidence")?.length ?? 0}`), label: recordLabel(outcome), detail: recordDetail(outcome), raw: outcome });
  }

  return (["product", "customer", "distribution", "action", "evidence"] as const).map((key) => ({
    key,
    ...RELEASE_PATH_META[key],
    entries: grouped.get(key) ?? [],
  }));
}
