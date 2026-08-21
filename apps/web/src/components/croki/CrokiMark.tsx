import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";

const FACE_PATH =
  "M88 61c12-3 25 3 40 15l29-15 23-24-3 61 14 31-14 57-49 33-49-33-15-57 18-29 1-23c0-9 1-14 5-16Z";
const DOG_EAR_PATH = "M84 59C62 53 42 68 36 89l12 41c3 10 14 13 21 4l25-58c3-8-2-14-10-17Z";
const LEFT_EYE_PATH = "M82 119c9-10 25-10 35 1-9 13-27 14-35-1Z";
const RIGHT_EYE_PATH = "M141 120c9-11 26-12 36-2-8 14-27 15-36 2Z";
const NOSE_PATH = "M112 151c9-7 23-7 32 0l-16 19-16-19Z";

interface CrokiMarkProps {
  readonly animated?: boolean;
  readonly className?: string;
  readonly decorative?: boolean;
}

/**
 * The canonical in-product Croki mark.
 *
 * Motion is intentionally brief and event-driven: one entrance and one response per hover.
 * Platform icons and reduced-motion presentations remain completely static.
 */
export function CrokiMark({ animated = true, className, decorative }: CrokiMarkProps) {
  const id = useId().replaceAll(":", "");
  const prefersReducedMotion = useReducedMotion();
  const motionEnabled = animated && !prefersReducedMotion;
  const gradientId = `croki-spectrum-${id}`;
  const faceClipId = `croki-face-${id}`;

  return (
    <motion.svg
      animate={
        motionEnabled
          ? {
              opacity: 1,
              scale: [0.92, 1.025, 1],
            }
          : false
      }
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : "Croki"}
      className={className}
      data-croki-mark-motion={motionEnabled ? "animated" : "static"}
      initial={motionEnabled ? { opacity: 0, scale: 0.92 } : false}
      role={decorative ? undefined : "img"}
      transition={{ duration: 0.56, ease: [0.22, 1, 0.36, 1], times: [0, 0.72, 1] }}
      viewBox="0 0 256 256"
      {...(motionEnabled
        ? {
            whileHover: {
              rotate: [0, -1.5, 0],
              scale: [1, 1.045, 1],
              transition: { duration: 0.36, ease: "easeOut" as const },
            },
          }
        : {})}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="448" y2="256">
          <stop offset="0" stopColor="#6ee7f5" />
          <stop offset=".2" stopColor="#7c9cff" />
          <stop offset=".4" stopColor="#a78bfa" />
          <stop offset=".6" stopColor="#fb7185" />
          <stop offset=".8" stopColor="#fbbf24" />
          <stop offset="1" stopColor="#6ee7b7" />
        </linearGradient>
        <clipPath id={faceClipId}>
          <path d={FACE_PATH} />
          <path d={DOG_EAR_PATH} />
        </clipPath>
      </defs>
      <rect width="256" height="256" rx="58" fill="#090b0f" />
      <motion.path
        animate={motionEnabled ? { scale: [0.97, 1.012, 1], y: [3, -1, 0] } : false}
        d={FACE_PATH}
        fill="#f7f7f5"
        initial={motionEnabled ? { scale: 0.97, y: 3 } : false}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
        transition={{ delay: 0.03, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      />
      <motion.path
        animate={motionEnabled ? { rotate: [-9, 3, 0], y: [4, -1, 0] } : false}
        d={DOG_EAR_PATH}
        fill="#f7f7f5"
        initial={motionEnabled ? { rotate: -9, y: 4 } : false}
        style={{ transformBox: "fill-box", transformOrigin: "70% 70%" }}
        transition={{ delay: 0.06, duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
      />
      <g clipPath={`url(#${faceClipId})`}>
        <motion.rect
          animate={motionEnabled ? { x: 0 } : false}
          fill={`url(#${gradientId})`}
          height="256"
          initial={motionEnabled ? { x: -128 } : false}
          transition={{ delay: 0.08, duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
          width="448"
          x="-96"
        />
      </g>
      <motion.path
        animate={motionEnabled ? { opacity: 1, pathLength: 1 } : false}
        d="M91 69 70 132"
        fill="none"
        initial={motionEnabled ? { opacity: 0.25, pathLength: 0 } : false}
        stroke="#090b0f"
        strokeLinecap="round"
        strokeWidth="6"
        transition={{ delay: 0.14, duration: 0.3, ease: "easeOut" }}
      />
      <motion.path
        animate={motionEnabled ? { scaleY: [1, 1, 0.08, 1] } : false}
        d={LEFT_EYE_PATH}
        fill="#090b0f"
        initial={false}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
        transition={{ delay: 0.2, duration: 0.28, ease: "easeInOut", times: [0, 0.42, 0.64, 1] }}
      />
      <motion.path
        animate={motionEnabled ? { scaleY: [1, 1, 0.08, 1] } : false}
        d={RIGHT_EYE_PATH}
        fill="#090b0f"
        initial={false}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
        transition={{ delay: 0.22, duration: 0.28, ease: "easeInOut", times: [0, 0.42, 0.64, 1] }}
      />
      <path d={NOSE_PATH} fill="#090b0f" />
      <motion.path
        animate={motionEnabled ? { opacity: 1, pathLength: 1 } : false}
        d="M128 168v16m0 0-13 10m13-10 13 10"
        fill="none"
        initial={motionEnabled ? { opacity: 0.35, pathLength: 0 } : false}
        stroke="#090b0f"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="7"
        transition={{ delay: 0.24, duration: 0.3, ease: "easeOut" }}
      />
      <motion.path
        animate={motionEnabled ? { opacity: 1, pathLength: 1 } : false}
        d="m152 151 28-4m-28 15h30m-29 11 27 5"
        fill="none"
        initial={motionEnabled ? { opacity: 0.25, pathLength: 0 } : false}
        stroke="#090b0f"
        strokeLinecap="round"
        strokeWidth="6"
        transition={{ delay: 0.28, duration: 0.28, ease: "easeOut" }}
      />
    </motion.svg>
  );
}
