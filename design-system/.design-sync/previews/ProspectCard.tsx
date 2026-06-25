import { ProspectCard } from "@gtm-ide/design-system";

export function Default() {
  return (
    <div style={{ width: 320 }}>
      <ProspectCard
        name="Northwind Labs"
        score="92"
        scoreTone="proven"
        summary="Series A dev-tools company; added a competitor's SDK 6 days ago and is hiring its first GTM engineer."
        draftLabel="Opener draft"
        draft={
          "Saw Northwind shipped the new SDK last week — most teams hit attribution gaps right after. Worth a look?"
        }
      />
    </div>
  );
}

export function Scores() {
  return (
    <div style={{ display: "grid", gap: 10, width: 320 }}>
      <ProspectCard
        name="Northwind Labs"
        score="92"
        scoreTone="proven"
        summary="Strong ICP fit — recent raise plus a hiring signal."
      />
      <ProspectCard
        name="Acme Co"
        score="61"
        scoreTone="gap"
        summary="Partial fit; no recent buying signal."
      />
    </div>
  );
}
