import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { SPRING, SPRING_SOFT } from "@/lib/springs";

// The motion system. One spring (from ./springs) drives everything that moves, including tabs,
// menus, sheets, accordions, lists — so the whole app feels like one object. The discipline: nothing
// hard-cuts. Things that change position MOVE (layoutId), things that appear spring from where they
// came from, and everything animates OUT via AnimatePresence, not just in.

type Origin = "top" | "bottom" | "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";
const ORIGIN: Record<Origin, string> = {
  top: "top center", bottom: "bottom center", "top-left": "top left", "top-right": "top right",
  "bottom-left": "bottom left", "bottom-right": "bottom right", center: "center",
};

// Reveal — dropdowns, menus, popovers, sheets. Springs from its origin (so it grows out of the
// trigger) on enter, and animates OUT on close. Put the surface's own class on Reveal — it IS the
// positioned element, replacing the old `{open && <div className="x">…}`.
export function Reveal({
  open, children, origin = "top", className, role, distance = 5,
}: {
  open: boolean;
  children: ReactNode;
  origin?: Origin;
  className?: string;
  role?: string;
  distance?: number;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className={className}
          role={role}
          style={{ transformOrigin: ORIGIN[origin] }}
          initial={{ opacity: 0, scale: 0.96, y: -distance }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: -Math.round(distance * 0.6) }}
          transition={SPRING}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

// Collapse — accordions, tool clusters, drawers. Height springs open/closed instead of snapping.
export function Collapse({ open, children, className }: { open: boolean; children: ReactNode; className?: string }) {
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          className={className}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={SPRING_SOFT}
          style={{ overflow: "hidden" }}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

// Stagger / StaggerItem — a list whose rows deal in one after another (and out, inside AnimatePresence).
// Wrap the list in <Stagger>, each row in <StaggerItem>. Keep the row's own className on StaggerItem.
export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.03 } } }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0, transition: SPRING_SOFT } }}
    >
      {children}
    </motion.div>
  );
}

// Pop — a tiny spring pop when a value (a count, a health number) changes, so the eye catches the
// update. Key it on the value: <Pop k={count}>{count}</Pop>.
export function Pop({ k, children, className }: { k: string | number; children: ReactNode; className?: string }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={k}
        className={className}
        initial={{ opacity: 0, scale: 0.7, y: -3 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.7, y: 3, position: "absolute" }}
        transition={SPRING}
        style={{ display: "inline-block" }}
      >
        {children}
      </motion.span>
    </AnimatePresence>
  );
}
