// Preview annotations: an element picked in the workspace preview serializes into the Work
// composer as an exact context block, so the founder's next turn carries the page, selector, and
// source the agent needs to act on the exact thing that was pointed at.
// Portions Copyright (c) 2026 T3 Tools Inc. Licensed under MIT (github.com/pingdotgg/t3code).

const HTML_PREVIEW_LIMIT = 1_000;

export type PreviewElementSource = { fileName: string; lineNumber?: number | null; columnNumber?: number | null };

export type PickedPreviewElement = {
  pageUrl: string;
  pageTitle: string | null;
  tagName: string;
  selector: string | null;
  htmlPreview: string;
  componentName: string | null;
  source: PreviewElementSource | null;
  pickedAt: string;
};

export type PreviewAnnotationPayload = {
  id: string;
  pageUrl: string;
  pageTitle: string | null;
  comment: string;
  elements: Array<{ id: string; element: PickedPreviewElement; rect: { x: number; y: number; width: number; height: number } }>;
  regions: unknown[];
  strokes: unknown[];
  styleChanges: Array<{ property: string; value: string; previousValue?: string }>;
  createdAt: string;
};

export type PreviewAnnotationScreenshot = { mimeType: string; data: string; size: number };

export type PreviewAnnotationDelivery = {
  workspaceId: string;
  annotation: PreviewAnnotationPayload;
  screenshot: PreviewAnnotationScreenshot | null;
};

function elementContextBlock(elements: PreviewAnnotationPayload["elements"]): string {
  if (!elements.length) return "";
  const lines: string[] = [];
  elements.forEach(({ element }, index) => {
    const label = element.componentName ? `${element.tagName} in ${element.componentName}` : element.tagName;
    lines.push(`- ${label}:`);
    if (element.selector) lines.push(`  Selector: ${element.selector}`);
    if (element.source?.fileName) {
      lines.push(`  Source: ${element.source.fileName}${element.source.lineNumber ? `:${element.source.lineNumber}` : ""}`);
    }
    if (element.htmlPreview) lines.push(`  HTML: ${element.htmlPreview.slice(0, HTML_PREVIEW_LIMIT)}`);
    if (index < elements.length - 1) lines.push("");
  });
  return ["<element_context>", ...lines, "</element_context>"].join("\n");
}

export function buildPreviewAnnotationPrompt(annotation: PreviewAnnotationPayload): string {
  const lines = ["Preview annotation:"];
  lines.push(`Id: ${annotation.id}`);
  const title = annotation.pageTitle?.trim() || annotation.pageUrl.trim() || "Preview";
  lines.push(`Page: ${title}`);
  lines.push(`URL: ${annotation.pageUrl}`);
  if (annotation.comment.trim()) lines.push(`Comment: ${annotation.comment.trim()}`);
  const targets: string[] = [];
  if (annotation.elements.length > 0) targets.push(`${annotation.elements.length} selected element${annotation.elements.length === 1 ? "" : "s"}`);
  if (annotation.regions.length > 0) targets.push(`${annotation.regions.length} marked region${annotation.regions.length === 1 ? "" : "s"}`);
  if (annotation.strokes.length > 0) targets.push(`${annotation.strokes.length} drawing${annotation.strokes.length === 1 ? "" : "s"}`);
  if (targets.length > 0) lines.push(`Targets: ${targets.join(", ")}.`);
  if (annotation.styleChanges.length > 0) {
    lines.push("Requested visual changes:");
    for (const change of annotation.styleChanges) {
      lines.push(`- ${change.property}: ${change.previousValue || "(unset)"} → ${change.value}`);
    }
  }
  const elementBlock = elementContextBlock(annotation.elements);
  if (elementBlock) lines.push(elementBlock);
  return ["<preview_annotation>", ...lines, "</preview_annotation>"].join("\n");
}

export function appendPreviewAnnotationPrompt(prompt: string, annotation: PreviewAnnotationPayload): string {
  const annotationText = buildPreviewAnnotationPrompt(annotation);
  const trimmed = prompt.trim();
  return trimmed ? `${trimmed}\n\n${annotationText}` : annotationText;
}

// --- Delivery seam -------------------------------------------------------------------------------
// The preview pane publishes; the Work Thread composer (the only "work" composer on screen)
// subscribes and lands the block plus screenshot in the founder's draft. A tiny module-level seam
// keeps the preview pane from having to thread callbacks through the whole Work surface.

const subscribers = new Set<(delivery: PreviewAnnotationDelivery) => void>();

export function subscribePreviewAnnotations(listener: (delivery: PreviewAnnotationDelivery) => void): () => void {
  subscribers.add(listener);
  return () => { subscribers.delete(listener); };
}

export function publishPreviewAnnotation(delivery: PreviewAnnotationDelivery): boolean {
  for (const listener of [...subscribers]) listener(delivery);
  return subscribers.size > 0;
}
