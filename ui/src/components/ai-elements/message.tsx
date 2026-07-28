"use client";

// Installed from AI Elements and intentionally narrowed to the one primitive Croki needs. The
// surrounding chat already owns its layout and controls; Streamdown adds robust assistant markdown
// without importing a second component-system vocabulary into the rail.
import { lazy, memo, Suspense, type ComponentProps } from "react";
import type { Streamdown as StreamdownComponent } from "streamdown";
import { cn } from "@/lib/utils";

export type MessageResponseProps = ComponentProps<typeof StreamdownComponent>;

// Streamdown remembers the character count from the prior render, so only newly appended words
// settle in. Keep the movement below the threshold where a long answer starts to shimmer.
const STREAMING_TEXT_MOTION = {
  animation: "thread-stream-word-in",
  duration: 180,
  easing: "cubic-bezier(0, 0, 0.2, 1)",
  sep: "word",
  stagger: 6,
} satisfies Exclude<MessageResponseProps["animated"], boolean | undefined>;

// Streamdown deliberately loads only when an actual model response reaches the thread. Its rich
// markdown/diagram parser is substantial; an empty venture and the canvas should not pay for it.
const LazyStreamdown = lazy(async () => {
  const module = await import("streamdown");
  return { default: module.Streamdown };
});

export const MessageResponse = memo(
  ({ className, animated, ...props }: MessageResponseProps) => (
    <Suspense fallback={<div className={cn("firm-app-message-response", className)}>{props.children}</div>}>
      <LazyStreamdown
        animated={animated ?? (props.isAnimating ? STREAMING_TEXT_MOTION : false)}
        className={cn("firm-app-message-response", className)}
        {...props}
      />
    </Suspense>
  ),
  (previous, next) => previous.children === next.children
    && previous.isAnimating === next.isAnimating
    && previous.animated === next.animated
    && previous.components === next.components,
);

MessageResponse.displayName = "MessageResponse";
