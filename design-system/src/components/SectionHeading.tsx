import * as React from "react";
import { cn } from "../lib/cn";

export interface SectionHeadingProps extends React.ComponentProps<"div"> {
  /** A leading glyph (14px), sized by the component. */
  icon?: React.ReactNode;
}

/** The uppercase, tracked rail/panel label that anchors a section. */
export function SectionHeading({
  icon,
  children,
  className,
  ...props
}: SectionHeadingProps) {
  return (
    <div className={cn("gtm-section-heading", className)} {...props}>
      {icon}
      {children}
    </div>
  );
}
