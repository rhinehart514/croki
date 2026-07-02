// The one shared Evidence / provenance contract — used by BOTH sides of truth (the product
// scan and the market objects) and by every downstream record that rests on a claim. It exists
// so no claim anywhere in the engine can present as more solid than its sources actually support.
//
// The rule this contract enforces (GTM-ENGINE-REBUILD §2.3, "evidence discipline"):
//   A claim carries evidence or is structurally demoted to speculative. A claim with no
//   sourced evidence CANNOT present as grounded — the demotion happens in code, at the
//   normalize boundary, not by convention.
//
// Solidity is an OPEN ladder (§2.2). The four rungs below are the canonical vocabulary and give
// the ordering used for "no stronger than its evidence", but the field itself accepts any label —
// this is a scale, never a closed enum that rejects a value.

import { now } from "./store-fs.mjs";

// Canonical rungs, strongest first. `observed` = seen directly (a scan file:line, a real reply);
// `researched` = found in a cited external source; `inferred` = reasoned from other evidence;
// `speculative` = a guess with nothing under it. Index = rank (0 is most solid).
export const SOLIDITY_LADDER = ["observed", "researched", "inferred", "speculative"];
export const SPECULATIVE = "speculative";

// Rank of a solidity label. Unknown (open) labels sort as the weakest KNOWN rung so a novel
// label is honored but never treated as stronger than the canonical scale — it can only tie
// or lose to "speculative" ordering, never silently outrank "observed".
export function solidityRank(label) {
  const index = SOLIDITY_LADDER.indexOf(String(label ?? "").trim().toLowerCase());
  return index === -1 ? SOLIDITY_LADDER.length : index;
}

// Normalize one piece of evidence into the shared shape. The demotion rule applies at the piece
// level too: a citation with no source is speculative no matter what solidity was declared for it.
export function normalizeEvidence(input) {
  if (!input || typeof input !== "object") input = {};
  const claim = String(input.claim ?? "").trim() || null;
  const source = String(input.source ?? "").trim() || null;
  const notes = String(input.notes ?? "").trim() || null;
  const declared = String(input.solidity ?? "").trim().toLowerCase() || null;
  // With a source, honor the declared solidity (defaulting to researched); without one, speculative.
  const solidity = source ? (declared || "researched") : SPECULATIVE;
  return {
    claim,
    source,
    solidity,
    capturedAt: input.capturedAt || now(),
    notes,
  };
}

// Normalize and clean an evidence list. Empty stubs (no claim, no source, no notes) are dropped so
// a record never carries a placeholder that looks like support but says nothing.
export function normalizeEvidenceList(list) {
  if (!Array.isArray(list)) return [];
  return list.map(normalizeEvidence).filter((e) => e.claim || e.source || e.notes);
}

// True when at least one piece of evidence names a real source. This is the pivot the whole
// provenance rule turns on: sourced evidence is what lets a claim present as grounded.
export function hasSourcedEvidence(list) {
  return normalizeEvidenceList(list).some((e) => e.source);
}

// The effective solidity of a CLAIM given what it declared and the evidence under it. This is the
// structural demotion: with no sourced evidence the claim is speculative regardless of the label it
// was handed. With sourced evidence, the declared label is honored (open vocabulary); when none was
// declared, the strongest sourced piece sets it. A claim never presents stronger than its sources.
export function effectiveSolidity(declared, evidenceList) {
  const sourced = normalizeEvidenceList(evidenceList).filter((e) => e.source);
  if (sourced.length === 0) return SPECULATIVE;
  const label = String(declared ?? "").trim().toLowerCase();
  if (label) return label;
  return sourced.reduce(
    (best, e) => (solidityRank(e.solidity) < solidityRank(best) ? e.solidity : best),
    SPECULATIVE,
  );
}

// A claim is grounded when its effective solidity is anything other than speculative (and set).
export function isGrounded(solidity) {
  const label = String(solidity ?? "").trim().toLowerCase();
  return label !== "" && label !== SPECULATIVE;
}
