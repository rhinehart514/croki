import { Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { CanvasSurface } from "../components/ProductSurfaces";
import { Eyebrow, Stage, clamp, fadeWindow } from "../components/Stage";
import { theme } from "../theme";

export const ExecutionScene = ({ duration, portrait }: { duration: number; portrait: boolean }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = fadeWindow(frame, duration, 5, 5);
  const enter = spring({ frame: frame - 4, fps, config: { damping: 21, stiffness: 96 } });
  const revealed = Math.min(4, Math.max(0, Math.floor((frame - 18) / 28) + 1));
  const evidenceEnter = spring({
    frame: frame - 120,
    fps,
    config: { damping: 22, stiffness: 104 },
  });
  const drift = interpolate(frame, [0, duration], [0.992, 1.012], clamp);

  return (
    <Stage style={{ opacity }}>
      <div
        style={{
          position: "absolute",
          inset: portrait ? "94px 62px 104px" : "72px 94px 76px",
          display: "grid",
          gridTemplateRows: portrait ? "auto 1fr" : undefined,
          gridTemplateColumns: portrait ? undefined : "560px 1fr",
          gap: portrait ? 66 : 76,
          alignItems: "center",
        }}
      >
        <div>
          <Eyebrow>03 / Canvas</Eyebrow>
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
            Keep the why.
            <br />
            <span style={{ color: theme.muted }}>Across every turn.</span>
          </div>
          <div
            style={{
              marginTop: portrait ? 34 : 44,
              maxWidth: 480,
              color: theme.muted,
              fontSize: portrait ? 27 : 25,
              lineHeight: 1.42,
            }}
          >
            Canvas carries durable intent, decisions, evidence, and consequences without becoming
            another runtime.
          </div>
        </div>
        <div
          style={{
            position: "relative",
            height: portrait ? 920 : 850,
            transform: `translateX(${interpolate(enter, [0, 1], [portrait ? 0 : 90, 0], clamp)}px) translateY(${interpolate(enter, [0, 1], [portrait ? 70 : 0, 0], clamp)}px) scale(${drift})`,
            transformOrigin: portrait ? "50% 80%" : "0% 50%",
          }}
        >
          <div style={{ position: "absolute", inset: 0 }}>
            <CanvasSurface portrait={portrait} revealed={revealed} />
          </div>
          <div
            style={{
              position: "absolute",
              right: portrait ? 26 : 24,
              bottom: portrait ? 28 : 24,
              width: portrait ? 570 : 470,
              height: portrait ? 356 : 294,
              overflow: "hidden",
              border: `1px solid ${theme.foreground}`,
              background: theme.background,
              boxShadow: "0 36px 100px rgba(0,0,0,.9)",
              opacity: evidenceEnter,
              transform: `translateY(${interpolate(evidenceEnter, [0, 1], [44, 0], clamp)}px)`,
            }}
          >
            <Img
              src={staticFile(
                "experiments/release-artifacts/public/captures/croki-canvas-state.png",
              )}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.08)" }} />
            <div
              style={{
                position: "absolute",
                left: 0,
                bottom: 0,
                padding: portrait ? "13px 16px" : "10px 13px",
                color: theme.foreground,
                background: "rgba(0,0,0,.94)",
                borderTop: `1px solid ${theme.foreground}`,
                borderRight: `1px solid ${theme.foreground}`,
                fontFamily: theme.mono,
                fontSize: portrait ? 15 : 13,
                letterSpacing: "0.1em",
              }}
            >
              VERIFIED CAPTURE / CROKI PREVIEW
            </div>
          </div>
        </div>
      </div>
    </Stage>
  );
};
