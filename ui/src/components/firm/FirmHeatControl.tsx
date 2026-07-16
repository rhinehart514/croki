import { useEffect, useState } from "react";
import { getHeatSettings, setHeatSettings, type FirmHeatSettings } from "@/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function FirmHeatControl({ ventureId, readOnly = false, readOnlyReason = "Reconnecting before heat can change…" }: {
  ventureId: string;
  readOnly?: boolean;
  readOnlyReason?: string;
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

  if (!settings || !draft) return <span className="firm-always-on-loading">Opening always-on settings…</span>;
  const dirty = draft.heat !== settings.heat || draft.dailySpendUsd !== settings.dailySpendUsd;
  const enabled = draft.heat !== "off";
  const save = async () => {
    if (busy || readOnly || !dirty) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await setHeatSettings(ventureId, draft);
      setSettings(saved);
      setDraft(saved);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Always-on work could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="firm-always-on" aria-labelledby="always-on-title">
      <div className="firm-always-on-head">
        <span>
          <strong id="always-on-title">Always-on work</strong>
          <small>Let teammates revisit work already underway without another direction from you.</small>
        </span>
        <label className="firm-settings-switch">
          <input
            type="checkbox"
            checked={enabled}
            disabled={readOnly}
            onChange={(event) => setDraft({
              ...draft,
              heat: event.target.checked ? (settings.heat === "full" ? "full" : "steady") : "off",
            })}
          />
          <span aria-hidden="true" />
          <em>{enabled ? "On" : "Off"}</em>
        </label>
      </div>
      {enabled ? (
        <label>
          <span>Daily spend</span>
          <Input disabled={readOnly} type="number" min="0" step="0.01" value={draft.dailySpendUsd} onChange={(event) => setDraft({ ...draft, dailySpendUsd: Number(event.target.value) })} />
        </label>
      ) : (
        <p>Teammates only work when you direct them. Reply capture still checks connected accounts.</p>
      )}
      <div className="firm-always-on-actions">
        <small>{enabled ? `$${draft.dailySpendUsd.toFixed(2)} maximum per day` : "No unattended model work"}</small>
        {dirty ? <Button size="sm" disabled={busy || readOnly} onClick={() => void save()}>{busy ? "Saving…" : "Save setting"}</Button> : <span>Saved</span>}
      </div>
      {readOnly ? <span className="firm-settings-read-only" role="status">{readOnlyReason}</span> : null}
      {error ? <span className="firm-settings-error" role="alert">{error}</span> : null}
    </section>
  );
}
