import { MediaCard, Badge, MetaPill } from "@gtm-ide/design-system";

// A square founder avatar — the leading footer atom on a template card.
const Avatar = () => (
  <span
    style={{
      width: 24,
      height: 24,
      borderRadius: 6,
      display: "grid",
      placeItems: "center",
      background: "var(--st-ink)",
      color: "#fff",
      fontSize: 11,
      fontWeight: 700,
      flex: "0 0 auto",
    }}
  >
    JR
  </span>
);

const Clock = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

// A GTM template gallery — gradient cover thumbnails over a glass card.
export function TemplateGallery() {
  return (
    <div
      data-skin="glass"
      style={{
        display: "grid",
        gap: 16,
        gridTemplateColumns: "repeat(auto-fit,minmax(248px,1fr))",
      }}
    >
      <MediaCard
        cover="linear-gradient(135deg,#26262d,#0c0c0f)"
        coverContent={
          <div style={{ color: "#f4f4f5", fontSize: 16, fontWeight: 600, letterSpacing: "-0.02em" }}>
            Signal-driven outbound, grounded in your repo.
          </div>
        }
        title="GitHub Signal → Opener"
        meta="Edited 11 minutes ago"
        footer={
          <>
            <Avatar />
            <MetaPill icon={<Clock />} label="0:41" />
            <Badge tone="proven">Proven</Badge>
          </>
        }
      />

      <MediaCard
        cover="linear-gradient(135deg,#2282c4,#143b5e)"
        coverContent={
          <div style={{ color: "#f4f4f5", fontSize: 16, fontWeight: 600, letterSpacing: "-0.02em" }}>
            Enrich, score, and gate before a single send.
          </div>
        }
        title="ICP Fit Scoring Flow"
        meta="Edited 5 days ago"
        footer={
          <>
            <Avatar />
            <Badge tone="neutral">Template</Badge>
          </>
        }
      />
    </div>
  );
}

// A blank-cover starter card — footer atoms passed as children.
export function Starter() {
  return (
    <div data-skin="glass" style={{ width: 264 }}>
      <MediaCard
        cover="linear-gradient(135deg,#e9e8e3,#d6d5cf)"
        coverContent={<div style={{ color: "var(--st-muted)", fontSize: 13 }}>New flow</div>}
        title="Create a great flow"
        meta="Start from scratch"
      >
        <Avatar />
        <Badge tone="blind">Empty</Badge>
      </MediaCard>
    </div>
  );
}
