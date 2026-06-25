import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn";

const buttonVariants = cva("gtm-btn", {
  variants: {
    variant: {
      primary: "gtm-btn--primary",
      secondary: "gtm-btn--secondary",
      ghost: "gtm-btn--ghost",
      outline: "gtm-btn--outline",
    },
    size: {
      md: "gtm-btn--md",
      sm: "gtm-btn--sm",
      icon: "gtm-btn--icon",
    },
  },
  defaultVariants: { variant: "primary", size: "md" },
});

export interface ButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {
  /** Render as the single child element (Radix Slot) instead of a `<button>`. */
  asChild?: boolean;
}

/**
 * The GTM IDE button. `primary` is the dark ink pill — the Deploy / Publish / Run
 * action. `secondary`, `ghost`, and `outline` recede from there.
 */
export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}

export { buttonVariants };
