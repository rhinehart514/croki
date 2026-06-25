import { Button } from "@gtm-ide/design-system";

const Play = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5v14l11-7z" />
  </svg>
);

export function Variants() {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <Button>Run channel</Button>
      <Button variant="secondary">Compose</Button>
      <Button variant="ghost">Cancel</Button>
      <Button variant="outline">Preview diff</Button>
    </div>
  );
}

export function Sizes() {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <Button size="sm">Approve</Button>
      <Button size="md">Approve gate</Button>
      <Button size="icon" aria-label="Run">
        <Play />
      </Button>
    </div>
  );
}

export function States() {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <Button>
        <Play />
        Deploy
      </Button>
      <Button disabled>Deploying…</Button>
    </div>
  );
}
