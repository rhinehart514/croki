import * as React from "react";
import { cn } from "../lib/cn";

export interface SegmentedTabItem {
  value: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
}

export interface SegmentedTabsProps
  extends Omit<React.ComponentProps<"div">, "onChange"> {
  items: SegmentedTabItem[];
  value: string;
  onValueChange?: (value: string) => void;
}

/**
 * The inset mode strip (e.g. Build / Run / Measure). Controlled: pass `value`
 * and handle `onValueChange`.
 */
export function SegmentedTabs({
  items,
  value,
  onValueChange,
  className,
  ...props
}: SegmentedTabsProps) {
  return (
    <div className={cn("gtm-tabs", className)} role="tablist" {...props}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            className={cn("gtm-tab", active && "gtm-tab--active")}
            onClick={() => onValueChange?.(item.value)}
          >
            {item.icon}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
