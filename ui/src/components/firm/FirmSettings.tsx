import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Check, Database, Mail, Settings2, ShieldCheck, Unplug, X } from "lucide-react";
import {
  connectGmail,
  getCredentials,
  removeCredential,
  type FirmVenture,
  type FounderCredential,
} from "@/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FirmHeatControl } from "./FirmHeatControl";
import "@/styles/firm-settings.css";

function ConnectionStatus({ connected, children }: { connected: boolean; children: ReactNode }) {
  return (
    <span className="firm-settings-connection-status" data-connected={connected ? "true" : "false"}>
      {connected ? <Check aria-hidden="true" /> : <Unplug aria-hidden="true" />}
      {children}
    </span>
  );
}

export function FirmSettings({
  venture,
  readOnly = false,
  readOnlyReason = "Reconnecting before settings can change…",
  onCapabilitiesChanged,
  onClose,
}: {
  venture: FirmVenture;
  readOnly?: boolean;
  readOnlyReason?: string;
  onCapabilitiesChanged?: () => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const [credentials, setCredentials] = useState<FounderCredential[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gmail = credentials.find((credential) => credential.provider === "gmail");

  useEffect(() => {
    panelRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  useEffect(() => {
    let live = true;
    getCredentials()
      .then((result) => { if (live) setCredentials(result.credentials); })
      .catch((cause) => { if (live) setError(cause instanceof Error ? cause.message : String(cause)); })
      .finally(() => { if (live) setLoaded(true); });
    return () => { live = false; };
  }, []);

  const connect = async () => {
    if (busy || readOnly || !clientId.trim() || !clientSecret.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await connectGmail(clientId.trim(), clientSecret.trim());
      setCredentials(result.credentials);
      setClientId("");
      setClientSecret("");
      setConnectOpen(false);
      onCapabilitiesChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gmail could not be connected.");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (busy || readOnly) return;
    setBusy(true);
    setError(null);
    try {
      const result = await removeCredential("gmail");
      setCredentials(result.credentials);
      setDisconnectOpen(false);
      onCapabilitiesChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gmail could not be disconnected.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="firm-settings-layer">
      <button type="button" className="firm-settings-backdrop" aria-label="Close venture settings" onClick={onClose} />
      <aside
        ref={panelRef}
        className="firm-settings-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="firm-settings-title"
        tabIndex={-1}
      >
        <header className="firm-settings-head">
          <span className="firm-settings-head-icon" aria-hidden="true"><Settings2 /></span>
          <span>
            <small>{venture.name}</small>
            <h2 id="firm-settings-title">Venture settings</h2>
          </span>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Close venture settings" onClick={onClose}>
            <X aria-hidden="true" />
          </Button>
        </header>

        <div className="firm-settings-scroll">
          <section className="firm-settings-section" aria-labelledby="crew-capabilities-title">
            <header>
              <span>
                <small>Teammate capabilities</small>
                <h3 id="crew-capabilities-title">Real sources and actions</h3>
              </span>
              <p>Connections determine what teammates can actually read or do. World-touching actions still wait for your hand.</p>
            </header>

            <article className="firm-settings-connection">
              <span className="firm-settings-connection-icon" aria-hidden="true"><Database /></span>
              <div>
                <div className="firm-settings-connection-title">
                  <strong>Product repository</strong>
                  <ConnectionStatus connected>Connected</ConnectionStatus>
                </div>
                <p>Read cited product truth and prepare isolated local changes.</p>
                <code>{venture.repository}</code>
                <ul aria-label="Product repository capabilities">
                  <li><Check aria-hidden="true" /> Read product truth</li>
                  <li><ShieldCheck aria-hidden="true" /> Apply changes only after your review</li>
                </ul>
              </div>
            </article>

            <article className="firm-settings-connection">
              <span className="firm-settings-connection-icon" aria-hidden="true"><Mail /></span>
              <div>
                <div className="firm-settings-connection-title">
                  <strong>Gmail</strong>
                  <ConnectionStatus connected={Boolean(gmail)}>
                    {gmail ? "Connected" : loaded ? "Not connected" : "Checking"}
                  </ConnectionStatus>
                </div>
                <p>Prepare email for your release, then bring replies back to the work that prompted them.</p>
                <ul aria-label="Gmail capabilities">
                  <li><Check aria-hidden="true" /> Read returned replies</li>
                  <li><ShieldCheck aria-hidden="true" /> Send only after your release</li>
                </ul>

                {gmail ? (
                  <div className="firm-settings-connection-actions">
                    <small>{gmail.label ?? "Gmail OAuth"} · available to every venture</small>
                    {disconnectOpen ? (
                      <span>
                        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setDisconnectOpen(false)}>Keep Gmail</Button>
                        <Button type="button" variant="destructive" size="sm" disabled={busy || readOnly} onClick={() => void disconnect()}>
                          {busy ? "Disconnecting…" : "Disconnect Gmail"}
                        </Button>
                      </span>
                    ) : (
                      <Button type="button" variant="ghost" size="sm" disabled={readOnly} onClick={() => setDisconnectOpen(true)}>Disconnect</Button>
                    )}
                  </div>
                ) : connectOpen ? (
                  <div className="firm-settings-connect-form" role="group" aria-label="Connect Gmail">
                    <label>
                      <span>Google OAuth client ID</span>
                      <Input autoComplete="off" disabled={busy || readOnly} value={clientId} onChange={(event) => setClientId(event.target.value)} />
                    </label>
                    <label>
                      <span>Google OAuth client secret</span>
                      <Input type="password" autoComplete="new-password" disabled={busy || readOnly} value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} />
                    </label>
                    <small>Drover opens Google consent and stores the resulting refresh token locally.</small>
                    <span>
                      <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setConnectOpen(false)}>Cancel</Button>
                      <Button type="button" size="sm" disabled={busy || readOnly || !clientId.trim() || !clientSecret.trim()} onClick={() => void connect()}>
                        {busy ? "Waiting for Google…" : "Continue to Google"}
                      </Button>
                    </span>
                  </div>
                ) : (
                  <Button type="button" variant="outline" size="sm" disabled={!loaded || readOnly} onClick={() => setConnectOpen(true)}>Connect Gmail</Button>
                )}
              </div>
            </article>
            {readOnly ? <span className="firm-settings-read-only" role="status">{readOnlyReason}</span> : null}
            {error ? <span className="firm-settings-error" role="alert">{error}</span> : null}
          </section>

          <section className="firm-settings-section" aria-labelledby="continuation-title">
            <header>
              <span>
                <small>Optional behavior</small>
                <h3 id="continuation-title">Between directions</h3>
              </span>
              <p>Keep this off if you want the venture to move only when you direct it.</p>
            </header>
            <FirmHeatControl ventureId={venture.id} readOnly={readOnly} readOnlyReason={readOnlyReason} />
          </section>
        </div>
      </aside>
    </div>
  );
}
