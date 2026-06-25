import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn";

const badgeVariants = cva("gtm-badge", {
  variants: {
    tone: {
      proven: "gtm-badge--proven",
      gap: "gtm-badge--gap",
      danger: "gtm-badge--danger",
      blind: "gtm-badge--blind",
      neutral: "gtm-badge--neutral",
      agent: "gtm-badge--agent",
    },
    /** Uppercase, tracked treatment — the "PROVEN / GAP / BLIND" state mark. */
    caps: { true: "gtm-badge--caps", false: "" },
  },
  defaultVariants: { tone: "neutral", caps: false },
});

export interface BadgeProps
  extends React.ComponentProps<"span">,
    VariantProps<typeof badgeVariants> {}

/**
 * A semantic status pill. Color carries MEANING only — `proven` (green),
 * `gap` (amber), `danger` (red), `blind` (no signal), `agent` (ink), `neutral`.
 */
export function Badge({ className, tone, caps, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, caps }), className)} {...props} />;
}

export { badgeVariants };
