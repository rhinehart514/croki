// outward-guard.mjs — the structural, host-owned, never-model-trusted classification stage_outward
// (work-loop-tools.mjs) uses to decide whether a teammate's staged effect must reach the founder's
// wall. Split into its own file by domain responsibility (classification vs. the tool that calls it)
// to keep both files under the firm build's ~300-line budget.
//
// SECURITY: classifyCapabilityEffects (capability-registry.mjs) was built for HOST-AUTHORED static
// capability definitions — it trusts effects.external/irreversible/financial verbatim because a host
// wrote them. stage_outward's `effect` is MODEL-SUPPLIED with no input schema; a call like
// stage_outward({ effect: { kind: "message", to: "x@y.com" } }) — declaring no effects.external at
// all — used to classify as read-only and skip the wall entirely, with no trace. Two founder gates
// (the wall itself, and consult-guard's taste requirement) fell in one unprivileged tool call.
//
// FIRST FIX (superseded): a field-name allowlist scanned one level deep, plain objects only. Red-teamed
// and beaten three ways — nesting past one level, an array of recipient objects, and a field name
// outside the closed list (phone/sms_to/slack_channel_id/target/recipient_list/post_url/address) all
// evaded it. A closed allowlist a red-teamer beats in minutes isn't a fix; it's the same bug respelled
// under a new key or a deeper path. This version closes the CLASS, not each field:
//   1. WHOLE-TREE SCAN: walks every object key and every array element to unbounded depth (capped by
//      node count, not depth, so a wide-but-shallow or deep-but-narrow payload are both covered without
//      a magic depth number to tune around). Arrays are walked exactly like objects — a batch of
//      recipient objects is no longer invisible to a check that only understood isPlainObject.
//   2. FIELD-NAME SIGNAL: still one signal among several, folded in the wider set the red-team found
//      (see OUTWARD_SIGNAL_FIELDS) — kept because a recognized field name is the cheapest, most direct
//      signal when it's present, not because it is trusted to be the ONLY signal.
//   3. VALUE-PATTERN SIGNAL (the class-closer): any STRING value anywhere in the tree that looks like an
//      email address, an http(s) URL, or a phone number FORCES the wall regardless of what key holds it.
//      This is what makes a NOVEL field name harmless: the content betrays an outward effect even when
//      the host has never seen that key before. stage_outward's whole job is staging an OUTWARD effect
//      — a genuinely local artifact (research notes, a summary, a list of findings) has no legitimate
//      reason to carry an email/URL/phone string in its own content, so this signal costs stage_artifact
//      (the local-staging tool) nothing and closes exactly the gap the field-name list structurally
//      cannot: a channel nobody has named yet.
//
// This remains a SAFETY SIGNAL that FORCES the wall, never a closed allowlist of what a teammate may
// stage: any shape is still stageable through stage_outward, it just cannot mark itself safe by
// omission or by choosing an unrecognized key. Default is DENY (park); the only skip is an effect that
// trips NONE of these signals anywhere in its whole tree AND was not classified FOUNDER_WALL by the
// pre-existing host-authored effects path either.
export const OUTWARD_SIGNAL_FIELDS = [
  "to", "recipients", "recipient", "cc", "bcc", "email",
  "channel", "url", "endpoint", "webhook", "webhook_url",
  "amount", "price", "charge",
  "deploy", "publish", "release",
  "phone", "sms", "sms_to", "slack_channel_id", "target", "recipient_list", "post_url", "address",
];

// Deliberately loose — these exist to CATCH an outward-shaped value, not to validate one. A false
// negative here (missing a real email/URL/phone) is the security risk; a false positive only means an
// extra effect parks at the wall for the founder to glance at and release, never a broken local stage
// (see work-loop-tools-security.test.mjs's FALSE-POSITIVE CHECK: plain prose findings never trip these).
const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const URL_PATTERN = /https?:\/\/[^\s]+/i;
const PHONE_PATTERN = /(?:\+?\d[\d\-. ]{7,}\d)/; // a run of 9+ digits with optional +/-/./space separators

// The node budget for the whole-tree walk — a sane cap against a pathological payload (a huge array, a
// cyclic structure) turning classification itself into a denial-of-service. Once exhausted, the walk
// stops scanning further nodes; anything already found still counts, and a payload this large staged
// through stage_outward is itself worth the founder's attention regardless (hostClassified/park still
// apply on top of whatever this scan found before the cap).
const MAX_SCAN_NODES = 2000;

// Checks the effect's WHOLE TREE (every object key, every array element, to unbounded depth up to the
// node cap) for a recognized outward-shaped FIELD NAME or a string VALUE matching an email/URL/phone
// pattern. Never reads effect.effects — that sub-object is model-claimed and exactly what this guard
// refuses to trust as proof of safety.
export function hasOutwardSignal(effect) {
  if (!effect || typeof effect !== "object") return false;
  const seen = new Set();
  let visited = 0;
  const stack = [effect];
  while (stack.length) {
    if (visited >= MAX_SCAN_NODES) break;
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    if (seen.has(node)) continue; // guards a cyclic structure from an infinite walk
    seen.add(node);
    visited += 1;

    const entries = Array.isArray(node) ? node.entries() : Object.entries(node);
    for (const [key, value] of entries) {
      if (!Array.isArray(node) && OUTWARD_SIGNAL_FIELDS.includes(String(key).toLowerCase())) return true;
      if (typeof value === "string" && (EMAIL_PATTERN.test(value) || URL_PATTERN.test(value) || PHONE_PATTERN.test(value))) {
        return true;
      }
      if (value && typeof value === "object") stack.push(value);
    }
  }
  return false;
}
