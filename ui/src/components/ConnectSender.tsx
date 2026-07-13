import { useCallback, useEffect, useState } from "react";
import { Check, Globe, Info, KeyRound, Lock, Mail, ShieldCheck, Trash2 } from "lucide-react";
import { connectGmailOAuth, connectSender, getCredentials, removeSender } from "@/api";
import type { SenderCredential } from "@/types";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
// The generic HTTP transport stores two founder-pasted credentials: the destination URL (never a
// secret — an "http_endpoint" credential) and, optionally, an auth header value (the sensitive "http"
// credential). The send connector resolves both from here, so no env var is ever needed.
const HTTP_ENDPOINT_PROVIDER = "http_endpoint";
const HTTP_AUTH_PROVIDER = "http";

export function ConnectSender() {
  const [credentials, setCredentials] = useState<SenderCredential[]>([]);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [endpointAuth, setEndpointAuth] = useState("");
  const [busy, setBusy] = useState(false);
  const [httpBusy, setHttpBusy] = useState(false);
  const [pendingDisconnect, setPendingDisconnect] = useState<"gmail" | "http" | null>(null);
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
  const httpEndpoint = credentials.find((c) => c.provider === HTTP_ENDPOINT_PROVIDER) ?? null;

  const connectHttp = useCallback(async () => {
    const url = endpoint.trim();
    if (!url) { setError("Paste the endpoint your approved sends should POST to."); return; }
    setHttpBusy(true);
    setError(null);
    try {
      // The URL is not a secret, so it stores as an "http_endpoint" credential; an optional auth header
      // value stores as the sensitive "http" credential. The connector reads both on the gate-resume run.
      await connectSender({ provider: HTTP_ENDPOINT_PROVIDER, token: url, label: "Send endpoint" });
      if (endpointAuth.trim()) {
        await connectSender({ provider: HTTP_AUTH_PROVIDER, token: endpointAuth.trim(), label: "Endpoint auth" });
      }
      setEndpoint("");
      setEndpointAuth("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setHttpBusy(false);
    }
  }, [endpoint, endpointAuth, refresh]);

  const disconnectHttp = useCallback(async () => {
    setError(null);
    try {
      await removeSender(HTTP_ENDPOINT_PROVIDER);
      await removeSender(HTTP_AUTH_PROVIDER).catch(() => {});
      await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  }, [refresh]);

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
      <h1 className="cs-title">Connect where approved work goes out</h1>
      <p className="cs-sub">
        Until you connect a way to send, approved work just stages on your machine. Connect <b>your own
        Gmail</b> to send email as you, or point Drover at <b>your own endpoint</b> — a relay, a webhook,
        a CRM intake. Either way, connecting a sender does not change the wall: every send still waits for
        you at the gate.
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
          <Button variant="outline" className="cs-btn danger sm" onClick={() => setPendingDisconnect("gmail")} type="button" title="Disconnect this sender">
            <Trash2 size={13} /> Disconnect
          </Button>
        </div>
      ) : (
        <div className="cs-add">
          <div className="cs-steps">
            In Google Cloud, create an OAuth <b>Desktop app</b> client with the Gmail API enabled and the{" "}
            <code>gmail.send</code> scope, then paste its two values below. Drover opens Google to ask your
            permission, then remembers the connection.
          </div>
          <div className="cs-fields">
            <label className="cs-add-lead" htmlFor="cs-client-id">Client ID</label>
            <div className="cs-field">
              <KeyRound />
              <Input
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
              <Input
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
            <Button
              className="cs-btn primary cs-connect"
              disabled={busy || !clientId.trim() || !clientSecret.trim()}
              onClick={() => void connect()}
              type="button"
            >
              {busy ? "Waiting for Google…" : "Connect Gmail"}
            </Button>
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

      {/* ── The generic endpoint transport — a second way to send, for anything that isn't Gmail ──── */}
      <div className="cs-divider" />
      <div className="cs-eyebrow" style={{ marginTop: 0 }}>Or a connected endpoint</div>
      <p className="cs-sub cs-sub-tight">
        Point approved sends at your own destination — an email relay, a Slack or Discord webhook, a CRM
        intake. Drover POSTs each approved item there. Nothing goes until you approve it at the gate.
      </p>

      {httpEndpoint ? (
        <div className="cs-connected">
          <div className="cs-logo"><Globe /></div>
          <div className="cs-connected-body">
            <div className="cs-connected-name">
              Endpoint connected
              <span className="cs-badge"><Check /> Ready to send</span>
            </div>
            <div className="cs-connected-meta">
              Approved items POST to your endpoint. Connected {new Date(httpEndpoint.savedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}.
            </div>
          </div>
          <Button variant="outline" className="cs-btn danger sm" onClick={() => setPendingDisconnect("http")} type="button" title="Disconnect this endpoint">
            <Trash2 size={13} /> Disconnect
          </Button>
        </div>
      ) : (
        <div className="cs-add">
          <div className="cs-fields">
            <label className="cs-add-lead" htmlFor="cs-endpoint">Endpoint URL</label>
            <div className="cs-field">
              <Globe />
              <Input
                id="cs-endpoint"
                type="url"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="https://your-relay.example.com/send"
                autoComplete="off"
                spellCheck={false}
                disabled={httpBusy}
              />
            </div>
            <label className="cs-add-lead" htmlFor="cs-endpoint-auth">Authorization header (optional)</label>
            <div className="cs-field">
              <KeyRound />
              <Input
                id="cs-endpoint-auth"
                type="password"
                value={endpointAuth}
                onChange={(e) => setEndpointAuth(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void connectHttp(); }}
                placeholder="e.g. Bearer sk-… (leave blank if your endpoint needs none)"
                autoComplete="off"
                spellCheck={false}
                disabled={httpBusy}
              />
            </div>
            <Button
              className="cs-btn primary cs-connect"
              disabled={httpBusy || !endpoint.trim()}
              onClick={() => void connectHttp()}
              type="button"
            >
              {httpBusy ? "Connecting…" : "Connect endpoint"}
            </Button>
          </div>
          <div className="cs-hint">
            <Info />
            <span>
              Each approved item POSTs as JSON. The endpoint is stored for this workspace; the auth value,
              if you set one, is kept like a secret and never shown again.
            </span>
          </div>
        </div>
      )}

      <AlertDialog open={pendingDisconnect !== null} onOpenChange={(nextOpen) => { if (!nextOpen) setPendingDisconnect(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {pendingDisconnect === "http" ? "this endpoint" : "Gmail"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Approved sends will no longer be able to use this connection until you connect it again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingDisconnect(null)}>Keep connected</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const target = pendingDisconnect;
                setPendingDisconnect(null);
                if (target === "http") void disconnectHttp();
                if (target === "gmail") void disconnect();
              }}
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {error && <div className="cs-error">{error}</div>}

      <div className="cs-foot">
        <Lock />
        <span>Your connection is stored locally, never logged, and never leaves for anything you did not approve.</span>
      </div>
    </div>
  );
}
