import { useState } from "react";
import { Check, Search, ShieldCheck, Unplug } from "lucide-react";
import { removeCredential, saveCredential, type FounderCredential } from "@/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ExaConnection({
  credential,
  readOnly,
  onCredentials,
  onChanged,
}: {
  credential?: FounderCredential;
  readOnly: boolean;
  onCredentials: (credentials: FounderCredential[]) => void;
  onChanged?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!token.trim() || busy || readOnly) return;
    setBusy(true);
    setError(null);
    try {
      const result = await saveCredential("exa", token.trim(), "Exa");
      onCredentials(result.credentials);
      setToken("");
      setOpen(false);
      onChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Exa could not be connected.");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (busy || readOnly) return;
    setBusy(true);
    setError(null);
    try {
      const result = await removeCredential("exa");
      onCredentials(result.credentials);
      onChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Exa could not be disconnected.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="firm-settings-connection">
      <span className="firm-settings-connection-icon" aria-hidden="true"><Search /></span>
      <div>
        <div className="firm-settings-connection-title">
          <strong>Exa</strong>
          <span className="firm-settings-connection-status" data-connected={credential ? "true" : "false"}>
            {credential ? <Check aria-hidden="true" /> : <Unplug aria-hidden="true" />}
            {credential ? "Connected" : "Not connected"}
          </span>
        </div>
        <p>Search and read attributable public web evidence. Exa never receives outward authority.</p>
        <ul aria-label="Exa capabilities">
          <li><Check aria-hidden="true" /> Search public sources</li>
          <li><ShieldCheck aria-hidden="true" /> Read only</li>
        </ul>
        {open ? (
          <div className="firm-settings-connect-form" role="group" aria-label={credential ? "Replace Exa API key" : "Connect Exa"}>
            <label>
              <span>Exa API key</span>
              <Input aria-label="Exa API key" type="password" autoComplete="new-password" disabled={busy || readOnly} value={token} onChange={(event) => setToken(event.target.value)} />
            </label>
            <small>The key is stored with operating-system encryption and is never shown to an agent.</small>
            <span>
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="button" size="sm" disabled={busy || readOnly || !token.trim()} onClick={() => void save()}>{busy ? "Saving…" : "Save Exa key"}</Button>
            </span>
          </div>
        ) : (
          <div className="firm-settings-connection-actions">
            <small>{credential ? "Available to every venture" : "Optional research source"}</small>
            <span>
              <Button type="button" variant="outline" size="sm" disabled={readOnly} onClick={() => setOpen(true)}>{credential ? "Replace key" : "Connect Exa"}</Button>
              {credential ? <Button type="button" variant="ghost" size="sm" disabled={busy || readOnly} onClick={() => void disconnect()}>{busy ? "Disconnecting…" : "Disconnect"}</Button> : null}
            </span>
          </div>
        )}
        {error ? <span className="firm-settings-error" role="alert">{error}</span> : null}
      </div>
    </article>
  );
}
