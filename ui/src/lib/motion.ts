import type { Transition } from "motion/react";

/* The single motion vocabulary for the motion/react side; the CSS side mirrors
   it via --dur-* and --ease-* tokens in index.css. Durations and curves form a
   closed scale — pick from here, never inline a new literal.

   Policy: keyboard-initiated actions and per-second-updating values (elapsed
   time, thinking state) never animate; skeleton→content swaps stay instant.
   Reduced motion is handled globally — MotionConfig reducedMotion="user" in
   main.tsx and the prefers-reduced-motion block in index.css — so components
   do not gate their own durations. */

export const EASE = [0.4, 0, 0.2, 1] as const;
export const EASE_OUT = [0, 0, 0.2, 1] as const;
/* Reserved for signature moments: mode/participant switches, prompt flight. */
export const EASE_EMPHASIZED = [0.22, 1, 0.36, 1] as const;

export const DUR = { fast: 0.15, base: 0.18, slow: 0.2 } as const;

/* Directional surface arrival on a mode switch. `animate` is false for
   keyboard-initiated switches, which stay instant. */
export function surfaceMotion({ animate, direction }: { animate: boolean; direction: number }, distance = 10) {
  const move = animate ? direction * distance : 0;
  return {
    initial: move ? { opacity: 0, y: move } : false,
    animate: { opacity: 1, y: 0 },
    exit: move ? { opacity: 0, y: move * -0.4 } : { opacity: 0 },
    transition: { duration: move ? DUR.base : 0, ease: EASE_EMPHASIZED } as Transition,
  };
}

/* Dialogs and floating overlays breathe in place — scale 0.98 + fade, no
   slide. Exit is a plain fade: subtler than enter. */
export const overlayMotion = {
  initial: { opacity: 0, scale: 0.98 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0 },
  transition: { duration: DUR.slow, ease: EASE_OUT } as Transition,
};

/* Side panels (visual stage) slide in from their edge with a settle blur. */
export const panelMotion = {
  initial: { opacity: 0, x: 18, filter: "blur(2px)" },
  animate: { opacity: 1, x: 0, filter: "blur(0px)" },
  exit: { opacity: 0, x: 8, filter: "blur(1px)" },
  transition: { duration: DUR.slow, ease: EASE_OUT } as Transition,
};

/* A discrete value or status swap: the new value materializes, the old one
   leaves with less movement. Never for values that update per second. */
export const swapMotion = {
  initial: { opacity: 0, y: 4, filter: "blur(2px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -2 },
  transition: { duration: DUR.fast, ease: EASE_OUT } as Transition,
};

/* Shared-element indicator (the mode-nav pill). */
export const pillSpring: Transition = { type: "spring", duration: DUR.base, bounce: 0 };

/* The hero morph: one element travelling between two anchor points (the
   centered rest composer ↔ the anchored bottom dock). Position-only so text
   never scale-distorts; size snaps. */
export function morphMotion(layoutId: string) {
  return {
    layout: "position" as const,
    layoutId,
    transition: { duration: DUR.base, ease: EASE } as Transition,
  };
}

/* List rows arriving/leaving (thread list inserts, reorders). Enters rise in;
   exits are a plain fade. Pair with AnimatePresence popLayout + initial={false}
   so first paint never staggers in. */
export const rowMotion = {
  layout: "position" as const,
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0 },
  transition: { duration: DUR.base, ease: EASE_OUT } as Transition,
};
