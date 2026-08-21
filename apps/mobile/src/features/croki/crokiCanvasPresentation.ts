import type { ProjectReadFileResult } from "@croki/contracts";
import {
  CROKI_CONTEXT_LIMITS,
  CrokiContextParseError,
  parseCrokiContext,
  type CrokiContext,
  type CrokiContextEdge,
  type CrokiContextNode,
} from "@croki/shared/crokiContext";
import { recoverCrokiContext } from "@croki/shared/crokiContextRecovery";

export type CrokiCanvasLoadState =
  | { readonly status: "loading" }
  | { readonly status: "missing" }
  | { readonly status: "malformed"; readonly code: string }
  | { readonly status: "oversized" }
  | { readonly status: "read-error"; readonly detail: string }
  | { readonly status: "partial"; readonly context: CrokiContext; readonly issueCount: number }
  | { readonly status: "ready"; readonly context: CrokiContext };

export interface CrokiCanvasPresentation {
  readonly current: readonly CrokiContextNode[];
  readonly provisional: readonly CrokiContextNode[];
  readonly retired: readonly CrokiContextNode[];
  readonly relationships: ReadonlyArray<{
    readonly edge: CrokiContextEdge;
    readonly fromTitle: string;
    readonly toTitle: string;
  }>;
}

export type CrokiEvidenceLink =
  | { readonly kind: "file"; readonly path: string; readonly line: number | null }
  | { readonly kind: "url"; readonly url: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingReadFailure(failure: unknown): boolean {
  return (
    isRecord(failure) &&
    failure._tag === "ProjectReadFileError" &&
    failure.failure === "operation_failed" &&
    failure.operation === "realpath-target"
  );
}

export function selectCrokiCanvasLoadState(input: {
  readonly data: ProjectReadFileResult | null;
  readonly error: string | null;
  readonly failure: unknown;
  readonly isPending: boolean;
}): CrokiCanvasLoadState {
  if (input.data === null) {
    if (isMissingReadFailure(input.failure)) return { status: "missing" };
    if (input.error !== null) return { status: "read-error", detail: input.error };
    return { status: "loading" };
  }
  if (
    input.data.truncated ||
    input.data.byteLength > CROKI_CONTEXT_LIMITS.sourceBytes ||
    new TextEncoder().encode(input.data.contents).byteLength > CROKI_CONTEXT_LIMITS.sourceBytes
  ) {
    return { status: "oversized" };
  }

  try {
    return { status: "ready", context: parseCrokiContext(input.data.contents) };
  } catch (cause) {
    try {
      const recovery = recoverCrokiContext(input.data.contents);
      if (recovery.issues.length > 0) {
        return {
          status: "partial",
          context: recovery.context,
          issueCount: recovery.issues.length,
        };
      }
    } catch {
      // Preserve the strict source-level diagnosis below.
    }
    if (cause instanceof CrokiContextParseError) {
      return cause.code === "limit-exceeded"
        ? { status: "oversized" }
        : { status: "malformed", code: cause.code };
    }
    return { status: "malformed", code: "malformed" };
  }
}

export function buildCrokiCanvasPresentation(context: CrokiContext): CrokiCanvasPresentation {
  const nodeTitles = new Map(context.nodes.map((node) => [node.id, node.title]));
  return {
    current: context.nodes.filter((node) => node.status === "current"),
    provisional: context.nodes.filter((node) => node.status === "provisional"),
    retired: context.nodes.filter((node) => node.status === "retired"),
    relationships: context.edges.map((edge) => ({
      edge,
      fromTitle: nodeTitles.get(edge.from) ?? edge.from,
      toTitle: nodeTitles.get(edge.to) ?? edge.to,
    })),
  };
}

export function selectCrokiEvidenceLinks(node: CrokiContextNode): readonly CrokiEvidenceLink[] {
  const links: readonly CrokiEvidenceLink[] = (node.references ?? []).map((reference) =>
    reference.kind === "file"
      ? {
          kind: "file",
          path: reference.path,
          line: reference.line ?? null,
        }
      : {
          kind: "url",
          url: reference.url,
        },
  );
  const seen = new Set<string>();
  return links.filter((link) => {
    const key = link.kind === "file" ? `file:${link.path}:${link.line ?? ""}` : `url:${link.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
