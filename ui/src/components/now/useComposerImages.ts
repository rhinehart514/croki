// Everything about getting images INTO the composer — picker, paste, and drag-drop — with the honest
// size/type errors from prepareComposerImages. Split from NowComposer so the input shell stays within
// the component ceiling.
import { useState, type ClipboardEvent, type DragEvent } from "react";
import { prepareComposerImages, type PendingComposerImage } from "./composerImageFiles";

export function useComposerImageIntake({ images, setImages, onSettled }: {
  images: PendingComposerImage[];
  setImages: (images: PendingComposerImage[]) => void;
  // Called after every attempt: null when the attach landed (clear stale error state), a plain message
  // when it could not.
  onSettled: (error: string | null) => void;
}) {
  const [dragging, setDragging] = useState(false);

  const add = async (files: File[]) => {
    try { setImages(await prepareComposerImages(files, images)); onSettled(null); }
    catch (cause) { onSettled(cause instanceof Error ? cause.message : "Drover could not attach those images."); }
  };

  const imageFiles = (list: FileList) => [...list].filter((file) => file.type.startsWith("image/"));

  return {
    dragging,
    add,
    onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const files = imageFiles(event.clipboardData.files);
      if (files.length) void add(files);
    },
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if ([...event.dataTransfer.items].some((item) => item.type.startsWith("image/"))) {
        event.preventDefault();
        setDragging(true);
      }
    },
    onDragLeave: () => setDragging(false),
    onDrop: (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      setDragging(false);
      const files = imageFiles(event.dataTransfer.files);
      if (files.length) void add(files);
    },
  };
}
