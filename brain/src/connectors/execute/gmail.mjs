// Gmail send connector — a real outbound through the founder's OWN Gmail, and the WALL HOLDING.
//
// This is the BYO sender: it sends from the founder's own Gmail account, using a credential the
// founder pasted into the credential store (resolveCredentialToken — stored-first, env fallback),
// never a hardcoded key and never a key it logs. It sits in the execute family alongside `http`
// (a generic relay POST) and `deploy` (a microproduct ship); this one speaks Gmail specifically.
//
// THE NON-NEGOTIABLE INVARIANT — sending IS the wall: a message leaves ONLY after an explicit
// founder gate approval. The gate connector stamps `item.approved === true` on exactly the items a
// founder released, and this connector — exactly like `http`, `local`, `deploy` — sends ONLY those.
// It reads the approval FROM THE ITEM (the gate's run-time stamp), NEVER from node.config or the run
// context, the two surfaces composition and a model-driven run can reach. So a composed graph cannot
// forge an approval onto a config/context field and walk a send past the wall; an item carrying
// `approved === true` is, by construction, one a founder released through the gate. With no approved
// item, the connector sends nothing — there is no default, composition, or run path to a send.
//
// THREE GUARDRAILS, all real, on top of the gate stamp:
//   1. RATE LIMIT — a per-run cap (`config.rateLimit`, default DEFAULT_RATE_LIMIT) that REFUSES to
//      exceed N sends. The transport is invoked at most `budget` times; everything past the cap is
//      held `rate_limited`, never sent. A window budget already consumed (e.g. earlier in the same
//      hour) is honestly subtractable via `context.rateLimit.windowSent`.
//   2. PROVENANCE — every sent message carries a stamped provenance marker (run id, origin run, graph,
//      node, gtmActionId, sender, timestamp) in an `X-GTM-IDE-Provenance` header AND on the returned
//      item, so a send is always traceable back to the run + item that produced it. An item with no
//      `gtmActionId` is non-attributable and is REFUSED, never sent.
//   3. RECALL — every sent item carries a recall handle and a short undo window (`config.recallWindowMs`,
//      default DEFAULT_RECALL_WINDOW_MS), so a just-sent batch can be pulled. When the transport exposes
//      a live recall it is the injection point; absent one, the handle + window are recorded honestly so
//      the recall leg has a real seam to wire (the same posture as deploy's not-yet-wired live runner).
//
// THE TRANSPORT IS INJECTABLE. With BOTH a resolved credential AND a wired transport it sends; WITHOUT
// either it CANNOT send, and it says so HONESTLY: it returns an explicit BLOCKED `needs_connection` result
// (ok:false, blocked:true, per-item executionStatus "needs_connection"), NEVER a fake "sent" and — the fix
// here — never a silent `staged` no-op that reads like success. An approved item the founder released can
// no longer quietly disappear into a local stage: the run surfaces "connect Gmail to send these", the
// approved items are carried through intact, and the founder is prompted to connect. A stale/expired grant
// surfaces the sharper `needs_reconnect` variant.
//
// SECURITY: the resolved token is handed to the transport and NOTHING else — it is never logged, never
// placed on a returned item, never echoed in meta. The connector emits no console output.

import { resolveCredentialToken, getCredential } from "../../credential-store.mjs";
import { getFreshAccessToken } from "./gmail-oauth.mjs";
import { needsConnectionResult } from "./channels.mjs";

export const DEFAULT_RATE_LIMIT = 50;
export const DEFAULT_RECALL_WINDOW_MS = 30_000;

export const meta = {
  id: "gmail",
  name: "Gmail send",
  category: "execute",
  description:
    "Sends founder-approved items through the founder's own Gmail (BYO credential). It refuses to send anything the founder did not approve at the gate, caps sends per run, stamps provenance, and records a recall window. Nothing it sends can be triggered by composition or a run.",
  envKey: "GMAIL_OAUTH_TOKEN",
  stub: false,
  allowed: ["send"],
  blocked: ["send_without_approval", "send_from_composition", "send_from_run"],
  approvalRequired: ["continue_from_gate"],
};

// Resolve the founder's Gmail access token — the Bearer credential the transport delivers with. Three
// paths, in priority order, all landing on a fresh access token (or an honest reason there is none):
//   1. A banked OAUTH credential (the durable loopback flow): mint a fresh access token from the stored
//      refresh token, cached until ~1 min before expiry. A revoked/expired grant returns needsReconnect —
//      NEVER a fake send. This is the path that survives the ~1h access-token expiry.
//   2. A pasted access TOKEN (A3's original path) or the env fallback — used as-is; expires in ~1h and
//      surfaces its own reconnect signal from the transport on a 401. Unchanged behavior.
//   3. Nothing → { token: null }, an honest staged no-op upstream.
// Returns `{ token, needsReconnect?, reason? }`. Async because minting is a real (mocked-in-test) call.
// The projectId is read from the run context (host-supplied); persistence options (e.g. a test root) ride
// the shared context.credentials.options seam, with credentialOptions retained for direct-call compatibility.
// Never logs a token or a secret.
async function resolveGmailToken(node, context) {
  // Full injectable override (used by tests to supply a token without touching the store). Supports a
  // sync or async override so a test can hand back a token directly.
  if (typeof context?.resolveCredential === "function") {
    return { token: (await context.resolveCredential("gmail", node, context)) || null };
  }
  const projectId = context?.__run?.projectId ?? context?.projectId ?? node?.config?.projectId ?? null;
  // `runGraph` owns the shared credential context and carries persistence options under
  // `context.credentials.options` (the same shape Clay, HTTP, and Slack consume). Keep the direct
  // `credentialOptions` form as a compatibility seam for connector-level callers/tests, but prefer the
  // graph-owned shape so an isolated run can never fall through to another store root.
  const credOptions = context?.credentials?.options ?? context?.credentialOptions ?? {};

  // Path 1 — a durable OAuth credential (gmail first, then google), if one is banked for this project.
  const oauthCredential =
    getCredential(projectId, "gmail", credOptions) ??
    getCredential(projectId, "google", credOptions);
  if (oauthCredential?.authType === "oauth" && oauthCredential.refreshToken && oauthCredential.clientId && oauthCredential.clientSecret) {
    try {
      const token = await getFreshAccessToken({
        clientId: oauthCredential.clientId,
        clientSecret: oauthCredential.clientSecret,
        refreshToken: oauthCredential.refreshToken,
        // Test seam: a mock token endpoint / fetch can ride the run context without touching Google.
        fetchImpl: context?.oauthFetch,
        tokenEndpoint: context?.oauthTokenEndpoint,
      });
      if (token) return { token };
      return { token: null, needsReconnect: true, reason: "Gmail connection returned no access token — reconnect Gmail." };
    } catch (err) {
      if (err?.needsReconnect) return { token: null, needsReconnect: true, reason: err.message };
      // A transient mint failure (network, endpoint down) is NOT a reconnect — stage honestly and let the
      // founder retry, rather than telling them their durable connection is broken.
      return { token: null, reason: err instanceof Error ? err.message : String(err) };
    }
  }

  // Path 2 — a pasted access token or the conventional env fallback (A3's original behavior, unchanged).
  const token =
    resolveCredentialToken(projectId, "gmail", { envKey: "GMAIL_OAUTH_TOKEN", ...credOptions }) ||
    resolveCredentialToken(projectId, "google", { envKey: "GOOGLE_OAUTH_TOKEN", ...credOptions }) ||
    null;
  return { token };
}

// The provenance marker stamped on every send — the traceable tie from a delivered message back to the
// exact run + item that produced it. Built from the host-supplied run context, never composition.
function buildProvenance(node, item, context) {
  const run = context?.__run ?? {};
  return {
    marker: "gtm-ide",
    runId: run.runId ?? null,
    originRunId: run.originRunId ?? run.runId ?? null,
    graphId: run.graphId ?? null,
    nodeId: node?.id ?? null,
    gtmActionId: item.gtmActionId,
    sender: node?.config?.from ?? null,
    stampedAt: new Date().toISOString(),
  };
}

// The recall handle + undo window recorded for every send. If the transport returned a live recall
// token, it is carried here as the injection point a real recall would call; absent one the handle is
// still recorded honestly so the recall leg has a seam (deploy's not-yet-wired posture).
function buildRecall(item, sentAt, windowMs, transportRecall) {
  const expiresAt = new Date(new Date(sentAt).getTime() + windowMs).toISOString();
  return {
    handle: `recall-${item.gtmActionId}`,
    windowMs,
    recallableUntil: expiresAt,
    // Honest: a live recall token from the transport, or null when the transport offers no recall —
    // then the window is recorded and the transport stays the injection point, never a fake recall.
    transportRecall: transportRecall ?? null,
  };
}

// A recorded send is within its recall window iff now < recallableUntil. The host calls this (with a
// wired transport) to actually pull a just-sent message; absent a live transport recall it reports the
// window honestly rather than faking an undo. Exported so the recall leg can be driven and tested.
export function isRecallable(recall, at = Date.now()) {
  if (!recall?.recallableUntil) return false;
  return at < new Date(recall.recallableUntil).getTime();
}

export async function run(node, upstream, context = {}) {
  const config = node?.config ?? {};

  // THE WALL — read the approval FROM THE ITEM (the gate's run-time stamp), never config/context. Only
  // founder-approved items are even considered for a send; everything else is dropped here, unsent.
  const approved = upstream.filter((item) => item.approved === true);
  if (approved.length === 0) {
    return { ok: true, items: [], meta: { sent: 0, staged: 0, note: "No founder-approved items to send." } };
  }

  // Resolve the founder's credential and the wired transport. Either missing → the send CANNOT happen, and
  // we say so honestly: an explicit BLOCKED `needs_connection` result (never a silent `staged` no-op that
  // reads like success, never a faked send). The transport is NEVER called; the approved items are carried
  // through intact so the founder loses no work, and the run surfaces "connect Gmail to send these".
  // For a durable OAuth connection this is also where a fresh access token is minted from the banked refresh
  // token; a revoked grant returns needsReconnect so we surface the sharper `needs_reconnect` variant.
  const resolvedToken = await resolveGmailToken(node, context);
  const token = resolvedToken?.token ?? null;
  const transport = typeof config.transport === "function"
    ? config.transport
    : (typeof context?.sendRunners?.gmail === "function" ? context.sendRunners.gmail : null);
  if (!token || !transport) {
    // A stale/expired grant is a RECONNECT; anything else (never connected, no transport wired) is a
    // first-time CONNECT. Both are honest blocked states, distinguished for the founder-facing prompt.
    const reason = resolvedToken?.needsReconnect ? "needs_reconnect" : "needs_connection";
    const message = !token
      ? (resolvedToken?.reason
        || "No Gmail account connected — connect Gmail (or set GMAIL_OAUTH_TOKEN) to send these approved items.")
      : "No Gmail transport wired — connect Gmail to send these approved items.";
    return needsConnectionResult({ channel: "gmail", reason, message, items: approved });
  }

  // GUARDRAIL 1 — the per-run rate cap. Subtract any window budget already consumed; the transport is
  // invoked at most `budget` times and never exceeds N sends. Overflow is held, never sent.
  const cap = Number.isFinite(config.rateLimit)
    ? config.rateLimit
    : (Number.isFinite(config.rateLimit?.max) ? config.rateLimit.max : DEFAULT_RATE_LIMIT);
  const windowSent = Number.isFinite(context?.rateLimit?.windowSent) ? context.rateLimit.windowSent : 0;
  const budget = Math.max(0, cap - windowSent);
  const windowMs = Number.isFinite(config.recallWindowMs) ? config.recallWindowMs : DEFAULT_RECALL_WINDOW_MS;

  const results = [];
  let sentCount = 0;
  let rateLimited = 0;
  let failed = 0;

  for (const item of approved) {
    // Over the cap: held, never sent. The transport is not called for these.
    if (sentCount >= budget) {
      rateLimited += 1;
      results.push({
        ...item,
        channel: "gmail",
        applied: false,
        executionStatus: "rate_limited",
        stagedReason: `Per-run send cap of ${cap} reached; held to protect the founder's sending reputation.`,
        sentAt: null,
      });
      continue;
    }

    // GUARDRAIL 2 — provenance requires attribution. A non-attributable item is refused, never sent.
    const gtmActionId = String(item.gtmActionId ?? "").trim();
    if (!gtmActionId) {
      failed += 1;
      results.push({
        ...item,
        channel: "gmail",
        applied: false,
        executionStatus: "failed",
        sentAt: null,
        error: "Approved item is missing gtmActionId; refusing a non-attributable, un-recallable send.",
      });
      continue;
    }

    const sentAt = new Date().toISOString();
    const provenance = buildProvenance(node, { ...item, gtmActionId }, context);
    const message = {
      to: item.email ?? item.to ?? null,
      from: config.from ?? null,
      subject: item.subject ?? config.subject ?? null,
      body: item.draft ?? item.draft_note ?? item.message ?? item.body ?? null,
      headers: { "X-GTM-IDE-Provenance": JSON.stringify(provenance) },
      provenance,
    };

    try {
      // The token is handed to the transport and nothing else — never logged, never returned on an item.
      const outcome = await transport({ ...message, credentialToken: token, item });
      const ok = outcome?.ok === true;
      if (ok) {
        sentCount += 1;
        const recall = buildRecall({ ...item, gtmActionId }, sentAt, windowMs, outcome?.recallHandle ?? null);
        results.push({
          ...item,
          channel: "gmail",
          gtmActionId,
          applied: true,
          executionStatus: "sent",
          sentAt,
          providerMessageId: outcome?.providerMessageId ?? null,
          provenance,
          recall,
        });
      } else {
        failed += 1;
        results.push({
          ...item,
          channel: "gmail",
          gtmActionId,
          applied: false,
          executionStatus: "failed",
          sentAt,
          error: outcome?.error ?? "Gmail transport reported a failed send.",
        });
      }
    } catch (error) {
      failed += 1;
      results.push({
        ...item,
        channel: "gmail",
        gtmActionId,
        applied: false,
        executionStatus: "failed",
        sentAt,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    ok: failed === 0,
    items: results,
    meta: {
      sent: sentCount,
      failed,
      rateLimited,
      cap,
      note: `${sentCount} of ${approved.length} founder-approved item${approved.length === 1 ? "" : "s"} sent via Gmail${rateLimited ? `; ${rateLimited} held by the per-run cap` : ""}.`,
    },
    ...(failed ? { error: `${failed} Gmail send${failed === 1 ? "" : "s"} failed.` } : {}),
  };
}
