import { useEffect, useRef, useState } from "react";

export const STREAMING_TEXT_FRAME_MS = 20;
const STREAMING_TEXT_MAX_STEP = 16;

/**
 * Keeps normal token-sized updates tactile while accelerating larger provider
 * chunks enough that the display does not fall noticeably behind the turn.
 */
export function nextStreamingTextLength(currentLength: number, targetLength: number): number {
  if (currentLength >= targetLength) {
    return targetLength;
  }

  const remaining = targetLength - currentLength;
  const step = Math.max(1, Math.min(STREAMING_TEXT_MAX_STEP, Math.ceil(remaining / 4)));
  return Math.min(targetLength, currentLength + step);
}

export function safeStreamingTextLength(text: string, length: number): number {
  if (length <= 0 || length >= text.length) {
    return length;
  }
  const previousCodeUnit = text.charCodeAt(length - 1);
  return previousCodeUnit >= 0xd800 && previousCodeUnit <= 0xdbff ? length + 1 : length;
}

export function useSmoothStreamingText({
  text,
  streaming,
  reducedMotion,
}: {
  readonly text: string;
  readonly streaming: boolean;
  readonly reducedMotion: boolean;
}): string {
  // Existing content is the initial value, so opening a running thread never
  // retypes its history. Only text appended after mount is paced.
  const [displayedText, setDisplayedText] = useState(text);
  const displayedTextRef = useRef(displayedText);
  const targetTextRef = useRef(text);
  const timerRef = useRef<number | null>(null);

  displayedTextRef.current = displayedText;
  targetTextRef.current = text;

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const current = displayedTextRef.current;
    const appendedToCurrent = text.startsWith(current);
    if (!streaming || reducedMotion || !appendedToCurrent) {
      clearTimer();
      if (current !== text) {
        displayedTextRef.current = text;
        setDisplayedText(text);
      }
      return;
    }

    const tick = () => {
      timerRef.current = null;
      const target = targetTextRef.current;
      const visible = displayedTextRef.current;
      if (visible === target) {
        return;
      }
      if (!target.startsWith(visible)) {
        displayedTextRef.current = target;
        setDisplayedText(target);
        return;
      }

      const nextLength = safeStreamingTextLength(
        target,
        nextStreamingTextLength(visible.length, target.length),
      );
      const next = target.slice(0, Math.max(visible.length, nextLength));
      displayedTextRef.current = next;
      setDisplayedText(next);
      if (next !== target) {
        timerRef.current = window.setTimeout(tick, STREAMING_TEXT_FRAME_MS);
      }
    };

    if (current !== text && timerRef.current === null) {
      timerRef.current = window.setTimeout(tick, STREAMING_TEXT_FRAME_MS);
    }
  }, [reducedMotion, streaming, text]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    },
    [],
  );

  return displayedText;
}
