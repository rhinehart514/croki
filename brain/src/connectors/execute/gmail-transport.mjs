// The REAL Gmail transport — the send leg the gmail execute connector injects to actually deliver.
//
// gmail.mjs is the WALL and the guardrails (gate stamp, rate cap, provenance, recall); it is
// deliberately transport-agnostic and calls an injected `transport({ ...message, credentialToken })`
// that returns `{ ok, providerMessageId, recallHandle? }`. THIS module is that transport for Gmail:
// it turns an approved, provenance-stamped message into one real outbound through the founder's own
// Gmail account, and nothing else. It never reads the gate, never caps, never decides WHAT to send —
// gmail.mjs already did all of that before it ever calls here. It just delivers the one message handed
// to it, or reports honestly why it could not.
//
// AUTH — the founder's OWN Gmail, via the Gmail REST API with a Bearer OAuth token. `credentialToken`
// is the token gmail.mjs resolved from the founder's pasted credential (credential-store, provider
// "gmail"/"google") — an OAuth access token for `https://www.googleapis.com/auth/gmail.send`. We send
// with `users/me/messages/send`, so the message goes FROM the authenticated account: no From spoofing,
// no separate SMTP server, no app password living in plaintext, and — crucially — no third-party mail
// vendor in the path. Dependency-free: native `fetch`, native base64url. The token is used as a Bearer
// header and NOTHING else — never logged, never returned, never placed on a result.
//
// EXPIRY IS HONEST, NOT SILENT. A raw OAuth access token expires (~1h). When Google answers 401/403 we
// return `{ ok: false, error, needsReconnect: true }` so the founder sees "reconnect your sender",
// never a fake "sent". Durable auto-refresh (a refresh token minted by a loopback/device OAuth flow)
// needs a registered Google OAuth client id — a founder/app-registration decision, out of this file's
// scope. The moment such a flow exists, it feeds a fresh access token in through this SAME seam with no
// change here: this transport already speaks Bearer.

const GMAIL_SEND_ENDPOINT = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

// base64url without padding — the encoding Gmail's `raw` field requires (RFC 4648 §5).
function base64url(buffer) {
  return Buffer.from(buffer).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// A single header value must not smuggle in a second header via CR/LF (header injection). We fold any
// control char to a space so a provenance blob or a subject can never break out of its own line.
function sanitizeHeaderValue(value) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").trim();
}

// RFC 2047 encoded-word for a Subject that carries non-ASCII, so "Café ☕" survives the wire. ASCII
// subjects pass through untouched (the common path), so nothing here mangles a plain subject.
function encodeSubject(subject) {
  const raw = sanitizeHeaderValue(subject);
  if (!raw) return "";
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(raw)) return raw;
  return `=?UTF-8?B?${Buffer.from(raw, "utf8").toString("base64")}?=`;
}

// Assemble a minimal, correct RFC 2822 message: the addressing + Subject, every extra header gmail.mjs
// stamped (the X-GTM-IDE-Provenance marker lives here), then a UTF-8 plain-text body. This is the exact
// bytes that get base64url'd into `raw`. `from` is advisory — Gmail sends as the authenticated account
// regardless — but we include it when present so the composed sender identity is visible in the source.
function buildRawMessage({ to, from, subject, body, headers }) {
  const lines = [];
  if (from) lines.push(`From: ${sanitizeHeaderValue(from)}`);
  lines.push(`To: ${sanitizeHeaderValue(to)}`);
  lines.push(`Subject: ${encodeSubject(subject)}`);
  for (const [name, value] of Object.entries(headers ?? {})) {
    if (value == null) continue;
    lines.push(`${sanitizeHeaderValue(name)}: ${sanitizeHeaderValue(value)}`);
  }
  lines.push("MIME-Version: 1.0");
  lines.push('Content-Type: text/plain; charset="UTF-8"');
  lines.push("Content-Transfer-Encoding: base64");
  lines.push(""); // the blank line that separates headers from body
  // The body is base64 (per the Content-Transfer-Encoding above) so newlines/unicode survive intact.
  lines.push(Buffer.from(String(body ?? ""), "utf8").toString("base64"));
  return lines.join("\r\n");
}

// Extract a human-readable reason from Google's error envelope without ever echoing the token or the
// whole request. Falls back to the status line so a failure is never a bare "false".
function describeGmailError(status, payload) {
  const apiMessage = payload?.error?.message
    || (Array.isArray(payload?.error?.errors) ? payload.error.errors[0]?.message : null);
  if (apiMessage) return `Gmail API ${status}: ${apiMessage}`;
  return `Gmail API returned ${status}.`;
}

// Build the injectable Gmail transport. `fetchImpl` and `endpoint` are overridable so a unit test drives
// it against a mock without any network; default is native global fetch against the real Gmail endpoint.
export function createGmailTransport({ fetchImpl, endpoint = GMAIL_SEND_ENDPOINT } = {}) {
  const doFetch = typeof fetchImpl === "function" ? fetchImpl : (typeof fetch === "function" ? fetch : null);

  // The transport gmail.mjs calls per approved item. It MUST NOT throw for an expected condition
  // (missing recipient, expired token, API rejection) — it returns `{ ok:false, error }` so gmail.mjs
  // records an honest `failed` item and never a fake `sent`. It only sends the one message it is given.
  return async function gmailTransport({ to, from, subject, body, headers, credentialToken }) {
    if (!doFetch) {
      return { ok: false, error: "No fetch implementation available to reach the Gmail API." };
    }
    const token = typeof credentialToken === "string" ? credentialToken.trim() : "";
    if (!token) {
      // gmail.mjs already gates on a resolved credential; this is defense-in-depth, never a real path.
      return { ok: false, error: "No Gmail credential token was provided to the transport." };
    }
    const recipient = sanitizeHeaderValue(to);
    if (!recipient) {
      return { ok: false, error: "Approved item has no recipient email; refusing to send a message with no To." };
    }

    const raw = base64url(buildRawMessage({ to: recipient, from, subject, body, headers }));

    let response;
    try {
      response = await doFetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw }),
      });
    } catch (error) {
      // A network/transport error — honest failure, never a fake send. The token is not in the message.
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      // 401/403 almost always means the pasted token expired or lost the gmail.send scope — surface that
      // as a reconnect signal so the founder re-pastes a fresh credential rather than chasing a ghost.
      const needsReconnect = response.status === 401 || response.status === 403;
      return { ok: false, error: describeGmailError(response.status, payload), ...(needsReconnect ? { needsReconnect: true } : {}) };
    }

    // Success — Gmail returns the created message resource; `id` is the provider message id we hand back
    // for provenance/trace. Gmail offers no server-side unsend, so we return no recallHandle (null): the
    // connector records its honest recall WINDOW rather than a fake undo, exactly as its design expects.
    return { ok: true, providerMessageId: payload?.id ?? null };
  };
}

// The default live send-runner map the host injects into a run's context. gmail.mjs reads
// context.sendRunners.gmail; this is the one real runner wired today. A connector with no runner here
// stays staged-by-default — adding one is a deliberate act, never the fallback.
export function defaultSendRunners(options = {}) {
  return { gmail: createGmailTransport(options.gmail ?? {}) };
}
