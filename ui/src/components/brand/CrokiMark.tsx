import { useId } from "react";
import "./croki-mark.css";

const FACE_PATH = "M88 61c12-3 25 3 40 15l29-15 23-24-3 61 14 31-14 57-49 33-49-33-15-57 18-29 1-23c0-9 1-14 5-16Z";
const DOG_EAR_PATH = "M84 59C62 53 42 68 36 89l12 41c3 10 14 13 21 4l25-58c3-8-2-14-10-17Z";

export function CrokiMark({ className, title = "Croki", decorative = false, active = false }: {
  className?: string;
  title?: string;
  decorative?: boolean;
  active?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const gradientId = `croki-spectrum-${id}`;
  const faceClipId = `croki-face-${id}`;

  return (
    <svg
      className={["croki-mark", className].filter(Boolean).join(" ")}
      viewBox="0 0 256 256"
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : title}
      data-active={active ? "true" : undefined}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="448" y2="256" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--agent-spectrum-cyan, #6ee7f5)" />
          <stop offset=".2" stopColor="var(--agent-spectrum-blue, #7c9cff)" />
          <stop offset=".4" stopColor="var(--agent-spectrum-violet, #a78bfa)" />
          <stop offset=".6" stopColor="var(--agent-spectrum-rose, #fb7185)" />
          <stop offset=".8" stopColor="var(--agent-spectrum-amber, #fbbf24)" />
          <stop offset="1" stopColor="var(--agent-spectrum-green, #6ee7b7)" />
        </linearGradient>
        <clipPath id={faceClipId}>
          <path d={FACE_PATH} />
          <path d={DOG_EAR_PATH} />
        </clipPath>
      </defs>
      <rect width="256" height="256" rx="58" fill="#090b0f" />
      <path fill="#f7f7f5" d={FACE_PATH} />
      <path fill="#f7f7f5" d={DOG_EAR_PATH} />
      <g clipPath={`url(#${faceClipId})`} aria-hidden="true">
        <rect className="croki-mark-spectrum" x="-96" y="0" width="448" height="256" fill={`url(#${gradientId})`} />
      </g>
      <path d="M91 69 70 132" fill="none" stroke="#090b0f" strokeWidth="6" strokeLinecap="round" />
      <path fill="#090b0f" d="M82 119c9-10 25-10 35 1-9 13-27 14-35-1Zm59 1c9-11 26-12 36-2-8 14-27 15-36 2Zm-29 31c9-7 23-7 32 0l-16 19-16-19Z" />
      <path d="M128 168v16m0 0-13 10m13-10 13 10" fill="none" stroke="#090b0f" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m152 151 28-4m-28 15h30m-29 11 27 5" fill="none" stroke="#090b0f" strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}
