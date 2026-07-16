'use client';

import * as React from 'react';
import {
  motion,
  type HTMLMotionProps,
  type LegacyAnimationControls,
  type TargetAndTransition,
  type Transition,
} from 'motion/react';

import { useAutoHeight } from '@/hooks/use-auto-height';
type AutoHeightProps = {
  children: React.ReactNode;
  deps?: React.DependencyList;
  animate?: TargetAndTransition | LegacyAnimationControls;
  transition?: Transition;
} & Omit<HTMLMotionProps<'div'>, 'animate'>;

function AutoHeight({
  children,
  deps = [],
  transition = {
    type: 'spring',
    stiffness: 300,
    damping: 30,
    bounce: 0,
    restDelta: 0.01,
  },
  style,
  animate,
  ...props
}: AutoHeightProps) {
  const { ref, height } = useAutoHeight<HTMLDivElement>(deps);

  return (
    <motion.div
      style={{ overflow: 'hidden', ...style }}
      animate={{ height, ...animate }}
      transition={transition}
      {...props}
    >
      <div ref={ref}>{children}</div>
    </motion.div>
  );
}

export { AutoHeight, type AutoHeightProps };
