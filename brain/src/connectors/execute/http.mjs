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
//   - A real destination is required (GTM_IDE_SEND_ENDPOINT). With none set the
//     node refuses to run rather than silently staging — honest, not a no-op.
//   - Every item carries an attribution id so the Measure node can join the send
//     back to an outcome. Failures are recorded as failures, never swallowed.

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

export async function run(node, upstream) {
  const endpoint = node.config.endpoint || process.env.GTM_IDE_SEND_ENDPOINT;
  if (!endpoint) {
    // Should not happen — the runner gates on the env key — but never send blind.
    return { ok: false, items: [], error: "No send endpoint configured. Set GTM_IDE_SEND_ENDPOINT to a real destination." };
  }

  const approved = upstream.filter((item) => item.approved === true);
  if (approved.length === 0) {
    return { ok: true, items: [], meta: { sent: 0, failed: 0, endpoint, note: "No approved items to send." } };
  }

  const channel = node.config.channel || "http";
  const auth = process.env.GTM_IDE_SEND_AUTH;
  const baseHeaders = { "Content-Type": "application/json", ...(auth ? { Authorization: auth } : {}) };
  const doFetch = node.config.fetchImpl || globalThis.fetch;

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
