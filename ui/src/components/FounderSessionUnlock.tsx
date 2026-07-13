import { useState } from "react";
import { unlockFounderSession } from "@/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import "@/styles/founder-session.css";

export function FounderSessionUnlock({ onUnlocked }: { onUnlocked: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await unlockFounderSession(code.trim());
      onUnlocked();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That code was not accepted.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="founder-session" aria-label="Unlock founder actions">
      <div>
        <strong>Unlock founder actions</strong>
        <span>The canvas stays readable. Enter the code printed by Drover to approve, publish, or change local files.</span>
      </div>
      <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <label><span className="sr-only">Founder action code</span><Input autoFocus value={code} onChange={(event) => setCode(event.target.value)} autoComplete="one-time-code" placeholder="Founder action code" /></label>
        <Button type="submit" disabled={busy || !code.trim()}>{busy ? "Checking…" : "Unlock"}</Button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
    </aside>
  );
}
