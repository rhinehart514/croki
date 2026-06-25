import { Textarea } from "@gtm-ide/design-system";

export function Default() {
  return (
    <div style={{ width: 320 }}>
      <Textarea
        rows={3}
        defaultValue="Seed-stage dev-tools companies that just raised, hiring their first GTM engineer."
        placeholder="Describe the ICP…"
      />
    </div>
  );
}

export function MonoPrompt() {
  return (
    <div style={{ width: 320 }}>
      <Textarea
        mono
        rows={4}
        defaultValue={"Draft a 2-line opener for {{account}}.\nGround it in {{signal}}. No fluff."}
      />
    </div>
  );
}
