// Slack send connector — a THIRD real channel, proving the send menu isn't email-shaped.
//
// This is a deliberately-stubbed-but-real channel: it posts each founder-approved item to a Slack
// incoming webhook the founder connected (BYO webhook URL, stored provider "slack_webhook"). The delivery
// is a plain, correct webhook POST — a real outbound, not a mock. What makes it a "stub" is scope: Slack's
// richer surface (block kit, threads, per-channel routing) is not built; it sends the item's message text
// to whatever channel the webhook targets. The point is structural — a new channel drops in by REUSING the
// exact wall, attribution, and needs-connection contract Gmail and HTTP already hold, so a fourth channel
// is the same one-file move.
//
// THE WALL, UNCHANGED. A message leaves ONLY for items the gate stamped `approved === true`, read FROM THE
// ITEM (never node.config, never the run context — the two surfaces composition and a run can reach). With
// no approved item, nothing posts. Composition cannot forge an approval onto a config/context field.
//
// NO CONNECTION → HONEST BLOCKED. If no Slack webhook is connected, the connector CANNOT send, and it says
// so: the shared `needs_connection` blocked result (ok:false, blocked:true), never a silent stage that
// reads like success and never a faked post. The approved items are carried through intact.
//
// ATTRIBUTION. Every posted item carries its gtmActionId so Measure can join the post back to an outcome; a
// non-attributable item is refused, never posted. Failures are recorded as failures, never swallowed.

import { resolveCredentialToken } from "../../credential-store.mjs";
import { needsConnectionResult, heldWithoutReleaseResult } from "./channels.mjs";
import { hasOutwardRelease } from "../../graph.mjs";

export const meta = {
  id: "slack",
  name: "Slack send",
  category: "execute",
  description:
    "Posts founder-approved items to a connected Slack incoming webhook. Real outbound, gated and attributed. Stubbed scope: plain message text, no block kit or threads yet.",
  envKey: "GTM_IDE_SLACK_WEBHOOK",
  stub: true,
  allowed: ["send"],
  blocked: ["send_without_approval", "send_from_composition", "send_from_run"],
  approvalRequired: ["continue_from_gate"],
};

// Resolve the founder-connected Slack incoming-webhook URL the same BYO way the other channels resolve:
// a stored "slack_webhook" credential for this project wins over the GTM_IDE_SLACK_WEBHOOK env fallback.
// The URL is not a secret in the token sense, but it flows through the same credential store the founder
// connects through — never invented here. Returns null when nothing is connected.
function resolveSlackWebhook(node, context) {
  const projectId = context?.__run?.projectId ?? context?.projectId ?? node?.config?.projectId ?? null;
  const credOptions = context?.credentialOptions ?? context?.credentials?.options ?? {};
  const stored = resolveCredentialToken(projectId, "slack_webhook", { envKey: "GTM_IDE_SLACK_WEBHOOK", ...credOptions });
  return typeof stored === "string" && stored.trim() ? stored.trim() : null;
}

export async function run(node, upstream, context = {}) {
  const config = node?.config ?? {};

  // THE WALL — only gate-approved items are considered; everything else is dropped here, unposted.
  const approved = (upstream ?? []).filter((item) => item.approved === true);
  if (approved.length === 0) {
    return { ok: true, items: [], meta: { sent: 0, note: "No founder-approved items to send." } };
  }

  // RAIL 1 — the executor-level outward wall (EXPERIMENT-MACHINE-SPEC). Outward authority is a HOST-ISSUED
  // capability, not an item label. Even for an approved item, this connector refuses to POST to the webhook
  // unless the run carried the founder outward-release capability on this node's runtime. Greenlight and
  // every ordinary/ambient run never supply it, so a mis-classified approved item routed into Slack is HELD,
  // never posted — the structural backstop under the greenlight item classifier.
  if (!hasOutwardRelease(node)) {
    return heldWithoutReleaseResult({ channel: "slack", items: approved });
  }

  // The delivery seam, in order: an explicit node-config webhook, then a founder-connected webhook, then
  // the env fallback. The transport is an injectable fetch so a test drives it without the network.
  const webhook = config.webhook || resolveSlackWebhook(node, context);
  if (!webhook) {
    // No webhook connected → honest BLOCKED needs-connection, never a silent stage or a faked post.
    return needsConnectionResult({
      channel: "slack",
      reason: "needs_connection",
      message: "No Slack webhook connected — connect a Slack incoming webhook to post these approved items.",
      items: approved,
    });
  }

  const doFetch = typeof config.fetchImpl === "function"
    ? config.fetchImpl
    : (typeof context?.sendRunners?.slack === "function" ? context.sendRunners.slack : globalThis.fetch);
  if (typeof doFetch !== "function") {
    return needsConnectionResult({
      channel: "slack",
      reason: "needs_connection",
      message: "No Slack transport available to post — connect Slack to send these approved items.",
      items: approved,
    });
  }

  const results = [];
  for (const item of approved) {
    const gtmActionId = String(item.gtmActionId ?? "").trim();
    if (!gtmActionId) {
      results.push({
        ...item,
        channel: "slack",
        executionStatus: "failed",
        sentAt: null,
        error: "Approved item is missing gtmActionId; refusing a non-attributable Slack post.",
      });
      continue;
    }
    const sentAt = new Date().toISOString();
    const text = item.draft ?? item.message ?? item.body ?? item.draft_note ?? "";
    try {
      const response = await doFetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, gtmActionId }),
      });
      const ok = response?.ok ?? (response?.status >= 200 && response?.status < 300);
      results.push({
        ...item,
        gtmActionId,
        channel: "slack",
        executionStatus: ok ? "sent" : "failed",
        httpStatus: response?.status ?? null,
        sentAt,
        ...(ok ? {} : { error: `Slack webhook returned HTTP ${response?.status}.` }),
      });
    } catch (error) {
      results.push({
        ...item,
        gtmActionId,
        channel: "slack",
        executionStatus: "failed",
        httpStatus: null,
        sentAt,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const delivered = results.filter((i) => i.executionStatus === "sent").length;
  const failed = results.length - delivered;
  return {
    ok: failed === 0,
    items: results,
    meta: {
      sent: delivered,
      failed,
      channel: "slack",
      note: `${delivered} of ${results.length} approved item${results.length === 1 ? "" : "s"} posted to Slack.`,
    },
    ...(failed ? { error: `${failed} Slack post${failed === 1 ? "" : "s"} failed.` } : {}),
  };
}
