"use client";

import { useRef, type ReactNode } from "react";
import {
  motion,
  useInView,
  useReducedMotion,
  type Transition,
  type UseInViewOptions,
  type Variants,
} from "motion/react";

type InViewProps = {
  children: ReactNode;
  className?: string;
  variants?: Variants;
  transition?: Transition;
  viewOptions?: UseInViewOptions;
};

const defaultVariants: Variants = {
  hidden: { opacity: 0, y: 12, filter: "blur(3px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)" },
};

const defaultTransition: Transition = {
  duration: 0.28,
  ease: [0.16, 1, 0.3, 1],
};

const defaultViewOptions: UseInViewOptions = { amount: 0.18, once: true };

export function InView({
  children,
  className,
  variants = defaultVariants,
  transition = defaultTransition,
  viewOptions = defaultViewOptions,
}: InViewProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, viewOptions);
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      ref={ref}
      className={className}
      initial="hidden"
      animate={inView ? "visible" : "hidden"}
      variants={variants}
      transition={transition}
    >
      {children}
    </motion.div>
  );
}
