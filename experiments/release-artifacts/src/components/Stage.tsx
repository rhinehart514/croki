import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, interpolate } from "remotion";
import { theme } from "../theme";

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const fadeWindow = (frame: number, duration: number, fadeIn = 18, fadeOut = 18) =>
  interpolate(frame, [0, fadeIn, duration - fadeOut, duration], [0, 1, 1, 0], clamp);

export const Stage = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <AbsoluteFill
    style={{
      backgroundColor: theme.background,
      color: theme.foreground,
      fontFamily: theme.font,
      overflow: "hidden",
      ...style,
    }}
  >
    {children}
  </AbsoluteFill>
);

export const Eyebrow = ({ children }: { children: ReactNode }) => (
  <div
    style={{
      color: theme.muted,
      fontFamily: theme.mono,
      fontSize: 18,
      fontWeight: 600,
      letterSpacing: "0.16em",
      textTransform: "uppercase",
    }}
  >
    {children}
  </div>
);
