// A picked preview element lands in the Work composer draft as an exact context block plus the
// screenshot crop, so the founder can add their own words and send one grounded turn.
import { useEffect } from "react";
import { appendPreviewAnnotationPrompt, subscribePreviewAnnotations } from "@/lib/previewAnnotation";
import type { PendingComposerImage } from "./composerImageFiles";

export function usePreviewAnnotationIntake({ enabled, setDraft, setImages, focus }: {
  enabled: boolean;
  setDraft: (value: (current: string) => string) => void;
  setImages: (value: (current: PendingComposerImage[]) => PendingComposerImage[]) => void;
  focus: () => void;
}) {
  // Re-subscribes every render on purpose: setDraft/setImages close over the composer's current
  // scope, so a Thread switch immediately retargets where the next annotation lands.
  useEffect(() => {
    if (!enabled) return undefined;
    return subscribePreviewAnnotations(({ annotation, screenshot }) => {
      setDraft((current) => appendPreviewAnnotationPrompt(current, annotation));
      if (screenshot) {
        setImages((current) => [...current, {
          id: `preview-${annotation.id}`,
          name: `preview-${annotation.id}.png`,
          mediaType: screenshot.mimeType,
          size: screenshot.size,
          data: screenshot.data,
          preview: `data:${screenshot.mimeType};base64,${screenshot.data}`,
        }]);
      }
      focus();
    });
  });
}
