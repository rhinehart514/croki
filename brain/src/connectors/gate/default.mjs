// Gate node — venture doctrine: no send happens without founder approval.
// Execution pauses here. The graph runner returns pendingGates so the UI can
// surface the review queue. The founder approves/edits/rejects each item.
//
// The per-item decisions captured here are the loop's real learning signal:
// they are stamped onto items, recorded in the run ledger, and read back into
// the next run by memory.mjs. See brain/src/memory.mjs.
import { draftKey, itemReviewField, itemReviewText } from "../../memory.mjs";
import { applyPatternApproval } from "../../gate-pattern.mjs";
import crypto from "node:crypto";

// How long the plain-language translation may take before the gate gives up and falls back to the raw
// subject. Kept short: the founder is waiting on the gate, so a slow translate must never hold the run.
const GATE_TRANSLATE_TIMEOUT_MS = 8000;

// Build the ONLY thing the plain-language translation call is ever allowed to see about an item: its
// normalized framing. HARD SAFETY RULE, enforced structurally (not by comment alone): the translator
// must NEVER receive or be able to paraphrase the item's outbound BODY/draft. So this constructs the
// input by EXPLICITLY listing the allowed slots — subject, trigger, who, sourceUrl, and the NAMES of the
// fields the item carries (names only, never their values). The item is never spread, so a draft/body
// value cannot leak into the prompt even if a new content field is added to items later.
export function buildGateFraming(item) {
  if (!item || typeof item !== "object") {
    return { subject: null, trigger: null, who: null, sourceUrl: null, fields: [] };
  }
  const pick = (...keys) => {
    for (const key of keys) {
      const value = item[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return null;
  };
  return {
    subject: pick("subject", "suggested_subject_line"),
    trigger: pick("nowTrigger", "now_trigger"),
    who: pick("name", "founder_name", "company", "handle"),
    sourceUrl: pick("sourceUrl", "url", "linkedin", "linkedinUrl"),
    // Field NAMES only (e.g. "draft", "post_text", "scheduled_for") — never their values, so the
    // outbound body never travels to the model, only the shape of the item does.
    fields: Object.keys(item),
  };
}

// Batch-translate the framings of the items the founder will actually review. SAFETY: `translate` only
// ever receives buildGateFraming output (no body) plus the deterministic downstream descriptor — it
// cannot see or change what is sent. Any failure/timeout returns null so the caller silently falls back
// to the raw subject; this NEVER throws and NEVER blocks the run from reaching the gate.
async function translateGateFramings(framings, downstream, translate) {
  if (typeof translate !== "function" || !framings.length) return null;
  try {
    const timeout = new Promise((resolve) => setTimeout(() => resolve(null), GATE_TRANSLATE_TIMEOUT_MS));
    const out = await Promise.race([translate({ items: framings, downstream: downstream ?? null }), timeout]);
    return Array.isArray(out) ? out : null;
  } catch {
    return null;
  }
}

// Stamp each staged item with two founder-plain fields before the gate returns it. Only the items the
// founder actually REVIEWS (approvalStatus "pending") are translated — an auto-approved batch spends no
// model call. When no translator is wired (every unit test, any run the host didn't wire one), the items
// are returned untouched, so the gate's shape is byte-identical to before. When a translator IS wired
// but fails or times out, both fields land as null (silent fallback to the raw subject) — never a throw.
// SAFETY: this only ever adds the two bookkeeping fields; it never reads or mutates the item's body, so
// the reviewable/sendable content is provably unchanged by translation.
async function finalizeGate({ items, pendingReview, meta }, context) {
  const translate = context?.__gateTranslate;
  const base = { ok: true, items, pendingReview, meta };
  if (typeof translate !== "function") return base;
  const pendingIndexes = [];
  for (let i = 0; i < items.length; i += 1) {
    if (items[i]?.approvalStatus === "pending") pendingIndexes.push(i);
  }
  if (!pendingIndexes.length) return base;
  const framings = pendingIndexes.map((i) => buildGateFraming(items[i]));
  const translations = await translateGateFramings(framings, context.__gateDownstream, translate);
  const stamped = items.slice();
  pendingIndexes.forEach((itemIndex, k) => {
    const t = Array.isArray(translations) ? translations[k] : null;
    const title = firstString(t?.plainLanguageTitle, t?.title);
    const does = firstString(t?.whatYourYesDoes, t?.does);
    stamped[itemIndex] = {
      ...stamped[itemIndex],
      plainLanguageTitle: title ? title.slice(0, 80) : null,
      whatYourYesDoes: does ?? null,
    };
  });
  return { ok: true, items: stamped, pendingReview, meta };
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export const meta = {
  id: "default",
  name: "Founder review",
  category: "gate",
  // keep legacy field for backward compat
  type: "gate",
  description: "Pauses execution for founder approval. Items can be edited inline before approval.",
  envKey: null,
  approvalRequired: ["continue"],
};

function actionId(node, item, index, context) {
  if (item.gtmActionId) return item.gtmActionId;
  const originRunId = context?.__run?.originRunId || "untracked-run";
  const identity = draftKey(item) || item.draft || item.message || String(index);
  const digest = crypto
    .createHash("sha256")
    .update(`${originRunId}:${node.id}:${identity}`)
    .digest("hex")
    .slice(0, 24);
  return `gtm-${digest}`;
}

export async function run(node, upstream, context) {
  if (upstream.length === 0) {
    return {
      ok: true,
      items: [],
      pendingReview: false,
      meta: { awaitingReview: 0, note: "No items require review." },
    };
  }
  // Pattern + exception gating (E4.1/E4.2): auto-approve the clean items and hold ONLY the exceptions
  // (low confidence, flagged, no body) for individual review. This is how the wall survives 500 sends
  // without becoming a stamp. There are two sources of a pattern decision, in priority order:
  //   1. node.runtime.pattern — an explicit per-run founder pattern decision (the founder read a
  //      sample and blessed THIS run's batch).
  //   2. The channel's STANDING autonomy pattern — a channel the founder promoted up the ladder
  //      ("trusted"/"autonomous") carries a blessed pattern on its gate config (stamped by
  //      project-store's promoteChannel). That promotion is itself an explicit, revocable founder
  //      approval, applied as a standing rule, so auto-apply it here.
  // A draft channel has neither and falls through to today's per-item hold-everything path below.
  const runtimePattern = node.runtime?.pattern;
  const autonomy = node.config?.autonomy ?? null;
  const blessed = node.config?.blessedPattern;
  // The away / unattended hold (EXPERIMENT-MACHINE-SPEC rail 1): "nothing outward runs when the founder
  // is away." A STANDING autonomy pattern is the one path where an OUTWARD item can be approved with no
  // live human in the loop — a promoted channel auto-applying its blessed pattern. When the founder is
  // away AND approving here could reach the world, that unattended auto-apply is suppressed: the batch
  // falls through to per-item pending and HOLDS, queued for the founder's return. This ADDS conservatism
  // only — it can never turn a hold into a send. A live per-run pattern the founder just stamped
  // (runtimePattern) is a human act and is NOT held; only the standing, unattended auto-apply is.
  //
  // FAIL CLOSED (the fix): "could reach the world" is `possiblyOutward`, which is true for any known
  // sender AND any UNRECOGNIZED / unknown-willSend downstream executor, across EVERY branch — not just the
  // first, and not only a proven willSend===true. So an unknown executor, a Slack node, or a fan-out where
  // any branch is outward is HELD while away. Only a downstream that is PROVEN internal on every branch
  // (local/artifact, possiblyOutward === false) is left to auto-approve. Presence itself defaults to AWAY
  // when unresolved (host-side), so an ambiguous presence + an ambiguous executor both fail closed.
  // Presence is host-supplied runtime state, never composition.
  const founderAway = context?.__founderPresent === false;
  // Three states, distinguished so the hold fails CLOSED on the unknown but does not freeze a gate with
  // genuinely nothing downstream:
  //   - key ABSENT (undefined): the host did not resolve what's downstream → UNKNOWN → possibly-outward.
  //   - value NULL: gateDownstreamAction proved there is NO execute node downstream → nothing leaves → safe.
  //   - an object: `possiblyOutward` is authoritative (true for any sender OR any unrecognized executor,
  //     across every branch; false only when every branch is proven internal).
  const hasDownstreamKey = context ? "__gateDownstream" in context : false;
  const downstream = context?.__gateDownstream;
  let downstreamPossiblyOutward;
  if (!hasDownstreamKey) {
    downstreamPossiblyOutward = true; // unknown → fail closed
  } else if (downstream === null) {
    downstreamPossiblyOutward = false; // proven no execute downstream → nothing leaves
  } else {
    downstreamPossiblyOutward = downstream?.possiblyOutward !== false;
  }
  const holdOutwardWhileAway = founderAway && downstreamPossiblyOutward;
  const standingPattern =
    (autonomy === "trusted" || autonomy === "autonomous") && blessed && typeof blessed === "object" && !holdOutwardWhileAway
      ? blessed
      : null;
  const pattern =
    runtimePattern && typeof runtimePattern === "object"
    && (runtimePattern.decision === "approve" || runtimePattern.decision === "reject")
      ? runtimePattern
      : standingPattern;
  if (pattern && typeof pattern === "object" && (pattern.decision === "approve" || pattern.decision === "reject")) {
    const applied = applyPatternApproval(
      upstream,
      { decision: pattern.decision, confidenceThreshold: pattern.confidenceThreshold, perItemDecisions: node.runtime?.decisions ?? {} },
      (item, index) => draftKey(item) || actionId(node, item, index, context),
    );
    const items = applied.items.map((item, index) => ({
      ...item,
      gtmActionId: item.gtmActionId ?? actionId(node, item, index, context),
      gated: true,
    }));
    return finalizeGate({
      items,
      pendingReview: applied.pendingReview,
      meta: {
        mode: pattern === standingPattern ? "autonomy" : "pattern",
        autonomy,
        ...applied.counts,
        awaitingReview: applied.counts.pending,
      },
    }, context);
  }

  // Per-item founder decisions (approve / reject / edit) — the real learning
  // signal. Keyed by draftKey(item). Undecided items stay pending.
  const decisions = node.runtime?.decisions;
  if (decisions && typeof decisions === "object") {
    let pending = 0;
    const items = upstream.map((item, index) => {
      const gtmActionId = actionId(node, item, index, context);
      // Compiled-run review cards are keyed by the stable gtmActionId the UI rendered, while legacy
      // operator gates still key decisions by the item's natural identity (email, URL, name, and so on).
      // Prefer the explicit reviewed action id when present, then retain the legacy lookup as a fallback.
      // Without this dual lookup, an item carrying both an email and a compiled gtmActionId could be
      // approved in the browser under the latter but remain pending here under the former.
      const d = decisions[item?.gtmActionId] ?? decisions[draftKey(item)];
      if (!d || (d.decision !== "approve" && d.decision !== "reject")) {
        pending += 1;
        return { ...item, gtmActionId, gated: true, approved: false, approvalStatus: "pending" };
      }
      if (d.decision === "reject") {
        return { ...item, gtmActionId, gated: true, approved: false, approvalStatus: "rejected" };
      }
      const edited = typeof d.editedDraft === "string" && d.editedDraft.trim();
      // The original reviewable content may live under ANY field (draft, draft_note, post_text, …) —
      // composition is free-form. Capture whatever it actually was as the "before" (so the edit banks
      // as a before/after pair in taste memory even on non-outreach shapes), write the founder's
      // rewrite back onto that SAME field (so a downstream executor reading the item's own shape
      // sends the founder's words, never the pre-edit text), and keep draft/draft_note in sync for
      // legacy readers.
      let editPatch = {};
      if (edited) {
        const sourceField = itemReviewField(item);
        editPatch = {
          editedFrom: itemReviewText(item) || null,
          draft: d.editedDraft,
          draft_note: d.editedDraft,
          ...(sourceField && sourceField !== "draft" && sourceField !== "draft_note"
            ? { [sourceField]: d.editedDraft }
            : {}),
        };
      }
      return {
        ...item,
        gtmActionId,
        gated: true,
        approved: true,
        approvalStatus: "approved",
        ...editPatch,
      };
    });
    return finalizeGate({
      items,
      pendingReview: pending > 0,
      meta: {
        approved: items.filter((i) => i.approvalStatus === "approved").length,
        rejected: items.filter((i) => i.approvalStatus === "rejected").length,
        awaitingReview: pending,
      },
    }, context);
  }

  if (node.runtime?.approved) {
    return finalizeGate({
      items: upstream.map((item, index) => ({
        ...item,
        gtmActionId: actionId(node, item, index, context),
        gated: true,
        approved: true,
        approvalStatus: "approved",
      })),
      pendingReview: false,
      meta: { approved: upstream.length },
    }, context);
  }
  // support both old (stage, upstream) and new (node, upstream) call signatures
  const items = upstream.map((item, index) => ({
    ...item,
    gtmActionId: actionId(node, item, index, context),
    gated: true,
    approved: false,
    approvalStatus: "pending",
  }));
  return finalizeGate({
    items,
    pendingReview: true,
    meta: { awaitingReview: items.length },
  }, context);
}
