import * as React from "react";
import { cn } from "../lib/cn";

/** A white surface with a hairline border and low rest elevation. */
export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("gtm-card", className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("gtm-card__header", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return <h3 className={cn("gtm-card__title", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("gtm-card__description", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("gtm-card__content", className)} {...props} />;
}
