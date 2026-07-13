// The CHANNEL REGISTRY — the one extensible list of "how a founder-approved item actually leaves".
//
// WHY THIS EXISTS. Sending was hardwired to two paths (Gmail, HTTP) scattered across the execute
// connectors and the send-runner map. Adding a third channel meant touching several files and knowing
// the private shape of each. This registry collapses that: ONE entry per channel, declaring its execute
// connector, its live transport factory (the delivery seam the host injects), the credential providers it
// resolves through, and a plain-language "what to connect" line. New channels plug in HERE, once — the
// send menu is no longer email-shaped by construction.
//
// WHAT IT IS NOT. It is not a new host noun and not a cage. It does not gate, cap, or decide WHAT sends —
// the founder gate (item.approved) still owns that, unchanged, inside each connector. This layer only
// describes the transports; it never relaxes the wall. It also does not invent a closed channel enum for
// composition to satisfy: a graph still composes freely and an execute node names its connector; this
// registry is read by the send-runner assembly and by the "is this channel connected" check, not enforced
// as the only allowed set.
//
// THE NEEDS-CONNECTION CONTRACT. Every real sender shares one honest failure mode: the founder approved an
// item but no account/endpoint is connected, so it CANNOT actually send. That must surface as an explicit,
// machine-readable blocked status — NEVER a silent local stage that reads like success. The shared shape a
// connector returns for that case lives here (`needsConnectionResult`) so Gmail, HTTP, Slack, and any
// future channel report it identically and the engine/UI can render one "connect to send" prompt.

// The machine-readable status a real sender stamps when an approved item cannot leave because nothing is
// connected. It is BLOCKED (ok:false, blocked:true) — not a success, not a silent stage — so the engine
// treats it exactly like any other blocked node (a distinct not-green state) and the founder is prompted to
// connect rather than believing the send went out. `reason` distinguishes a never-connected account
// ("needs_connection") from a connection that went stale ("needs_reconnect"); both keep the approved items
// intact so the founder loses no work.
//
//   channel   — the channel id (e.g. "gmail"), so the UI knows WHICH connection to prompt for.
//   reason    — "needs_connection" (never connected / no endpoint) or "needs_reconnect" (grant expired).
//   message   — a plain-language line for the founder ("Connect Gmail to send these 3 approved items.").
//   items     — the approved items, carried through unsent, each stamped executionStatus so a per-item
//               view is honest too. Content is preserved; nothing is dropped.
export function needsConnectionResult({ channel, reason = "needs_connection", message, items = [] }) {
  const status = reason === "needs_reconnect" ? "needs_reconnect" : "needs_connection";
  return {
    ok: false,
    // blocked (not a genuine failure): the run reads this as "waiting on a connection", the same honest
    // not-green state as any other blocked node — never a swallowed success.
    blocked: true,
    blockedReason: status,
    needsConnection: true,
    ...(status === "needs_reconnect" ? { needsReconnect: true } : {}),
    channel,
    items: items.map((item) => ({
      ...item,
      channel,
      applied: false,
      executionStatus: status,
      needsConnection: true,
      ...(status === "needs_reconnect" ? { needsReconnect: true } : {}),
      stagedReason: message,
      sentAt: null,
    })),
    meta: {
      sent: 0,
      needsConnection: items.length,
      channel,
      blocked: status,
      note: message,
    },
    error: message,
  };
}

// The status an outward connector stamps when items ARE founder-approved (item.approved === true) but the
// run did NOT carry the host-issued outward-release capability (EXPERIMENT-MACHINE-SPEC rail 1). This is the
// executor-level backstop under the item classifier: greenlight (and every ordinary/ambient run) never
// supplies the capability, so even a mis-classified approved item routed into a real sender is HELD here,
// never sent. It is BLOCKED (ok:false, blocked:true) — an honest not-green state, never a fake "sent" and
// never a silent local stage — and the approved items are carried through intact so no work is lost. Only
// the founder outward-approval path (the compiled-run approve route / operator gate-resume) carries the
// capability, so this is the last structural gate before a byte leaves the machine.
export function heldWithoutReleaseResult({ channel, items = [] }) {
  const message =
    "Held: these items are approved but this run did not carry founder outward-release authority, so nothing was sent. " +
    "Approve them at the founder gate to release them.";
  return {
    ok: false,
    blocked: true,
    blockedReason: "needs_release",
    needsRelease: true,
    channel,
    items: items.map((item) => ({
      ...item,
      channel,
      applied: false,
      executionStatus: "held_without_release",
      needsRelease: true,
      stagedReason: message,
      sentAt: null,
    })),
    meta: { sent: 0, held: items.length, channel, blocked: "needs_release", note: message },
    error: message,
  };
}

// Every channel's descriptor. Adding a channel = adding one entry: its execute connector id, the live
// transport factory the send-runner map injects (createTransport, or null when the connector's own default
// fetch is the seam — like http), the credential providers it resolves through, and the founder-facing
// "connect this" line. `transportRunnerKey` names the slot on context.sendRunners the connector reads.
export const CHANNELS = {
  gmail: {
    id: "gmail",
    label: "Gmail",
    connector: "gmail",
    // The credential providers the connector tries, in order — so the "is it connected?" check knows
    // exactly what a founder would connect for this channel.
    credentialProviders: ["gmail", "google"],
    transportRunnerKey: "gmail",
    connectHint: "Connect your Gmail account to send from your own inbox.",
    stub: false,
  },
  http: {
    id: "http",
    label: "HTTP relay / webhook",
    connector: "http",
    // http resolves an endpoint URL (http_endpoint) plus an optional auth header (http).
    credentialProviders: ["http_endpoint"],
    transportRunnerKey: "http",
    connectHint: "Connect a relay endpoint (Resend, Postmark, a webhook, or a CRM intake) to send.",
    stub: false,
  },
  // ─── STUBBED CHANNEL: Slack ──────────────────────────────────────────────────────────────────────
  // Proof the menu is no longer email-shaped. Slack is a real, distinct channel path (an incoming
  // webhook the founder connects), wired through the SAME wall + needs-connection contract as Gmail. It
  // is deliberately marked stub: the delivery is a plain webhook POST (correct and real), but Slack's
  // richer surface — blocks, threads, channels — is not built yet. The point here is structural: a third
  // channel drops in with one entry and reuses every guarantee, so a fourth is the same one-line move.
  slack: {
    id: "slack",
    label: "Slack",
    connector: "slack",
    credentialProviders: ["slack_webhook"],
    transportRunnerKey: "slack",
    connectHint: "Connect a Slack incoming webhook URL to post approved items to a channel.",
    stub: true,
  },
};

// List channels for a menu — the send options a founder can choose, each with its connect hint and
// whether it is a stub. Read-only projection over CHANNELS; never enforced as a closed set on composition.
export function listChannels() {
  return Object.values(CHANNELS).map((c) => ({
    id: c.id,
    label: c.label,
    connector: c.connector,
    connectHint: c.connectHint,
    stub: c.stub === true,
  }));
}

export function getChannel(id) {
  return CHANNELS[id] ?? null;
}
