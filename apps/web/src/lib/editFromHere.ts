import type { ChatImageAttachment } from "../types";
import type { ComposerImageAttachment } from "../composerDraftStore";
import type { ReviewCommentContext } from "../reviewCommentContext";
import { extractTrailingElementContexts } from "./elementContext";
import { extractTrailingPreviewAnnotation } from "./previewAnnotation";
import { extractTrailingTerminalContexts } from "./terminalContext";
import { parseReviewCommentMessageSegments } from "../reviewCommentContext";

export interface EditFromHereDraft {
  readonly prompt: string;
  readonly reviewComments: ReadonlyArray<ReviewCommentContext>;
}

/** Recover user-editable source while leaving runtime-only context receipts behind. */
export function editFromHereDraftFromMessageText(text: string): EditFromHereDraft {
  const reviewSegments = parseReviewCommentMessageSegments(text);
  const reviewComments = reviewSegments.flatMap((segment) =>
    segment.kind === "review-comment" ? [segment.comment] : [],
  );
  let prompt = reviewSegments
    .flatMap((segment) => (segment.kind === "text" ? [segment.text] : []))
    .join("");

  // Context blocks are appended in layers. Peeling repeatedly recovers the
  // authored prompt even when a later annotation hid an earlier block.
  while (true) {
    const before = prompt;
    prompt = extractTrailingPreviewAnnotation(prompt).promptText;
    prompt = extractTrailingElementContexts(prompt).promptText;
    prompt = extractTrailingTerminalContexts(prompt).promptText;
    if (prompt === before) break;
  }

  return { prompt: prompt.trim(), reviewComments };
}

export async function restoreEditFromHereImages(
  attachments: ReadonlyArray<ChatImageAttachment>,
): Promise<{ readonly images: ComposerImageAttachment[]; readonly failedCount: number }> {
  const images: ComposerImageAttachment[] = [];
  let failedCount = 0;

  for (const attachment of attachments) {
    if (!attachment.previewUrl) {
      failedCount += 1;
      continue;
    }
    try {
      const response = await fetch(attachment.previewUrl);
      if (!response.ok) throw new Error(`Attachment request failed with ${response.status}.`);
      const blob = await response.blob();
      const mimeType = blob.type || attachment.mimeType;
      const file = new File([blob], attachment.name, { type: mimeType });
      images.push({
        type: "image",
        id: attachment.id,
        name: attachment.name,
        mimeType,
        sizeBytes: file.size,
        previewUrl: URL.createObjectURL(file),
        file,
      });
    } catch {
      failedCount += 1;
    }
  }

  return { images, failedCount };
}
