import type {
  FirmArchitectureConnection,
  FirmArchitectureElement,
  FirmArchitectureEvidenceAnnotation,
  FirmArchitectureJoin,
  FirmArchitecturePressure,
  FirmTraceabilityGap,
} from "@/types";

// The epistemic truth grammar (Drover Law 11 / spec "Truth grammar"). ONE pure function derives which
// of eight epistemic states a canvas object is in, from the fields the projection already carries — zero
// backend work. The precedence is LAW: first match wins, top to bottom. A tentative interpretation must
// NEVER discharge a claim; absence is a visible claim (an object nothing establishes reads as Drover's
// read, never silently as established). This mirrors the brain law in venture-traceability.mjs — the UI
// consumes projection.traceability.gaps for Unsupported rather than re-deriving it, so a tentative
// connection WITH resolved evidence never wrongly reads unsupported.
//
// Colour is rationed and never load-bearing: the state carries a `channel` set (label / icon / node-shape
// / corner) so a greyscale screenshot distinguishes all eight without hue. See EpistemicToken.

export type EpistemicState =
  | "contested"
  | "stale"
  | "unsupported"
  | "historical"
  | "measured"
  | "repository-backed"
  | "founder-established"
  | "drovers-read";

// The four remaining pressure reasons are CONSEQUENCE pressure, not epistemic states: they drive the
// amber --gap treatment, never the token. Enumerated here so the table stays exhaustive over all nine.
export const CONSEQUENCE_PRESSURE = Object.freeze([
  "held-release",
  "blocked-work",
  "shared-system-contention",
  "missing-product-capability",
] as const);

// Precedence 1 (Contested): pressure that puts the object's own claim in dispute.
const CONTESTED_PRESSURE = new Set(["challenged-claim", "founder-assertion-conflict"]);
// Precedence 3 (Unsupported): pressure that says the claim has no return/evidence behind it.
const UNSUPPORTED_PRESSURE = new Set(["missing-evidence", "unattributed-return"]);

// The object under derivation. Any canvas card — an architecture element, a connection, a join/outcome —
// exposes some subset of these fields; every field is optional and absence is meaningful.
export type EpistemicSubject = {
  // Stable ref used to align pressure and traceability gaps to this object.
  ref?: string | null;
  provenance?: FirmArchitectureElement["provenance"];
  connection?: Pick<FirmArchitectureConnection, "assertion"> | null;
  // The join that carries basis/causal — the outcome join or a work join.
  join?: FirmArchitectureJoin | null;
  bounds?: FirmArchitectureElement["bounds"];
  live?: FirmArchitectureElement["live"];
  // True when this object survives only via omissions.historicalRevisions (folded in by the caller).
  survivesViaHistory?: boolean;
  // A relationship object with no basis/evidence at all is Unsupported ("Keep visual only" pairs).
  relationshipWithoutBasis?: boolean;
};

export type EpistemicContext = {
  // Every evidence annotation whose subjectRef resolves to this object.
  annotations?: FirmArchitectureEvidenceAnnotation[];
  // Every pressure entry targeting this object.
  pressure?: FirmArchitecturePressure[];
  // Every outcome join measuring this object (basis exact|contextual => Measured).
  outcomeJoins?: FirmArchitectureJoin[];
  // The brain's traceability gaps that name this object as unsupported (consumed, never re-derived).
  gaps?: FirmTraceabilityGap[];
  // Present when now is needed for bounds.endsAt comparison. Passed in (never read at call time) so the
  // function stays pure and the exhaustive test is deterministic.
  now?: number;
};

function text(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

// Basis normaliser over the three-way fallback already live in ArchitectureElement (basis ?? join.basis
// ?? join.level). The open union carries brain strings like "working-theory-anchor" / "work-ref" that are
// NOT Measured/Repository allowlist members — an unknown string falls through to no epistemic lift.
function joinBasis(join: FirmArchitectureJoin | null | undefined): string | null {
  if (!join) return null;
  return text(join.basis) ?? text(join.join?.basis) ?? text(join.join?.level) ?? null;
}

function annotationStances(annotations: FirmArchitectureEvidenceAnnotation[] | undefined) {
  const stances = new Set<string>();
  for (const annotation of annotations ?? []) {
    const stance = text(annotation.stance);
    if (stance) stances.add(stance);
  }
  return stances;
}

function annotationBases(annotations: FirmArchitectureEvidenceAnnotation[] | undefined) {
  const bases = new Set<string>();
  for (const annotation of annotations ?? []) {
    const basis = text(annotation.basis);
    if (basis) bases.add(basis);
  }
  return bases;
}

function pressureReasons(pressure: FirmArchitecturePressure[] | undefined) {
  const reasons = new Set<string>();
  for (const entry of pressure ?? []) {
    const reason = text(entry.reason);
    if (reason) reasons.add(reason);
  }
  return reasons;
}

// A relationship gap (unsupported-link) or an unsupported-claim gap targeting THIS object. Consuming the
// brain gap rather than re-deriving it is LAW: it keeps the UI table from contradicting the brain (a
// tentative link WITH resolved evidence is not a gap, so it must not read unsupported here).
function hasUnsupportedGap(ref: string | null, gaps: FirmTraceabilityGap[] | undefined): boolean {
  if (!ref || !gaps?.length) return false;
  return gaps.some((gap) => {
    if (gap.kind === "unsupported-claim") return gap.objectRef === ref;
    if (gap.kind === "unsupported-link") return gap.relationshipId === ref;
    return false;
  });
}

function boundsEndedInPast(bounds: EpistemicSubject["bounds"], now: number | undefined): boolean {
  const endsAt = text(bounds?.endsAt);
  if (!endsAt) return false;
  const ended = Date.parse(endsAt);
  if (Number.isNaN(ended)) return false;
  // Without a supplied clock we cannot claim "past" — fail toward NOT-historical (visibility of the live
  // read) rather than guessing. The caller supplies `now` when a comparison is wanted.
  if (typeof now !== "number") return false;
  return ended <= now;
}

// THE 8-STATE PRECEDENCE — first match wins.
export function deriveEpistemicState(
  subject: EpistemicSubject,
  context: EpistemicContext = {},
): EpistemicState {
  const ref = text(subject.ref);
  const stances = annotationStances(context.annotations);
  const bases = annotationBases(context.annotations);
  const reasons = pressureReasons(context.pressure);

  // 1 — CONTESTED. Conflicting pressure targets the object, OR annotations carry BOTH stances.
  if ([...reasons].some((reason) => CONTESTED_PRESSURE.has(reason))) return "contested";
  if (stances.has("supports") && stances.has("challenges")) return "contested";

  // 2 — STALE.
  if (reasons.has("stale-source")) return "stale";

  // 3 — UNSUPPORTED. missing-evidence / unattributed-return, a brain gap naming this object, or a
  // relationship with no basis at all (every founder "Keep visual only" pair). gap-beats-assertion:
  // this sits ABOVE Founder-established, matching the brain (a founder-asserted claim with no product
  // reach is still unsupported-claim).
  if ([...reasons].some((reason) => UNSUPPORTED_PRESSURE.has(reason))) return "unsupported";
  if (subject.relationshipWithoutBasis) return "unsupported";
  if (hasUnsupportedGap(ref, context.gaps)) return "unsupported";

  // 4 — HISTORICAL. Ended/past bounds, live ended, or survives only via historical revisions.
  if (boundsEndedInPast(subject.bounds, context.now)) return "historical";
  if (subject.live && subject.live.ended === true) return "historical";
  if (subject.survivesViaHistory === true) return "historical";

  // 5 — MEASURED. >=1 outcome join basis exact|contextual, OR a captured-join annotation (returned
  // reality outranks assertion).
  const measuredJoin = (context.outcomeJoins ?? []).some((join) => {
    const basis = joinBasis(join);
    return basis === "exact" || basis === "contextual";
  });
  if (measuredJoin || bases.has("captured-join")) return "measured";

  // 6 — REPOSITORY-BACKED. repository-grounded provenance, repository-citation annotation, or exact join.
  if (subject.provenance?.kind === "repository-grounded") return "repository-backed";
  if (bases.has("repository-citation")) return "repository-backed";
  if (joinBasis(subject.join) === "exact") return "repository-backed";

  // 7 — FOUNDER-ESTABLISHED. founder-authored / founder-asserted / founder-applied / founder-confirmed.
  if (subject.provenance?.kind === "founder-authored") return "founder-established";
  if (subject.connection?.assertion === "founder-asserted") return "founder-established";
  if (joinBasis(subject.join) === "founder-applied") return "founder-established";
  if (bases.has("founder-confirmed")) return "founder-established";

  // 8 — DROVER'S READ. The default, INCLUDING the provenance-absent case (an object nothing establishes
  // reads as Drover's read, NEVER silently as established): conversation-derived / teammate-proposed
  // provenance, inferred join, tentative connection, or no signal at all.
  return "drovers-read";
}
