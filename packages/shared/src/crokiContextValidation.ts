/**
 * Shared limits used by the Canvas editor, parser, and provider boundary.
 * Source bytes and rendered prompt characters are intentionally separate.
 */
export const CROKI_CONTEXT_LIMITS = {
  sourceBytes: 256_000,
  renderChars: 12_000,
  nodes: 200,
  edges: 400,
  productChars: 240,
  nodeIdChars: 120,
  nodeTitleChars: 240,
  nodeBodyChars: 12_000,
  referencesPerNode: 20,
  referencePathChars: 500,
  referenceUrlChars: 2_048,
  edgeRelationChars: 120,
} as const;

export interface CrokiContextFileReference {
  readonly kind: "file";
  readonly path: string;
  readonly line?: number;
}

export interface CrokiContextUrlReference {
  readonly kind: "url";
  readonly url: string;
}

export type CrokiContextReference = CrokiContextFileReference | CrokiContextUrlReference;

export const CROKI_CONTEXT_PARSE_ERROR_CODES = [
  "invalid-json",
  "malformed",
  "unsupported-version",
  "limit-exceeded",
  "invalid-timestamp",
  "duplicate-node-id",
  "invalid-edge",
  "duplicate-edge",
  "invalid-reference",
  "invalid-reference-path",
  "invalid-reference-url",
  "invalid-reference-line",
] as const;
export type CrokiContextParseErrorCode = (typeof CROKI_CONTEXT_PARSE_ERROR_CODES)[number];

export class CrokiContextParseError extends Error {
  override readonly name = "CrokiContextParseError";
  readonly code: CrokiContextParseErrorCode;

  constructor(code: CrokiContextParseErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export function assertCrokiContextStringLimit(value: string, limit: number, label: string): void {
  if (value.length > limit) {
    throw new CrokiContextParseError(
      "limit-exceeded",
      `Croki context ${label} exceeds ${limit} characters.`,
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasCrokiReferenceControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return (
      codePoint !== undefined &&
      (codePoint <= 0x1f ||
        codePoint === 0x7f ||
        (codePoint >= 0x2028 && codePoint <= 0x202e) ||
        (codePoint >= 0x2066 && codePoint <= 0x2069))
    );
  });
}

export function normalizeCrokiContextFilePath(input: string): string {
  assertCrokiContextStringLimit(
    input,
    CROKI_CONTEXT_LIMITS.referencePathChars,
    "file reference path",
  );
  const path = input.trim();
  if (
    !path ||
    path.startsWith("/") ||
    /^[a-z]:\//i.test(path) ||
    path.includes("\\") ||
    hasCrokiReferenceControlCharacters(path)
  ) {
    throw new CrokiContextParseError(
      "invalid-reference-path",
      "Croki file references must use a portable repository-relative POSIX path.",
    );
  }

  const segments = path.split("/");
  if (segments.includes("..")) {
    throw new CrokiContextParseError(
      "invalid-reference-path",
      "Croki file references cannot traverse outside the repository.",
    );
  }
  const normalized = segments.filter((segment) => segment !== "" && segment !== ".").join("/");
  if (!normalized) {
    throw new CrokiContextParseError(
      "invalid-reference-path",
      "Croki file references require a repository-relative path.",
    );
  }
  assertCrokiContextStringLimit(
    normalized,
    CROKI_CONTEXT_LIMITS.referencePathChars,
    "file reference path",
  );
  return normalized;
}

function validateCrokiContextUrl(input: string): string {
  assertCrokiContextStringLimit(input, CROKI_CONTEXT_LIMITS.referenceUrlChars, "URL reference");
  const url = input.trim();
  if (!url || hasCrokiReferenceControlCharacters(url)) {
    throw new CrokiContextParseError(
      "invalid-reference-url",
      "Croki URL references must be valid HTTP(S) URLs.",
    );
  }
  try {
    const parsed = new URL(url);
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || !parsed.hostname) {
      throw new Error("unsupported URL");
    }
  } catch {
    throw new CrokiContextParseError(
      "invalid-reference-url",
      "Croki URL references must be valid HTTP(S) URLs.",
    );
  }
  return url;
}

export function parseCrokiContextReference(
  value: unknown,
  label = "reference",
): CrokiContextReference {
  if (!isRecord(value) || (value.kind !== "file" && value.kind !== "url")) {
    throw new CrokiContextParseError("invalid-reference", `Croki context ${label} is malformed.`);
  }
  if (value.kind === "file") {
    if (
      typeof value.path !== "string" ||
      (value.line !== undefined &&
        (typeof value.line !== "number" || !Number.isSafeInteger(value.line) || value.line <= 0))
    ) {
      throw new CrokiContextParseError(
        value.line !== undefined ? "invalid-reference-line" : "invalid-reference",
        `Croki context ${label} has an invalid file path or line.`,
      );
    }
    return {
      kind: "file",
      path: normalizeCrokiContextFilePath(value.path),
      ...(value.line !== undefined ? { line: value.line } : {}),
    };
  }
  if (typeof value.url !== "string") {
    throw new CrokiContextParseError(
      "invalid-reference",
      `Croki context ${label} has an invalid URL.`,
    );
  }
  return {
    kind: "url",
    url: validateCrokiContextUrl(value.url),
  };
}

export function isCrokiContextFileReference(value: unknown): value is CrokiContextFileReference {
  try {
    return parseCrokiContextReference(value).kind === "file";
  } catch {
    return false;
  }
}

export function isCrokiContextUrlReference(value: unknown): value is CrokiContextUrlReference {
  try {
    return parseCrokiContextReference(value).kind === "url";
  } catch {
    return false;
  }
}

export function isCrokiContextReference(value: unknown): value is CrokiContextReference {
  return isCrokiContextFileReference(value) || isCrokiContextUrlReference(value);
}
