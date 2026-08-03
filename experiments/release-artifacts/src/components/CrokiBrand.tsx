import { Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { clamp } from "./Stage";

export const CrokiMark = ({ size = 112 }: { size?: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 18, mass: 0.8, stiffness: 140 } });
  const rotation = interpolate(enter, [0, 1], [-9, 0], clamp);

  return (
    <Img
      src={staticFile("assets/croki/croki-mark.svg")}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.24,
        transform: `scale(${enter}) rotate(${rotation}deg)`,
        boxShadow: "0 30px 90px rgba(0,0,0,.55)",
      }}
    />
  );
};

export const CrokiWordmark = ({ compact = false }: { compact?: boolean }) => (
  <div style={{ display: "flex", alignItems: "center", gap: compact ? 18 : 28 }}>
    <CrokiMark size={compact ? 68 : 112} />
    <div style={{ fontSize: compact ? 46 : 82, fontWeight: 720, letterSpacing: "-0.055em" }}>
      Croki
    </div>
  </div>
);
