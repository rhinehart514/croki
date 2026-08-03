import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { ThreadComposerSurface } from "../components/ProductSurfaces";
import { Eyebrow, Stage, clamp, fadeWindow } from "../components/Stage";
import { theme } from "../theme";

export const ConvergenceScene = ({
  duration,
  portrait,
}: {
  duration: number;
  portrait: boolean;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = fadeWindow(frame, duration, 5, 5);
  const enter = spring({ frame: frame - 3, fps, config: { damping: 22, stiffness: 100 } });
  const y = interpolate(enter, [0, 1], [portrait ? 100 : 72, 0], clamp);
  const drift = interpolate(frame, [0, duration], [0.99, 1.012], clamp);

  return (
    <Stage style={{ opacity }}>
      <div
        style={{
          position: "absolute",
          left: portrait ? 66 : 96,
          right: portrait ? 66 : 96,
          top: portrait ? 112 : 72,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "end",
        }}
      >
        <div>
          <Eyebrow>01 / Intent</Eyebrow>
          <div
            style={{
              marginTop: 18,
              color: theme.foreground,
              fontSize: portrait ? 82 : 74,
              lineHeight: 0.96,
              fontWeight: 710,
              letterSpacing: "-0.06em",
            }}
          >
            Start with the ask.
          </div>
        </div>
        {!portrait ? (
          <div style={{ width: 390, color: theme.muted, fontSize: 24, lineHeight: 1.35 }}>
            The request, repository, model, and current context stay visible.
          </div>
        ) : null}
      </div>
      <div
        style={{
          position: "absolute",
          left: portrait ? 66 : 96,
          right: portrait ? 66 : 96,
          top: portrait ? 360 : 260,
          bottom: portrait ? 118 : 78,
          transform: `translateY(${y}px) scale(${drift})`,
          transformOrigin: "50% 70%",
        }}
      >
        <ThreadComposerSurface portrait={portrait} />
      </div>
    </Stage>
  );
};
