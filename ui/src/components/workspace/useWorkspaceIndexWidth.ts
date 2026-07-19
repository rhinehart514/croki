import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";

const INDEX_WIDTH_KEY = "drover.workspace-index.width";
export const MIN_INDEX_WIDTH = 208;
export const MAX_INDEX_WIDTH = 420;
const DEFAULT_INDEX_WIDTH = 256;

function clampWidth(width: number) {
  return Math.min(MAX_INDEX_WIDTH, Math.max(MIN_INDEX_WIDTH, width));
}

function initialIndexWidth() {
  if (typeof window === "undefined") return DEFAULT_INDEX_WIDTH;
  const stored = Number(window.localStorage.getItem(INDEX_WIDTH_KEY));
  return Number.isFinite(stored) && stored > 0 ? clampWidth(stored) : DEFAULT_INDEX_WIDTH;
}

/** Owns the persisted pointer and keyboard behavior of the work index's resize boundary. */
export function useWorkspaceIndexWidth() {
  const [indexWidth, setIndexWidth] = useState(initialIndexWidth);
  const resizeStartRef = useRef<{ pointerX: number; width: number } | null>(null);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const start = resizeStartRef.current;
      if (!start) return;
      setIndexWidth(clampWidth(start.width + event.clientX - start.pointerX));
    };
    const onPointerUp = () => {
      if (!resizeStartRef.current) return;
      resizeStartRef.current = null;
      document.body.classList.remove("vw-index-is-resizing");
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      document.body.classList.remove("vw-index-is-resizing");
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(INDEX_WIDTH_KEY, String(indexWidth));
  }, [indexWidth]);

  const beginResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    resizeStartRef.current = { pointerX: event.clientX, width: indexWidth };
    document.body.classList.add("vw-index-is-resizing");
  };

  const resizeWithKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    if (event.key === "Home") setIndexWidth(MIN_INDEX_WIDTH);
    else if (event.key === "End") setIndexWidth(MAX_INDEX_WIDTH);
    else setIndexWidth((current) => clampWidth(current + (event.key === "ArrowRight" ? 16 : -16)));
  };

  return { indexWidth, beginResize, resizeWithKeyboard };
}
