import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { CrokiWordmark } from "../components/CrokiBrand";
import { LottieLabSignalField } from "../components/LottieLabMotion";
import { Stage, clamp, fadeWindow } from "../components/Stage";
import { theme } from "../theme";

export const CloseScene = ({ duration, portrait }: { duration: number; portrait: boolean }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = fadeWindow(frame, duration, 5, 8);
  const enter = spring({ frame: frame - 2, fps, config: { damping: 20, stiffness: 92 } });
  const y = interpolate(enter, [0, 1], [64, 0], clamp);

  return (
    <Stage style={{ opacity }}>
      <div
        style={{
          position: "absolute",
          width: portrait ? 1260 : 980,
          height: portrait ? 1260 : 980,
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          opacity: 0.18,
        }}
      >
        <LottieLabSignalField />
      </div>
      <div
        style={{
          position: "absolute",
          inset: portrait ? "180px 72px" : "104px 116px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          textAlign: "center",
          transform: `translateY(${y}px)`,
        }}
      >
        <div style={{ transform: `scale(${portrait ? 1.36 : 1.24})` }}>
          <CrokiWordmark compact={portrait} />
        </div>
        <div
          style={{
            marginTop: portrait ? 104 : 92,
            color: theme.foreground,
            fontSize: portrait ? 100 : 108,
            lineHeight: 0.94,
            fontWeight: 720,
            letterSpacing: "-0.066em",
            maxWidth: portrait ? 900 : 1350,
          }}
        >
          The coding environment
          <br />
          <span style={{ color: theme.muted }}>for founders.</span>
        </div>
        <div
          style={{
            marginTop: portrait ? 114 : 92,
            paddingTop: 24,
            width: portrait ? 620 : 720,
            borderTop: `1px solid ${theme.hairlineStrong}`,
            color: theme.foreground,
            fontFamily: theme.mono,
            fontSize: portrait ? 18 : 17,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          Open source · Bring your own agents
        </div>
      </div>
    </Stage>
  );
};
