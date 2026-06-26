import { motion } from "motion/react";
import "@/styles/sliding-tabs.css";

// Animate-UI-style tabs: the active background pill SLIDES (springs) from tab to tab as you click,
// via a shared `layoutId`. The label rides above the indicator. One reusable control so every tab
// row in the app moves the same way — the felt thing the founder pointed at in Animate UI.
export function SlidingTabs<T extends string>({
  items, value, onChange, layoutId, size = "md", className,
}: {
  items: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  // Must be unique per tab GROUP — it's the shared element Motion springs between.
  layoutId: string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div className={`stabs stabs-${size} ${className ?? ""}`} role="tablist">
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            role="tab"
            aria-selected={active}
            className={`stab ${active ? "active" : ""}`}
            onClick={() => onChange(it.value)}
            type="button"
          >
            {active ? (
              <motion.span
                layoutId={layoutId}
                className="stab-pill"
                transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.8 }}
              />
            ) : null}
            <span className="stab-label">{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}
