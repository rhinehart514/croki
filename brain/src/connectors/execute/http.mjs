// HTTP send connector — the world's edge.
//
// This is GTM IDE's first connector that actually leaves the machine. The
// default local connector stages approved actions and declares send/publish/
// deploy as blocked; this one declares `send` as an allowed verb, so the engine
// recognizes it as a real sender (engine.mjs `isRealSender`) and the Measure
// subsystem can finally treat an outbound action as an observable outcome.
//
// It is channel-agnostic: it POSTs each founder-approved item as JSON to a
// configured endpoint. Point it at an email relay (Resend / Postmark / your own
// webhook), a Slack/Discord webhook, or a CRM intake — anywhere that turns a
// payload into a real outbound. The destination is the founder's to set; the
// connector never invents one.
//
// Invariants:
//   - Only items the gate marked `approved === true` are sent. Nothing else.
//   - A real destination is required. It resolves from the node config, then a
//     founder-connected endpoint the founder pasted through the app, then the
//     GTM_IDE_SEND_ENDPOINT env var. With none of the three set the node refuses
//     to run rather than silently staging — honest, not a no-op.
//   - Every item carries an attribution id so the Measure node can join the send
//     back to an outcome. Failures are recorded as failures, never swallowed.

import { resolveCredentialToken } from "../../credential-store.mjs";
import { needsConnectionResult } from "./channels.mjs";

// Resolve the outbound auth header the BYO way: a founder-pasted credential for this project wins,
// the GTM_IDE_SEND_AUTH env var is the fallback (the engineer path still works). projectId + persistence
// options ride `context.credentials`, threaded by graph.mjs. This is KEY RESOLUTION ONLY — it changes
// nothing about send-gating: only items the gate stamped `approved === true` are ever sent. The secret
// is used as the Authorization header value, NEVER logged.
function resolveSendAuth(context) {
  const creds = context?.credentials ?? {};
  return resolveCredentialToken(creds.projectId ?? null, "http", { envKey: "GTM_IDE_SEND_AUTH", ...(creds.options ?? {}) });
}

// Resolve the outbound DESTINATION the same BYO way the auth token resolves: a founder who connected a
// transport through the app pasted the endpoint URL as an "http_endpoint" credential, and that stored
// value wins over the GTM_IDE_SEND_ENDPOINT env var. This is DESTINATION RESOLUTION ONLY — it removes the
// env-var hard requirement for a founder who connected a transport, and changes NOTHING about when a send
// happens: only items the gate stamped `approved === true` are ever sent, and only on the gate-resume run.
// (The endpoint is a URL, not a secret, so it is not treated as sensitive — but it still flows through the
// same credential store the founder connects through, never invented here.)
function resolveSendEndpoint(context) {
  const creds = context?.credentials ?? {};
  const stored = resolveCredentialToken(creds.projectId ?? null, "http_endpoint", { envKey: "GTM_IDE_SEND_ENDPOINT", ...(creds.options ?? {}) });
  return typeof stored === "string" && stored.trim() ? stored.trim() : null;
}

export const meta = {
  id: "http",
  name: "HTTP send",
  category: "execute",
  description: "Sends founder-approved items to a configured external endpoint. Real outbound, gated and attributed.",
  envKey: "GTM_IDE_SEND_ENDPOINT",
  stub: false,
  allowed: ["send"],
  blocked: ["send_without_approval"],
  approvalRequired: ["continue_from_gate"],
};

export async function run(node, upstream, context) {
  // Destination resolution, in order: an explicit node config, then the founder-connected endpoint the
  // founder pasted through the app, then the GTM_IDE_SEND_ENDPOINT env var (resolveSendEndpoint folds the
  // env var in as its own fallback). A founder who connected a transport no longer needs an env var.
  const endpoint = node.config.endpoint || resolveSendEndpoint(context);
  const approved = upstream.filter((item) => item.approved === true);
  if (!endpoint) {
    // No destination from any of the three sources — never send blind. This is the SAME honest
    // needs-connection contract Gmail uses: an explicit BLOCKED status the founder is prompted to clear by
    // connecting a transport, with the approved items carried through intact — never a silent no-op that
    // reads like success. With nothing approved either, it is a plain no-op (nothing to block on).
    if (approved.length === 0) {
      return { ok: true, items: [], meta: { sent: 0, failed: 0, note: "No approved items to send." } };
    }
    return needsConnectionResult({
      channel: node.config.channel || "http",
      reason: "needs_connection",
      message: "No send endpoint connected — connect a transport in the app (or set GTM_IDE_SEND_ENDPOINT) to send these approved items.",
      items: approved,
    });
  }

  if (approved.length === 0) {
    return { ok: true, items: [], meta: { sent: 0, failed: 0, endpoint, note: "No approved items to send." } };
  }

  const channel = node.config.channel || "http";
  const auth = resolveSendAuth(context);
  const baseHeaders = { "Content-Type": "application/json", ...(auth ? { Authorization: auth } : {}) };
  // The delivery seam, in order: an explicit node config fetch (a unit test drives it), then the live http
  // send runner the host injected on the gate-resume run (context.sendRunners.http — mirrors how gmail.mjs
  // reads context.sendRunners.gmail), then native global fetch. Whichever it is, it is invoked ONLY for
  // items already stamped approved === true above; this is HOW the send leaves, never WHETHER it may.
  const doFetch = node.config.fetchImpl
    || (typeof context?.sendRunners?.http === "function" ? context.sendRunners.http : null)
    || globalThis.fetch;

  const sent = [];
  for (const item of approved) {
    const gtmActionId = String(item.gtmActionId || "").trim();
    if (!gtmActionId) {
      sent.push({
        ...item,
        executionStatus: "failed",
        sentAt: null,
        error: "Approved action is missing gtmActionId; refusing a non-attributable send.",
      });
      continue;
    }
    const sentAt = new Date().toISOString();
    const payload = {
      to: item.email || item.to || null,
      subject: item.subject || node.config.subject || null,
      message: item.draft || item.message || item.body || null,
      channel,
      gtmActionId,
      name: item.name || null,
    };
    try {
      const response = await doFetch(endpoint, {
        method: "POST",
        headers: { ...baseHeaders, "Idempotency-Key": gtmActionId },
        body: JSON.stringify(payload),
      });
      const ok = response.ok ?? (response.status >= 200 && response.status < 300);
      let providerMessageId = null;
      try {
        const body = await response.json();
        providerMessageId = body?.id || body?.messageId || body?.message_id || null;
      } catch {
        // Non-JSON or empty body — the status is still a real outcome.
      }
      sent.push({
        ...item,
        gtmActionId,
        channel,
        executionStatus: ok ? "sent" : "failed",
        httpStatus: response.status ?? null,
        providerMessageId,
        sentAt,
        ...(ok ? {} : { error: `Endpoint returned HTTP ${response.status}.` }),
      });
    } catch (error) {
      sent.push({
        ...item,
        gtmActionId,
        channel,
        executionStatus: "failed",
        httpStatus: null,
        sentAt,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const delivered = sent.filter((item) => item.executionStatus === "sent").length;
  const failed = sent.length - delivered;
  return {
    ok: failed === 0,
    items: sent,
    meta: {
      sent: delivered,
      failed,
      endpoint,
      note: `${delivered} of ${sent.length} approved item${sent.length === 1 ? "" : "s"} sent to ${endpoint}.`,
    },
    ...(failed ? { error: `${failed} send${failed === 1 ? "" : "s"} failed.` } : {}),
  };
}
