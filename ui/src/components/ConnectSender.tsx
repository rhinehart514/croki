import { useCallback, useEffect, useState } from "react";
import { Check, Info, KeyRound, Lock, Mail, ShieldCheck, Trash2 } from "lucide-react";
import { connectGmailOAuth, getCredentials, removeSender } from "@/api";
import type { SenderCredential } from "@/types";
import "@/styles/connect-sender.css";

// Connect a SENDER — the DURABLE Gmail connect. The founder registers their own Google "Desktop app"
// OAuth client once, pastes its client id + secret here, and clicks Connect. Drover opens Google's consent
// in their browser, catches the loopback callback, and banks a REFRESH token — so from then on every
// approved send mints its own fresh access token and the founder never re-pastes an expiring key.
//
// Connecting a sender never loosens the wall: every send still waits for the founder at the gate. The
// client secret goes straight to the server and never comes back — this surface only ever learns THAT
// Gmail is connected, never the secrets.
const GMAIL_PROVIDER = "gmail";

export function ConnectSender() {
  const [credentials, setCredentials] = useState<SenderCredential[]>([]);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { credentials } = await getCredentials();
      setCredentials(credentials);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  // Mount-time read of the connected senders — the same "subscribe to server state" shape ConnectCapability uses.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refresh(); }, [refresh]);

  const gmail = credentials.find((c) => c.provider === GMAIL_PROVIDER) ?? null;

  const connect = useCallback(async () => {
    const id = clientId.trim();
    const secret = clientSecret.trim();
    if (!id || !secret) { setError("Paste your Google OAuth client id and secret to connect Gmail."); return; }
    setBusy(true);
    setError(null);
    try {
      // Resolves only when the founder completes consent in the browser Google just opened.
      await connectGmailOAuth({ clientId: id, clientSecret: secret });
      setClientId("");
      setClientSecret("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [clientId, clientSecret, refresh]);

  const disconnect = useCallback(async () => {
    setError(null);
    try { await removeSender(GMAIL_PROVIDER); await refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  }, [refresh]);

  const durable = gmail?.authType === "oauth";

  return (
    <div className="cs">
      <div className="cs-eyebrow">Sender</div>
      <h1 className="cs-title">Connect your Gmail to send</h1>
      <p className="cs-sub">
        Approved messages go out through <b>your own Gmail</b>, not a middleman. You connect once and it
        keeps working — no token to re-paste every hour. Connecting a sender does not change the wall:
        every send still waits for you at the gate.
      </p>

      {gmail ? (
        <div className="cs-connected">
          <div className="cs-logo"><Mail /></div>
          <div className="cs-connected-body">
            <div className="cs-connected-name">
              Gmail connected
              <span className="cs-badge">
                {durable ? <><ShieldCheck /> Stays connected</> : <><Check /> Ready to send</>}
              </span>
            </div>
            <div className="cs-connected-meta">
              {durable
                ? <>Connected {new Date(gmail.savedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} — sends refresh their own key, so you never re-paste.</>
                : <>Connected {new Date(gmail.savedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</>}
            </div>
          </div>
          <button className="cs-btn danger sm" onClick={() => void disconnect()} type="button" title="Disconnect this sender">
            <Trash2 size={13} /> Disconnect
          </button>
        </div>
      ) : (
        <div className="cs-add">
          <div className="cs-steps">
            In Google Cloud, create an OAuth <b>Desktop app</b> client with the Gmail API enabled and the
            <code>gmail.send</code> scope, then paste its two values below. Drover opens Google to ask your
            permission, then remembers the connection.
          </div>
          <div className="cs-fields">
            <label className="cs-add-lead" htmlFor="cs-client-id">Client ID</label>
            <div className="cs-field">
              <KeyRound />
              <input
                id="cs-client-id"
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="xxxxxxxx.apps.googleusercontent.com"
                autoComplete="off"
                spellCheck={false}
                disabled={busy}
              />
            </div>
            <label className="cs-add-lead" htmlFor="cs-client-secret">Client secret</label>
            <div className="cs-field">
              <Lock />
              <input
                id="cs-client-secret"
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void connect(); }}
                placeholder="Paste your client secret"
                autoComplete="off"
                spellCheck={false}
                disabled={busy}
              />
            </div>
            <button
              className="cs-btn primary cs-connect"
              disabled={busy || !clientId.trim() || !clientSecret.trim()}
              onClick={() => void connect()}
              type="button"
            >
              {busy ? "Waiting for Google…" : "Connect Gmail"}
            </button>
          </div>
          <div className="cs-hint">
            <Info />
            <span>
              Drover asks only for permission to <b>send</b> as you — nothing to read your inbox. Your
              client id and secret are stored for this workspace only and never shown again.
            </span>
          </div>
        </div>
      )}

      {error && <div className="cs-error">{error}</div>}

      <div className="cs-foot">
        <Lock />
        <span>Your connection is stored locally, never logged, and never leaves for anything you did not approve.</span>
      </div>
    </div>
  );
}
