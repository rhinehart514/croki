import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { AgentMarks } from "../components/AgentMarks";
import { CrokiMark } from "../components/CrokiBrand";
import { LottieLabSignalField } from "../components/LottieLabMotion";
import { Eyebrow, Stage, clamp, fadeWindow } from "../components/Stage";
import { theme } from "../theme";

export const TensionScene = ({ duration, portrait }: { duration: number; portrait: boolean }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = fadeWindow(frame, duration, 5, 5);
  const enter = spring({ frame: frame - 4, fps, config: { damping: 20, stiffness: 92 } });
  const headlineEnter = spring({ frame: frame - 10, fps, config: { damping: 22, stiffness: 110 } });
  const fieldScale = interpolate(enter, [0, 1], [0.76, 1], clamp);
  const fieldRotation = interpolate(frame, [0, duration], [-8, 5], clamp);

  return (
    <Stage style={{ opacity }}>
      <div
        style={{
          position: "absolute",
          width: portrait ? 980 : 820,
          height: portrait ? 980 : 820,
          right: portrait ? 50 : 80,
          top: portrait ? 120 : 130,
          transform: `scale(${fieldScale}) rotate(${fieldRotation}deg)`,
        }}
      >
        <LottieLabSignalField opacity={0.92} />
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            transform: `rotate(${-fieldRotation}deg)`,
          }}
        >
          <CrokiMark size={portrait ? 124 : 106} />
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: portrait ? 66 : 104,
          right: portrait ? 66 : undefined,
          top: portrait ? 1110 : 150,
          bottom: portrait ? 110 : 104,
          width: portrait ? undefined : 860,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            opacity: headlineEnter,
            transform: `translateY(${interpolate(headlineEnter, [0, 1], [54, 0], clamp)}px)`,
          }}
        >
          <Eyebrow>Croki / one environment</Eyebrow>
          <div
            style={{
              marginTop: 34,
              color: theme.foreground,
              fontSize: portrait ? 104 : 112,
              lineHeight: 0.94,
              fontWeight: 720,
              letterSpacing: "-0.066em",
            }}
          >
            Your coding
            <br />
            agents.
            <br />
            <span style={{ color: theme.muted }}>One durable thread.</span>
          </div>
        </div>
        <div style={{ alignSelf: portrait ? "stretch" : "flex-start" }}>
          <AgentMarks progress={enter} />
        </div>
      </div>
    </Stage>
  );
};
