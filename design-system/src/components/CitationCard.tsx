import * as React from "react";
import { cn } from "../lib/cn";

export interface CitationCardProps extends React.ComponentProps<"div"> {
  /** The grounded location, e.g. "brain/src/scan.mjs:42". */
  path: React.ReactNode;
  /** A leading glyph for the location row (e.g. a file icon). */
  icon?: React.ReactNode;
  /** The cited source excerpt, rendered in mono. */
  code?: React.ReactNode;
}

/** A `file:line` proof card — the grounding receipt with a mono code excerpt. */
export function CitationCard({
  path,
  icon,
  code,
  className,
  children,
  ...props
}: CitationCardProps) {
  return (
    <div className={cn("gtm-citation", className)} {...props}>
      <div className="gtm-citation__location">
        {icon}
        <span className="gtm-citation__path">{path}</span>
      </div>
      {code != null ? <code className="gtm-citation__code">{code}</code> : null}
      {children}
    </div>
  );
}
