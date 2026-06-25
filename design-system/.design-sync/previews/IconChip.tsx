import { IconChip, MetaPill } from "@gtm-ide/design-system";

const Source = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);
const Spark = (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="m12 2 2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z" />
  </svg>
);
const Gate = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <rect x="4" y="11" width="16" height="9" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);
const Clock = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

const row = { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" } as const;

// The leading mark on cards/rows — tinted from a node-category or semantic tone.
export function ChipTones() {
  return (
    <div data-skin="glass" style={row}>
      <IconChip tone="source" icon={Source} />
      <IconChip tone="generate" icon={Spark} />
      <IconChip tone="gate" icon={Gate} />
      <IconChip tone="proven" icon={Source} />
      <IconChip tone="danger" icon={Gate} />
      {/* Escape hatch: any CSS color / var passes through */}
      <IconChip tone="var(--cat-measure)" icon={Source} />
    </div>
  );
}

// The quiet companion — durations, counts, and state tags.
export function Pills() {
  return (
    <div data-skin="glass" style={row}>
      <MetaPill icon={Clock} label="0:41" />
      <MetaPill label="128 accounts" />
      <MetaPill
        accent="proven"
        icon={
          <span
            style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--proven)", display: "inline-block" }}
          />
        }
        label="Published"
      />
      <MetaPill accent="gap" label="Attribution gap" />
    </div>
  );
}

// Chip + pill together as a card footer composition.
export function CardFooter() {
  return (
    <div
      data-skin="glass"
      style={{ display: "flex", gap: 9, alignItems: "center" }}
    >
      <IconChip tone="enrich" icon={Source} />
      <MetaPill icon={Clock} label="Last run 2m ago" />
      <MetaPill accent="agent" label="agent:gtm-enrich" />
    </div>
  );
}
