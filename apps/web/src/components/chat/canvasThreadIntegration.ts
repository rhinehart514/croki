import type { OrchestrationThreadActivity } from "@croki/contracts";
import {
  parseCrokiCanvasArtifact,
  type CrokiCanvasArtifact,
  type CrokiCanvasArtifactEdge,
  type CrokiCanvasArtifactNode,
  type CrokiCanvasNodeRole,
  type CrokiCanvasPresentation,
} from "@croki/shared/crokiCanvasArtifact";

/**
 * The bounded shape projected by a Product/GTM `canvas_present` activity.
 *
 * This is intentionally kept at the chat seam instead of reusing project
 * context nodes. A presentation is a thread artifact, not durable project
 * truth, and old clients may still receive activities without the artifact
 * body.
 */
export type CanvasHarnessId = "product-v1" | "gtm-v1";
export type CanvasPresentation = CrokiCanvasPresentation;
export type CanvasArtifactRole = CrokiCanvasNodeRole;
export type HarnessCanvasArtifactNode = CrokiCanvasArtifactNode;
export type HarnessCanvasArtifactEdge = CrokiCanvasArtifactEdge;
export type HarnessCanvasArtifact = CrokiCanvasArtifact;

export interface CanvasPresentationTimelineActivity {
  readonly activityId: string;
  readonly createdAt: string;
  readonly artifact: HarnessCanvasArtifact | null;
  readonly harnessId: CanvasHarnessId | null;
  readonly question: string | null;
  readonly revision: number | null;
  readonly summary: string;
}

/** Parse only the content-safe artifact projection used by the web client. */
export function parseCanvasPresentationActivity(
  activity: Pick<OrchestrationThreadActivity, "id" | "kind" | "createdAt" | "payload" | "summary">,
): CanvasPresentationTimelineActivity | null {
  if (activity.kind !== "croki.canvas.presented") return null;
  const payload = asRecord(activity.payload);
  const artifact = parseArtifact(payload?.artifact);
  const legacyHarnessId =
    payload?.view === "gtm"
      ? ("gtm-v1" as const)
      : payload?.view === "product"
        ? ("product-v1" as const)
        : null;
  const legacyQuestion = typeof payload?.question === "string" ? payload.question : null;
  const legacyRevision =
    typeof payload?.revision === "number" && Number.isSafeInteger(payload.revision)
      ? payload.revision
      : null;
  return {
    activityId: String(activity.id),
    createdAt: activity.createdAt,
    artifact,
    harnessId: artifact?.harnessId ?? legacyHarnessId,
    question: artifact?.question ?? legacyQuestion,
    revision: artifact?.revision ?? legacyRevision,
    summary:
      typeof activity.summary === "string" && activity.summary.trim().length > 0
        ? activity.summary
        : artifact
          ? `${artifact.nodes.length} Canvas ${artifact.nodes.length === 1 ? "item" : "items"}`
          : "Canvas visual unavailable",
  };
}

export function deriveCanvasPresentationActivities(
  activities: readonly OrchestrationThreadActivity[],
): CanvasPresentationTimelineActivity[] {
  return activities
    .flatMap((activity) => {
      const parsed = parseCanvasPresentationActivity(activity);
      return parsed ? [parsed] : [];
    })
    .toSorted(
      (left, right) =>
        (left.revision ?? Number.MAX_SAFE_INTEGER) - (right.revision ?? Number.MAX_SAFE_INTEGER) ||
        left.createdAt.localeCompare(right.createdAt) ||
        left.activityId.localeCompare(right.activityId),
    );
}

export function canvasHarnessLabel(harnessId: CanvasHarnessId | null): "Product" | "GTM" {
  return harnessId === "gtm-v1" ? "GTM" : "Product";
}

/**
 * Keep Canvas selections visible in the sent message. The selection is not
 * appended to the composer draft, so selecting and then abandoning a turn
 * never mutates or sends anything.
 */
export function appendCanvasSelectionToPrompt(
  prompt: string,
  selectedNodes: readonly HarnessCanvasArtifactNode[],
): string {
  if (selectedNodes.length === 0) return prompt;
  const blocks = selectedNodes.map((node) => {
    const lines = [`- ${node.title}`];
    if (node.body?.trim()) lines.push(`  ${node.body.trim()}`);
    if (node.whyItMatters?.trim()) lines.push(`  Why it matters: ${node.whyItMatters.trim()}`);
    for (const reference of node.references ?? []) {
      lines.push(`  Evidence: ${reference.kind === "file" ? reference.path : reference.url}`);
    }
    return lines.join("\n");
  });
  const selection = `Canvas selection\n${blocks.join("\n")}`;
  const trimmed = prompt.trim();
  return trimmed.length > 0 ? `${trimmed}\n\n${selection}` : selection;
}

function parseArtifact(value: unknown): HarnessCanvasArtifact | null {
  return parseCrokiCanvasArtifact(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
