import * as React from "react";
import { cn } from "../lib/cn";

export type StatusTone = "proven" | "ready" | "gap" | "danger" | "missing" | "blind";

export interface StatusDotProps extends React.ComponentProps<"span"> {
  tone?: StatusTone;
}

/** A 7px tone marker — connector ready/missing, node health, run state. */
export function StatusDot({ tone = "blind", className, ...props }: StatusDotProps) {
  return <span className={cn("gtm-dot", `gtm-dot--${tone}`, className)} {...props} />;
}
