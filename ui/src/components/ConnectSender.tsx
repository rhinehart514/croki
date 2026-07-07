import { useCallback, useEffect, useState } from "react";
import { Check, Info, KeyRound, Lock, Mail, Trash2 } from "lucide-react";
import { connectSender, getCredentials, removeSender } from "@/api";
import type { SenderCredential } from "@/types";
import "@/styles/connect-sender.css";

// Connect a SENDER — the one-field BYO step that turns the staged Gmail leg into a real send.
//
// The founder pastes ONE thing: a Gmail send credential (an OAuth token for the gmail.send scope). It
// is stored per project and used ONLY when the founder approves a send at the gate — connecting a
// sender never loosens the wall, it just gives an already-approved send a key to leave with. The token
// never comes back to the browser: the server redacts on every read, so this surface only ever knows
// THAT a sender is connected, never its secret.
const GMAIL_PROVIDER = "gmail";

export function ConnectSender() {
  const [credentials, setCredentials] = useState<SenderCredential[]>([]);
  const [token, setToken] = useState("");
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
    const trimmed = token.trim();
    if (!trimmed) { setError("Paste your Gmail send credential to connect."); return; }
    setBusy(true);
    setError(null);
    try {
      await connectSender({ provider: GMAIL_PROVIDER, token: trimmed, label: "Gmail send" });
      setToken("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [token, refresh]);

  const disconnect = useCallback(async () => {
    setError(null);
    try { await removeSender(GMAIL_PROVIDER); await refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  }, [refresh]);

  return (
    <div className="cs">
      <div className="cs-eyebrow">Sender</div>
      <h1 className="cs-title">Connect your Gmail to send</h1>
      <p className="cs-sub">
        Approved messages go out through <b>your own Gmail</b>, not a middleman. Connecting a sender
        does not change the wall: every send still waits for you at the gate. This just gives an
        approved send a key to leave with.
      </p>

      {gmail ? (
        <div className="cs-connected">
          <div className="cs-logo"><Mail /></div>
          <div className="cs-connected-body">
            <div className="cs-connected-name">
              Gmail connected
              <span className="cs-badge"><Check /> Ready to send</span>
            </div>
            <div className="cs-connected-meta">
              Connected {new Date(gmail.savedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
            </div>
          </div>
          <button className="cs-btn danger sm" onClick={() => void disconnect()} type="button" title="Disconnect this sender">
            <Trash2 size={13} /> Disconnect
          </button>
        </div>
      ) : (
        <div className="cs-add">
          <label className="cs-add-lead" htmlFor="cs-token">Gmail send credential</label>
          <div className="cs-field">
            <KeyRound />
            <input
              id="cs-token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void connect(); }}
              placeholder="Paste your Gmail send token"
              autoComplete="off"
              spellCheck={false}
            />
            <button className="cs-btn primary" disabled={busy || !token.trim()} onClick={() => void connect()} type="button">
              {busy ? "Connecting…" : "Connect"}
            </button>
          </div>
          <div className="cs-hint">
            <Info />
            <span>
              A Gmail access token for the <code>gmail.send</code> scope. It is stored for this
              workspace only and never shown again. If sends start failing with a reconnect notice, the
              token has expired — paste a fresh one.
            </span>
          </div>
        </div>
      )}

      {error && <div className="cs-error">{error}</div>}

      <div className="cs-foot">
        <Lock />
        <span>Your credential is stored locally, never logged, and never leaves for anything you did not approve.</span>
      </div>
    </div>
  );
}
