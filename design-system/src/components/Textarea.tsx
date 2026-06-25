import * as React from "react";
import { cn } from "../lib/cn";

export interface TextareaProps extends React.ComponentProps<"textarea"> {
  /** Monospace treatment for prompts, queries, and code. */
  mono?: boolean;
}

export function Textarea({ className, mono, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn("gtm-textarea", mono && "gtm-textarea--mono", className)}
      {...props}
    />
  );
}
