import { StatusDot } from "@gtm-ide/design-system";

const label = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  fontSize: 13,
  color: "var(--ink-2)",
} as const;

export function Tones() {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <span style={label}>
        <StatusDot tone="proven" />
        Connector ready
      </span>
      <span style={label}>
        <StatusDot tone="gap" />
        Key expiring
      </span>
      <span style={label}>
        <StatusDot tone="danger" />
        Send failed
      </span>
      <span style={label}>
        <StatusDot tone="missing" />
        No API key
      </span>
    </div>
  );
}
