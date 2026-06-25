import { WorkflowNode } from "@gtm-ide/design-system";

// 12px glyphs — sized by the node's `.gtm-node__icon svg` rule.
const I = {
  source: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  ),
  enrich: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
    </svg>
  ),
  filter: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 4h18l-7 8v6l-4 2v-8z" />
    </svg>
  ),
  generate: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="m12 2 2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z" />
    </svg>
  ),
  gate: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="11" width="16" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  ),
  execute: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  ),
  measure: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 3v18h18" />
      <path d="m7 14 3-3 3 3 5-5" />
    </svg>
  ),
};

const Check = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const row = {
  display: "flex",
  gap: 14,
  flexWrap: "wrap",
  alignItems: "flex-start",
} as const;

export function Pipeline() {
  return (
    <div style={row}>
      <WorkflowNode
        category="source"
        icon={I.source}
        label="Find ICP accounts"
        connector="agent:gtm-signal-github"
        count="128 accounts"
      />
      <WorkflowNode
        category="enrich"
        icon={I.enrich}
        label="Enrich firmographics"
        count="128 enriched"
      />
      <WorkflowNode
        category="gate"
        icon={I.gate}
        label="Founder review"
        status={<Check />}
        count="42 approved"
      />
      <WorkflowNode
        category="execute"
        icon={I.execute}
        label="Send opener"
        connector="tool:instantly"
        count="42 queued"
      />
    </div>
  );
}

export function Categories() {
  return (
    <div style={row}>
      <WorkflowNode category="filter" icon={I.filter} label="ICP fit ≥ 80" count="64 kept" />
      <WorkflowNode
        category="generate"
        icon={I.generate}
        label="Draft opening line"
        connector="skill:positioning"
      />
      <WorkflowNode category="measure" icon={I.measure} label="Attribution" count="blind" />
    </div>
  );
}

export function States() {
  return (
    <div style={row}>
      <WorkflowNode
        category="enrich"
        icon={I.enrich}
        label="Enrich firmographics"
        selected
        count="128 enriched"
      />
      <WorkflowNode
        category="execute"
        icon={I.execute}
        label="Send opener"
        error="Connector missing API key"
      />
    </div>
  );
}

const Gear = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v3M12 18.5v3M4.5 4.5l2 2M17.5 17.5l2 2M2.5 12h3M18.5 12h3M4.5 19.5l2-2M17.5 6.5l2-2" />
  </svg>
);

// RICH variant — the editor canvas card: tinted chip, gear, Auto-Run / Cost /
// Mapped-fields meta rows. Opt in by passing autoRun / cost / fields.
export function Rich() {
  return (
    <div data-skin="glass" style={row}>
      <WorkflowNode
        category="source"
        icon={I.source}
        gear={Gear}
        label="Imported Accounts"
        autoRun
        cost="Free"
        fields={9}
      />
      <WorkflowNode
        category="generate"
        icon={I.generate}
        gear={Gear}
        label="Draft opening line"
        autoRun={false}
        cost={1}
        fields={1}
        selected
      />
      <WorkflowNode
        category="execute"
        icon={I.execute}
        gear={Gear}
        label="Send opener"
        autoRun={false}
        cost={2}
        error="Connector missing API key"
      />
    </div>
  );
}
