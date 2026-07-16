import type { FirmBet, FirmConfiguration, FirmCrewMember, FirmLens, FirmOutcome } from "@/types";

type LensWallItem = NonNullable<FirmLens["wallItems"]>[number];

export type WorkyardCard = {
  key: string;
  workRef: string | null;
  title: string;
  body: string;
  preview: string | null;
  presentation: "prose" | "artifact" | "receipt";
  ownerRefs: string[];
  contributorRefs: string[];
  configurationRevision: number | null;
  updatedAt: string | null;
  wallItems: LensWallItem[];
  outcomes: FirmOutcome[];
  source: "staged" | "evidence" | "wall" | "outcome";
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function firstText(source: Record<string, unknown> | null, keys: string[]): string | null {
  if (!source) return null;
  for (const key of keys) {
    const value = text(source[key]);
    if (value) return value;
  }
  return null;
}

function stringArray(value: unknown): string[] {
  return [...new Set(Array.isArray(value) ? value.map(text).filter((item): item is string => Boolean(item)) : [])];
}

function readableBody(value: unknown): string {
  const direct = text(value);
  if (direct) return direct;
  const source = record(value);
  if (!source) return "A durable record is attached without a readable preview.";
  const nested = source.content;
  const preferred = firstText(source, ["diff", "patch", "body", "excerpt", "claim", "summary", "detail", "description", "question", "path"]);
  if (preferred) return preferred;
  if (nested !== undefined && nested !== value) return readableBody(nested);
  try {
    const serialized = JSON.stringify(value, null, 2);
    return serialized === "{}" ? "A durable record is attached without a readable preview." : serialized;
  } catch {
    return "A durable record is attached without a readable preview.";
  }
}

function cleanInline(value: string): string {
  return value
    .replace(/^\s{0,3}#{1,6}\s+/, "")
    .replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+|>\s*)/, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function concise(value: string, limit = 108): string {
  const cleaned = cleanInline(value);
  if (cleaned.length <= limit) return cleaned;
  const clipped = cleaned.slice(0, limit + 1);
  const boundary = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, boundary > limit * 0.6 ? boundary : limit).trimEnd()}…`;
}

function headingFrom(body: string): string | null {
  for (const line of body.split(/\r?\n/)) {
    if (/^\s{0,3}#{1,6}\s+\S/.test(line)) return concise(line);
  }
  return null;
}

function contentRecord(source: Record<string, unknown> | null): Record<string, unknown> | null {
  return record(source?.content);
}

function semanticTitle(source: Record<string, unknown> | null, body: string, fallback: string): string {
  const explicit = firstText(source, ["title", "summary", "claim", "label", "path", "description"])
    ?? firstText(contentRecord(source), ["title", "subject", "summary", "claim", "label", "path", "description"]);
  if (explicit) return concise(explicit);
  const heading = headingFrom(body);
  if (heading) return heading;
  const firstLine = body.split(/\r?\n/).map(cleanInline).find(Boolean);
  return firstLine ? concise(firstLine) : fallback;
}

function concisePreview(body: string, title: string): string | null {
  if (!body || body === "A durable record is attached without a readable preview.") return null;
  if (presentationFor(body) === "receipt") return null;
  const titleKey = cleanInline(title).toLocaleLowerCase();
  const candidates: string[] = [];
  for (const line of body.split(/\r?\n/)) {
    const raw = line.trim();
    if (!raw || /^\s{0,3}#{1,6}\s+/.test(raw) || /^(```|~~~|---+$|___+$|\*\*\*+$)/.test(raw)) continue;
    if (/^\|.*\|$/.test(raw)) continue;
    const cleaned = cleanInline(raw);
    if (!cleaned || cleaned.toLocaleLowerCase() === titleKey) continue;
    candidates.push(cleaned);
  }
  const substantive = candidates.find((line) => line.length >= 28 || line.split(/\s+/).length >= 5);
  return concise(substantive ?? candidates[0] ?? "", 160) || null;
}

function presentationFor(body: string): WorkyardCard["presentation"] {
  if (/(^--- |^\+\+\+ |^@@|\n\+|\n-)/m.test(body)) return "artifact";
  const trimmed = body.trim();
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) return "receipt";
  return "prose";
}

function participantRefs(source: Record<string, unknown> | null, bet: FirmBet) {
  const owners = stringArray(source?.ownerRefs);
  const contributors = stringArray(source?.contributorRefs).filter((ref) => !owners.includes(ref));
  return {
    ownerRefs: owners.length ? owners : (bet.teammateRef ? [bet.teammateRef] : []),
    contributorRefs: contributors,
  };
}

function workRefOf(value: unknown): string | null {
  return text(record(value)?.id);
}

function outcomeTime(outcome: FirmOutcome): string {
  return outcome.observedAt ?? "";
}

export function projectBetWork(lens: FirmLens, bet: FirmBet): WorkyardCard[] {
  const wallItems = (lens.wallItems ?? []).filter((item) => item.betId === bet.id);
  const outcomes = (lens.outcomes ?? []).filter((outcome) => outcome.betId === bet.id);
  const cards: WorkyardCard[] = [];
  const byWorkRef = new Map<string, WorkyardCard>();

  const attach = (card: WorkyardCard) => {
    cards.push(card);
    if (card.workRef) byWorkRef.set(card.workRef, card);
  };

  bet.staged.forEach((artifact, index) => {
    const source = record(artifact);
    const workRef = workRefOf(artifact);
    const body = readableBody(source?.content ?? artifact);
    const title = semanticTitle(source, body, "Durable work");
    const participants = participantRefs(source, bet);
    attach({
      key: workRef ? `work:${workRef}` : `legacy-staged:${bet.id}:${index}`,
      workRef,
      title,
      body,
      preview: concisePreview(body, title),
      presentation: presentationFor(body),
      ...participants,
      configurationRevision: Number.isInteger(source?.configurationRevision) ? Number(source?.configurationRevision) : (bet.configurationRevision ?? null),
      updatedAt: text(source?.updatedAt) ?? text(source?.stagedAt) ?? bet.updatedAt,
      wallItems: [],
      outcomes: [],
      source: "staged",
    });
  });

  bet.evidence.forEach((evidence, index) => {
    const source = record(evidence);
    if (source?.type === "outcome") return;
    const workRef = workRefOf(evidence);
    if (workRef && byWorkRef.has(workRef)) return;
    const body = readableBody(evidence);
    const title = firstText(source, ["title", "path"]) ?? semanticTitle(source, body, "Attached evidence");
    attach({
      key: workRef ? `evidence:${workRef}` : `legacy-evidence:${bet.id}:${index}`,
      workRef,
      title,
      body,
      preview: concisePreview(body, title),
      presentation: presentationFor(body),
      ...participantRefs(source, bet),
      configurationRevision: Number.isInteger(source?.configurationRevision) ? Number(source?.configurationRevision) : (bet.configurationRevision ?? null),
      updatedAt: text(source?.updatedAt) ?? text(source?.observedAt) ?? bet.updatedAt,
      wallItems: [],
      outcomes: [],
      source: "evidence",
    });
  });

  for (const item of wallItems) {
    const workRef = text(item.workRef) ?? item.id;
    const origin = byWorkRef.get(workRef);
    if (origin) {
      origin.wallItems.push(item);
      continue;
    }
    const body = readableBody(item.effect);
    const title = item.purpose === "answer" ? "A question for you" : item.purpose === "end-bet" ? "A proposed ending" : "Needs your hand";
    attach({
      key: `wall:${item.id}`,
      workRef,
      title,
      body,
      preview: concisePreview(body, title),
      presentation: presentationFor(body),
      ownerRefs: bet.teammateRef ? [bet.teammateRef] : [],
      contributorRefs: [],
      configurationRevision: item.configurationRevision ?? bet.configurationRevision ?? null,
      updatedAt: item.parkedAt,
      wallItems: [item],
      outcomes: [],
      source: "wall",
    });
  }

  for (const outcome of outcomes.sort((left, right) => outcomeTime(left).localeCompare(outcomeTime(right)))) {
    const workRef = text(outcome.workRef);
    const origin = workRef ? byWorkRef.get(workRef) : null;
    if (origin) {
      origin.outcomes.push(outcome);
      continue;
    }
    const ownRef = workRef ?? outcome.id;
    attach({
      key: `outcome:${outcome.id}`,
      workRef: ownRef,
      title: outcome.joined ? "Market returned" : "Unattributed return",
      body: outcome.body?.trim() || "No market words were captured with this return.",
      preview: outcome.body?.trim() || null,
      presentation: "prose",
      ownerRefs: bet.teammateRef ? [bet.teammateRef] : [],
      contributorRefs: [],
      configurationRevision: outcome.configurationRevision ?? bet.configurationRevision ?? null,
      updatedAt: outcome.observedAt,
      wallItems: [],
      outcomes: [outcome],
      source: "outcome",
    });
  }

  return cards.sort((left, right) => String(left.updatedAt).localeCompare(String(right.updatedAt)));
}

export function participantName(
  ref: string,
  crew: FirmCrewMember[],
  configuration?: FirmConfiguration,
): string {
  return configuration?.agents.find((agent) => agent.ref === ref)?.name
    ?? text(crew.find((member) => member.ref === ref)?.soul?.name)
    ?? ref;
}
