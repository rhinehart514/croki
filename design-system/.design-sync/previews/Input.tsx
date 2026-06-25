import { Input } from "@gtm-ide/design-system";

export function Default() {
  return (
    <div style={{ width: 280 }}>
      <Input defaultValue="Activate self-serve signups" placeholder="Outcome name" />
    </div>
  );
}

export function Mono() {
  return (
    <div style={{ width: 280 }}>
      <Input mono defaultValue="brain/src/scan.mjs" placeholder="repo path" />
    </div>
  );
}

export function Disabled() {
  return (
    <div style={{ width: 280 }}>
      <Input disabled defaultValue="Locked while running" />
    </div>
  );
}
