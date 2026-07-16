"use client";

// Installed from AI Elements and intentionally narrowed to the one primitive Drover needs. The
// surrounding chat already owns its layout and controls; Streamdown adds robust assistant markdown
// without importing a second component-system vocabulary into the rail.
import { lazy, memo, Suspense, type ComponentProps } from "react";
import type { Streamdown as StreamdownComponent } from "streamdown";
import { cn } from "@/lib/utils";

export type MessageResponseProps = ComponentProps<typeof StreamdownComponent>;

// Streamdown deliberately loads only when an actual model response reaches the thread. Its rich
// markdown/diagram parser is substantial; an empty venture and the canvas should not pay for it.
const LazyStreamdown = lazy(async () => {
  const module = await import("streamdown");
  return { default: module.Streamdown };
});

export const MessageResponse = memo(
  ({ className, ...props }: MessageResponseProps) => (
    <Suspense fallback={<div className={cn("firm-app-message-response", className)}>{props.children}</div>}>
      <LazyStreamdown className={cn("firm-app-message-response", className)} {...props} />
    </Suspense>
  ),
  (previous, next) => previous.children === next.children && previous.isAnimating === next.isAnimating,
);

MessageResponse.displayName = "MessageResponse";
