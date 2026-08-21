import {
  assertCrokiContextStringLimit as assertStringLimit,
  CROKI_CONTEXT_LIMITS,
  CrokiContextParseError,
  parseCrokiContextReference,
} from "./crokiContextValidation.ts";
import type {
  CrokiContextParseErrorCode,
  CrokiContextReference,
} from "./crokiContextValidation.ts";
import { parseCrokiReleaseCandidate, type CrokiReleaseCandidate } from "./crokiReleaseCandidate.ts";

export {
  CROKI_CONTEXT_LIMITS,
  CROKI_CONTEXT_PARSE_ERROR_CODES,
  CrokiContextParseError,
  isCrokiContextFileReference,
  isCrokiContextReference,
  isCrokiContextUrlReference,
  normalizeCrokiContextFilePath,
  parseCrokiContextReference,
} from "./crokiContextValidation.ts";
export type {
  CrokiContextFileReference,
  CrokiContextParseErrorCode,
  CrokiContextReference,
  CrokiContextUrlReference,
} from "./crokiContextValidation.ts";
export {
  buildCrokiAgentContext,
  compileCrokiAgentContext,
  CROKI_CONTEXT_TRUNCATION_MARKER,
  isCrokiAgentContextTruncated,
  prependCrokiAgentContext,
} from "./crokiContextRendering.ts";
export type { CrokiAgentContextCompilation } from "./crokiContextRendering.ts";

export const CROKI_CONTEXT_RELATIVE_PATH = ".croki/context.json";
export const CROKI_CONTEXT_VERSION = 1 as const;

export const CROKI_NODE_KINDS = ["intent", "decision", "evidence", "work"] as const;
export type CrokiNodeKind = (typeof CROKI_NODE_KINDS)[number];

export const CROKI_NODE_STATUSES = ["current", "provisional", "retired"] as const;
export type CrokiNodeStatus = (typeof CROKI_NODE_STATUSES)[number];

export const CROKI_NODE_DOMAINS = ["product", "gtm", "workflow", "shared"] as const;
export type CrokiNodeDomain = (typeof CROKI_NODE_DOMAINS)[number];

export const CROKI_NODE_ORIGINS = ["founder", "agent", "repository", "external"] as const;
export type CrokiNodeOrigin = (typeof CROKI_NODE_ORIGINS)[number];

export interface CrokiContextNode {
  readonly id: string;
  readonly kind: CrokiNodeKind;
  readonly status: CrokiNodeStatus;
  readonly domain?: CrokiNodeDomain;
  readonly origin?: CrokiNodeOrigin;
  readonly title: string;
  readonly body: string;
  readonly updatedAt: string;
  readonly references?: readonly CrokiContextReference[];
}

export interface CrokiContextEdge {
  readonly from: string;
  readonly to: string;
  readonly relation: string;
}

export interface CrokiContext {
  readonly version: typeof CROKI_CONTEXT_VERSION;
  readonly product: string;
  readonly updatedAt: string;
  readonly nodes: readonly CrokiContextNode[];
  readonly edges: readonly CrokiContextEdge[];
  /** One project-owned next-release snapshot. Operational status is separate from canon authority. */
  readonly release?: CrokiReleaseCandidate;
}

export const CROKI_CONTEXT_RECEIPT_STATUSES = [
  "loaded",
  "partial",
  "absent",
  "invalid",
  "oversized",
] as const;
export type CrokiContextReceiptStatus = (typeof CROKI_CONTEXT_RECEIPT_STATUSES)[number];
export type CrokiContextSelectionMode = "full" | "focused" | "bounded";

/**
 * Content-free metadata persisted with each attempted provider turn. The
 * timeline may safely render this receipt without exposing Canvas content.
 */
export interface CrokiContextReceipt {
  readonly status: CrokiContextReceiptStatus;
  readonly relativePath: typeof CROKI_CONTEXT_RELATIVE_PATH;
  readonly version: typeof CROKI_CONTEXT_VERSION | null;
  readonly sha256: string | null;
  readonly updatedAt: string | null;
  readonly activeCount: number;
  readonly currentCount: number;
  readonly provisionalCount: number;
  readonly renderedChars: number;
  readonly truncated: boolean;
  /** Present only when an active project-owned release candidate affected the turn. */
  readonly releaseVersion?: string;
  readonly releaseItemCount?: number;
  /** Absent only on receipts persisted before explicit turn behaviors shipped. */
  readonly harnessId?: "native" | "venture-v1" | "product-v1" | "gtm-v1";
  readonly errorCode?: CrokiContextParseErrorCode;
  readonly issueCount?: number;
  readonly includedCount?: number;
  readonly omittedCount?: number;
  readonly selectionMode?: CrokiContextSelectionMode;
}

export interface CrokiContextAppliedActivityPayload {
  readonly sourceEventId: string;
  readonly messageId: string;
  /**
   * The exact rendered snapshot is persisted for idempotent event replay. UI
   * consumers should display `receipt`, not this transport input.
   */
  readonly prompt: string | null;
  readonly receipt: CrokiContextReceipt;
}

export function createEmptyCrokiContext(product = ""): CrokiContext {
  return {
    version: CROKI_CONTEXT_VERSION,
    product,
    updatedAt: "1970-01-01T00:00:00.000Z",
    nodes: [],
    edges: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeKind(value: unknown): value is CrokiNodeKind {
  return typeof value === "string" && CROKI_NODE_KINDS.includes(value as CrokiNodeKind);
}

function isNodeStatus(value: unknown): value is CrokiNodeStatus {
  return typeof value === "string" && CROKI_NODE_STATUSES.includes(value as CrokiNodeStatus);
}

function isNodeDomain(value: unknown): value is CrokiNodeDomain {
  return typeof value === "string" && CROKI_NODE_DOMAINS.includes(value as CrokiNodeDomain);
}

function isNodeOrigin(value: unknown): value is CrokiNodeOrigin {
  return typeof value === "string" && CROKI_NODE_ORIGINS.includes(value as CrokiNodeOrigin);
}

function isIsoDateTime(value: string): boolean {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|([+-])(\d{2}):(\d{2}))$/.exec(
      value,
    );
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    ,
    offsetHour,
    offsetMinute,
  ] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return (
    month >= 1 &&
    month <= 12 &&
    daysInMonth !== undefined &&
    day >= 1 &&
    day <= daysInMonth &&
    Number(hourText) <= 23 &&
    Number(minuteText) <= 59 &&
    Number(secondText) <= 59 &&
    (offsetHour === undefined || (Number(offsetHour) <= 23 && Number(offsetMinute) <= 59))
  );
}

export function parseCrokiContextNode(value: unknown, index: number): CrokiContextNode {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !isNodeKind(value.kind) ||
    !isNodeStatus(value.status) ||
    typeof value.title !== "string" ||
    typeof value.body !== "string" ||
    typeof value.updatedAt !== "string" ||
    (value.domain !== undefined && !isNodeDomain(value.domain)) ||
    (value.origin !== undefined && !isNodeOrigin(value.origin))
  ) {
    throw new CrokiContextParseError("malformed", `Croki context node ${index} is malformed.`);
  }
  const id = value.id.trim();
  const title = value.title.trim();
  if (!id || !title) {
    throw new CrokiContextParseError(
      "malformed",
      `Croki context node ${index} requires an id and title.`,
    );
  }
  assertStringLimit(id, CROKI_CONTEXT_LIMITS.nodeIdChars, `node ${index} id`);
  assertStringLimit(title, CROKI_CONTEXT_LIMITS.nodeTitleChars, `node ${index} title`);
  assertStringLimit(value.body, CROKI_CONTEXT_LIMITS.nodeBodyChars, `node ${index} body`);
  if (!isIsoDateTime(value.updatedAt)) {
    throw new CrokiContextParseError(
      "invalid-timestamp",
      `Croki context node ${index} has an invalid updatedAt timestamp.`,
    );
  }
  if (value.references !== undefined && !Array.isArray(value.references)) {
    throw new CrokiContextParseError(
      "invalid-reference",
      `Croki context node ${index} references must be an array.`,
    );
  }
  if (
    Array.isArray(value.references) &&
    value.references.length > CROKI_CONTEXT_LIMITS.referencesPerNode
  ) {
    throw new CrokiContextParseError(
      "limit-exceeded",
      `Croki context node ${index} exceeds ${CROKI_CONTEXT_LIMITS.referencesPerNode} references.`,
    );
  }
  const references = Array.isArray(value.references)
    ? value.references.map((reference, referenceIndex) =>
        parseCrokiContextReference(reference, `node ${index} reference ${referenceIndex}`),
      )
    : undefined;
  return {
    id,
    kind: value.kind,
    status: value.status,
    ...(value.domain !== undefined ? { domain: value.domain } : {}),
    ...(value.origin !== undefined ? { origin: value.origin } : {}),
    title,
    body: value.body,
    updatedAt: value.updatedAt,
    ...(references !== undefined ? { references } : {}),
  };
}

export function parseCrokiContextEdge(value: unknown, index: number): CrokiContextEdge {
  if (
    !isRecord(value) ||
    typeof value.from !== "string" ||
    typeof value.to !== "string" ||
    typeof value.relation !== "string"
  ) {
    throw new CrokiContextParseError(
      "malformed",
      `Croki context relationship ${index} is malformed.`,
    );
  }
  const from = value.from.trim();
  const to = value.to.trim();
  const relation = value.relation.trim();
  if (!from || !to || !relation) {
    throw new CrokiContextParseError(
      "malformed",
      `Croki context relationship ${index} requires from, to, and relation.`,
    );
  }
  assertStringLimit(from, CROKI_CONTEXT_LIMITS.nodeIdChars, `relationship ${index} from`);
  assertStringLimit(to, CROKI_CONTEXT_LIMITS.nodeIdChars, `relationship ${index} to`);
  assertStringLimit(
    relation,
    CROKI_CONTEXT_LIMITS.edgeRelationChars,
    `relationship ${index} relation`,
  );
  return { from, to, relation };
}

export function parseCrokiContext(input: string): CrokiContext {
  if (new TextEncoder().encode(input).byteLength > CROKI_CONTEXT_LIMITS.sourceBytes) {
    throw new CrokiContextParseError(
      "limit-exceeded",
      `Croki context exceeds ${CROKI_CONTEXT_LIMITS.sourceBytes} source bytes.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    throw new CrokiContextParseError("invalid-json", "Croki context is not valid JSON.");
  }
  if (!isRecord(parsed)) {
    throw new CrokiContextParseError("malformed", "Croki context must be an object.");
  }
  if (parsed.version !== CROKI_CONTEXT_VERSION) {
    throw new CrokiContextParseError(
      "unsupported-version",
      "Croki context uses an unsupported version.",
    );
  }
  if (
    typeof parsed.product !== "string" ||
    typeof parsed.updatedAt !== "string" ||
    !Array.isArray(parsed.nodes) ||
    !Array.isArray(parsed.edges)
  ) {
    throw new CrokiContextParseError("malformed", "Croki context is malformed.");
  }
  assertStringLimit(parsed.product, CROKI_CONTEXT_LIMITS.productChars, "product name");
  if (!isIsoDateTime(parsed.updatedAt)) {
    throw new CrokiContextParseError(
      "invalid-timestamp",
      "Croki context has an invalid updatedAt timestamp.",
    );
  }
  if (parsed.nodes.length > CROKI_CONTEXT_LIMITS.nodes) {
    throw new CrokiContextParseError(
      "limit-exceeded",
      `Croki context exceeds ${CROKI_CONTEXT_LIMITS.nodes} nodes.`,
    );
  }
  if (parsed.edges.length > CROKI_CONTEXT_LIMITS.edges) {
    throw new CrokiContextParseError(
      "limit-exceeded",
      `Croki context exceeds ${CROKI_CONTEXT_LIMITS.edges} relationships.`,
    );
  }

  const nodes = parsed.nodes.map(parseCrokiContextNode);
  const edges = parsed.edges.map(parseCrokiContextEdge);
  const release =
    parsed.release === undefined ? undefined : parseCrokiReleaseCandidate(parsed.release);
  const nodeIds = new Set(nodes.map((node) => node.id));
  if (nodeIds.size !== nodes.length) {
    throw new CrokiContextParseError("duplicate-node-id", "Croki context node ids must be unique.");
  }
  if (
    edges.some((edge) => edge.from === edge.to) ||
    edges.some((edge) => !nodeIds.has(edge.from) || !nodeIds.has(edge.to))
  ) {
    throw new CrokiContextParseError(
      "invalid-edge",
      "Croki context relationships must reference distinct existing nodes.",
    );
  }
  const relationshipKeys = new Set(
    edges.map((edge) => JSON.stringify([edge.from, edge.relation, edge.to])),
  );
  if (relationshipKeys.size !== edges.length) {
    throw new CrokiContextParseError(
      "duplicate-edge",
      "Croki context relationships must be unique.",
    );
  }
  return {
    version: CROKI_CONTEXT_VERSION,
    product: parsed.product.trim(),
    updatedAt: parsed.updatedAt,
    nodes,
    edges,
    ...(release ? { release } : {}),
  };
}

export function serializeCrokiContext(context: CrokiContext): string {
  return `${JSON.stringify(context, null, 2)}\n`;
}
