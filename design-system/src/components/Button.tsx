import * as React from "react";
import { Button as ButtonPrimitive } from "@base-ui/react/button";
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
  /** Render as the single child element instead of a `<button>`. */
  asChild?: boolean;
}

/**
 * The Drover button. `primary` is the dark ink action; `secondary`, `ghost`,
 * and `outline` recede from there.
 */
export function Button({
  className,
  variant,
  size,
  asChild = false,
  children,
  ...props
}: ButtonProps) {
  const classNames = cn(buttonVariants({ variant, size }), className);

  if (asChild) {
    const child = React.Children.only(children);
    if (!React.isValidElement(child)) {
      throw new Error("Button with asChild requires one React element child.");
    }
    const nativeButton = child.type === "button";

    return (
      <ButtonPrimitive
        {...props}
        className={classNames}
        nativeButton={nativeButton}
        render={child}
      />
    );
  }

  return (
    <ButtonPrimitive className={classNames} {...props}>
      {children}
    </ButtonPrimitive>
  );
}

export { buttonVariants };
