import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { ThreadResultSurface } from "../components/ProductSurfaces";
import { Eyebrow, Stage, clamp, fadeWindow } from "../components/Stage";
import { theme } from "../theme";

export const ContextScene = ({ duration, portrait }: { duration: number; portrait: boolean }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = fadeWindow(frame, duration, 5, 5);
  const enter = spring({ frame: frame - 4, fps, config: { damping: 21, stiffness: 98 } });
  const revealed = Math.min(3, Math.max(0, Math.floor((frame - 24) / 32) + 1));
  const drift = interpolate(frame, [0, duration], [0.992, 1.015], clamp);

  return (
    <Stage style={{ opacity }}>
      <div
        style={{
          position: "absolute",
          inset: portrait ? "94px 62px 104px" : "72px 94px 76px",
          display: "grid",
          gridTemplateRows: portrait ? "auto 1fr" : undefined,
          gridTemplateColumns: portrait ? undefined : "600px 1fr",
          gap: portrait ? 68 : 76,
          alignItems: "center",
        }}
      >
        <div>
          <Eyebrow>02 / Thread</Eyebrow>
          <div
            style={{
              marginTop: 26,
              color: theme.foreground,
              fontSize: portrait ? 92 : 96,
              lineHeight: 0.94,
              fontWeight: 720,
              letterSpacing: "-0.064em",
            }}
          >
            Watch the work.
            <br />
            <span style={{ color: theme.muted }}>Review the result.</span>
          </div>
          <div
            style={{
              marginTop: portrait ? 34 : 44,
              maxWidth: 500,
              color: theme.muted,
              fontSize: portrait ? 27 : 25,
              lineHeight: 1.42,
            }}
          >
            Execution is visible, attributable, and attached to the durable Thread.
          </div>
        </div>
        <div
          style={{
            height: portrait ? 900 : 850,
            transform: `translateX(${interpolate(enter, [0, 1], [portrait ? 0 : 90, 0], clamp)}px) translateY(${interpolate(enter, [0, 1], [portrait ? 70 : 0, 0], clamp)}px) scale(${drift})`,
            transformOrigin: portrait ? "50% 80%" : "0% 50%",
          }}
        >
          <ThreadResultSurface portrait={portrait} revealed={revealed} />
        </div>
      </div>
    </Stage>
  );
};
