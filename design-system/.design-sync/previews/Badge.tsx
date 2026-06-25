import { Badge } from "@gtm-ide/design-system";

export function Tones() {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <Badge tone="proven">Proven</Badge>
      <Badge tone="gap">Attribution gap</Badge>
      <Badge tone="danger">Failed</Badge>
      <Badge tone="blind">No signal</Badge>
      <Badge tone="neutral">Draft</Badge>
      <Badge tone="agent">Agent</Badge>
    </div>
  );
}

export function StateMarks() {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <Badge tone="proven" caps>
        Proven
      </Badge>
      <Badge tone="gap" caps>
        Gap
      </Badge>
      <Badge tone="blind" caps>
        Blind
      </Badge>
    </div>
  );
}
