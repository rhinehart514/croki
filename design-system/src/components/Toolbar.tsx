import * as React from "react";
import { cn } from "../lib/cn";

/** The frosted top bar that holds the brand, breadcrumbs, and global actions. */
export function Toolbar({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("gtm-toolbar", className)} {...props} />;
}

export interface BrandProps extends React.ComponentProps<"div"> {
  /** The brand glyph, rendered in the dark ink mark chip. */
  mark?: React.ReactNode;
}

export function Brand({ mark, children, className, ...props }: BrandProps) {
  return (
    <div className={cn("gtm-brand", className)} {...props}>
      {mark != null ? <span className="gtm-brand-mark">{mark}</span> : null}
      {children}
    </div>
  );
}

export function ToolbarDivider({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("gtm-toolbar__divider", className)} {...props} />;
}

export function ToolbarSpacer({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("gtm-toolbar__spacer", className)} {...props} />;
}
