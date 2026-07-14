import { useEffect, useState } from "react";
import { getHeatSettings, setHeatSettings, type FirmHeatSettings } from "@/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function FirmHeatControl({ ventureId, requestFounderAction }: {
  ventureId: string;
  requestFounderAction: (run: () => Promise<void>) => Promise<void>;
}) {
  const [settings, setSettings] = useState<FirmHeatSettings | null>(null);
  const [draft, setDraft] = useState<FirmHeatSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getHeatSettings(ventureId).then((value) => {
      if (live) { setSettings(value); setDraft(value); }
    }).catch((cause) => { if (live) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { live = false; };
  }, [ventureId]);

  if (!settings || !draft) return <span className="firm-heat-loading">Heat…</span>;
  const dirty = draft.heat !== settings.heat || draft.dailySpendUsd !== settings.dailySpendUsd;
  const save = async () => {
    if (busy || !dirty) return;
    setBusy(true);
    setError(null);
    try {
      await requestFounderAction(async () => {
        const saved = await setHeatSettings(ventureId, draft);
        setSettings(saved);
        setDraft(saved);
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Heat could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="firm-heat-control">
      <label>
        <span>Heat</span>
        <select value={draft.heat} onChange={(event) => setDraft({ ...draft, heat: event.target.value as FirmHeatSettings["heat"] })}>
          <option value="off">Off</option>
          <option value="steady">Steady</option>
          <option value="full">Full</option>
        </select>
      </label>
      <label>
        <span>Daily spend</span>
        <Input type="number" min="0" step="0.01" value={draft.dailySpendUsd} onChange={(event) => setDraft({ ...draft, dailySpendUsd: Number(event.target.value) })} />
      </label>
      {dirty ? <Button size="sm" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Button> : null}
      {error ? <span className="firm-heat-error" role="alert">{error}</span> : null}
    </div>
  );
}
