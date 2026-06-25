import * as React from "react";
import { cn } from "../lib/cn";

export interface InputProps extends React.ComponentProps<"input"> {
  /** Monospace treatment for refs, file paths, and identifiers. */
  mono?: boolean;
}

export function Input({ className, mono, ...props }: InputProps) {
  return (
    <input className={cn("gtm-input", mono && "gtm-input--mono", className)} {...props} />
  );
}
