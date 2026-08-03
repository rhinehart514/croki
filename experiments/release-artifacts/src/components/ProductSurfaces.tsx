import type { CSSProperties, ReactNode } from "react";
import { theme } from "../theme";

export const Surface = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <div
    style={{
      position: "relative",
      overflow: "hidden",
      background: "#050607",
      border: `1px solid ${theme.hairlineStrong}`,
      boxShadow: "0 54px 160px rgba(0,0,0,.72)",
      ...style,
    }}
  >
    {children}
  </div>
);

const MonoLabel = ({ children, bright = false }: { children: ReactNode; bright?: boolean }) => (
  <div
    style={{
      color: bright ? theme.foreground : theme.muted,
      fontFamily: theme.mono,
      fontSize: 15,
      fontWeight: 650,
      letterSpacing: "0.11em",
      textTransform: "uppercase",
    }}
  >
    {children}
  </div>
);

export const ThreadComposerSurface = ({ portrait }: { portrait: boolean }) => (
  <Surface
    style={{
      width: "100%",
      height: "100%",
      display: "grid",
      gridTemplateRows: "auto 1fr auto",
    }}
  >
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: portrait ? "28px 30px" : "26px 34px",
        borderBottom: `1px solid ${theme.hairline}`,
      }}
    >
      <MonoLabel bright>CROKI / NEW THREAD</MonoLabel>
      <MonoLabel>codex/release-artifacts</MonoLabel>
    </div>
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: portrait ? "54px 40px" : "54px 62px",
      }}
    >
      <MonoLabel>Founder request</MonoLabel>
      <div
        style={{
          marginTop: portrait ? 26 : 22,
          maxWidth: 1080,
          color: theme.foreground,
          fontSize: portrait ? 49 : 54,
          fontWeight: 620,
          lineHeight: 1.15,
          letterSpacing: "-0.038em",
        }}
      >
        Read the current release-artifact branch. Tell me what changed and why.
      </div>
      <div
        style={{
          marginTop: portrait ? 36 : 28,
          color: theme.muted,
          fontSize: portrait ? 27 : 25,
          lineHeight: 1.35,
        }}
      >
        Do not edit files.
      </div>
    </div>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: portrait ? "1fr 1fr" : "repeat(4, auto) 1fr",
        gap: portrait ? 24 : 36,
        alignItems: "center",
        padding: portrait ? "26px 30px" : "24px 34px",
        borderTop: `1px solid ${theme.hairline}`,
      }}
    >
      <MonoLabel bright>GPT-5.6-SOL</MonoLabel>
      <MonoLabel>Canvas 5 current</MonoLabel>
      <MonoLabel>Full access</MonoLabel>
      <MonoLabel>Build</MonoLabel>
      {!portrait ? (
        <div style={{ justifySelf: "end" }}>
          <MonoLabel bright>Send ↗</MonoLabel>
        </div>
      ) : null}
    </div>
  </Surface>
);

const resultRows = [
  ["01", "Reusable 27-second Remotion pipeline"],
  ["02", "Provenance, licensing and validation"],
  ["03", "Project actions and reusable agent skill"],
] as const;

export const ThreadResultSurface = ({
  portrait,
  revealed,
}: {
  portrait: boolean;
  revealed: number;
}) => (
  <Surface style={{ width: "100%", height: "100%", padding: portrait ? "36px 34px" : "36px 42px" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <MonoLabel bright>WORK LOG</MonoLabel>
      <MonoLabel>Worked for 25s</MonoLabel>
    </div>
    <div
      style={{
        marginTop: portrait ? 38 : 30,
        padding: portrait ? "28px 28px" : "24px 28px",
        borderTop: `1px solid ${theme.hairline}`,
        borderBottom: `1px solid ${theme.hairline}`,
        display: "flex",
        alignItems: "center",
        gap: 18,
      }}
    >
      <div style={{ color: theme.success, fontFamily: theme.mono, fontSize: 22 }}>✓</div>
      <div style={{ fontSize: portrait ? 27 : 25, fontWeight: 620 }}>
        Applied Canvas context · 5 active
      </div>
    </div>
    <div style={{ marginTop: portrait ? 52 : 44 }}>
      <MonoLabel>Result</MonoLabel>
      <div
        style={{
          marginTop: 18,
          fontSize: portrait ? 54 : 58,
          fontWeight: 690,
          letterSpacing: "-0.052em",
        }}
      >
        Added
      </div>
      <div style={{ marginTop: portrait ? 30 : 24 }}>
        {resultRows.map(([index, text], rowIndex) => (
          <div
            key={index}
            style={{
              display: "grid",
              gridTemplateColumns: portrait ? "54px 1fr" : "68px 1fr",
              gap: 18,
              padding: portrait ? "24px 0" : "21px 0",
              borderTop: `1px solid ${theme.hairline}`,
              opacity: rowIndex < revealed ? 1 : 0.16,
            }}
          >
            <MonoLabel>{index}</MonoLabel>
            <div
              style={{
                color: rowIndex < revealed ? theme.foreground : theme.muted,
                fontSize: portrait ? 29 : 31,
                lineHeight: 1.18,
                fontWeight: 590,
                letterSpacing: "-0.026em",
              }}
            >
              {text}
            </div>
          </div>
        ))}
      </div>
    </div>
  </Surface>
);

const canvasItems = [
  ["INTENT", "Accumulate product understanding"],
  ["DECISION", "Threads are the spine; Canvas is contextual"],
  ["EVIDENCE", "Standalone Croki is recoverably archived"],
  ["CONSEQUENCE", "Preserve upstream compatibility"],
] as const;

export const CanvasSurface = ({ portrait, revealed }: { portrait: boolean; revealed: number }) => (
  <Surface style={{ width: "100%", height: "100%" }}>
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: portrait ? "28px 30px" : "26px 34px",
        borderBottom: `1px solid ${theme.hairline}`,
      }}
    >
      <div>
        <MonoLabel bright>CANVAS</MonoLabel>
        <div style={{ marginTop: 6, color: theme.muted, fontSize: 19 }}>
          5 items · 4 relationships
        </div>
      </div>
      <MonoLabel bright>Current understanding</MonoLabel>
    </div>
    <div style={{ padding: portrait ? "20px 30px 28px" : "16px 34px 24px" }}>
      {canvasItems.map(([kind, text], index) => (
        <div
          key={text}
          style={{
            display: "grid",
            gridTemplateColumns: portrait ? "1fr" : "150px 1fr",
            gap: portrait ? 10 : 24,
            padding: portrait ? "23px 0" : "24px 0",
            borderBottom: `1px solid ${theme.hairline}`,
            opacity: index < revealed ? 1 : 0.15,
          }}
        >
          <MonoLabel bright={index < revealed}>{kind}</MonoLabel>
          <div
            style={{
              color: index < revealed ? theme.foreground : theme.muted,
              fontSize: portrait ? 29 : 32,
              lineHeight: 1.18,
              fontWeight: 590,
              letterSpacing: "-0.03em",
            }}
          >
            {text}
          </div>
        </div>
      ))}
    </div>
  </Surface>
);
