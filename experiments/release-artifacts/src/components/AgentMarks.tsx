import { Img, staticFile } from "remotion";

const agents = [
  ["Claude", "apps/marketing/public/harnesses/claude-ai-icon.svg"],
  ["Codex", "apps/marketing/public/harnesses/openai_dark.svg"],
  ["OpenCode", "apps/marketing/public/harnesses/opencode-dark.svg"],
  ["Cursor", "apps/marketing/public/harnesses/cursor_light.svg"],
  ["Grok", "apps/marketing/public/harnesses/grok-dark.svg"],
] as const;

export const AgentMarks = ({ progress }: { progress: number }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 22 }}>
    {agents.map(([name, source], index) => {
      const distanceFromCenter = index - (agents.length - 1) / 2;
      const translateX = distanceFromCenter * 46 * (1 - progress);
      const scale = 0.82 + progress * 0.18;
      return (
        <div
          key={name}
          style={{
            width: 82,
            height: 82,
            display: "grid",
            placeItems: "center",
            border: "1px solid rgba(247,247,245,.14)",
            background: "#0b0d11",
            transform: `translateX(${translateX}px) scale(${scale})`,
            opacity: 0.52 + progress * 0.48,
          }}
        >
          <Img
            src={staticFile(source)}
            alt={name}
            style={{ width: 38, height: 38, objectFit: "contain" }}
          />
        </div>
      );
    })}
  </div>
);
