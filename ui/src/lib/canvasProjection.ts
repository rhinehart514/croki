// canvasProjection — the one tested seam between the backend's canonical canvas projection
// (operatingView.woven.canvas, from brain/src/woven-graph.mjs → projectCanvas) and what the canvas UI
// renders. The backend owns the shapes; this module adapts them, and every consumer (QuestionFocus,
// OutcomeReturn, the woven overlay) reads through here so the field names live in ONE place.
//
// Everything degrades honestly: given no canvas, or a canvas missing a section, the readers return empty
// arrays, never fabricated records.

import type {
  CanvasImplicationBody, CanvasPosition, CanvasQuestionBody, ClarityObject, JoinedOutcome,
  ProductImplication, TeammatePosition, WovenCanvas, WovenCanvasAnchor, WovenRef,
} from "@/types";

export function refId(ref: WovenRef | string | null | undefined): string {
  if (!ref) return "";
  if (typeof ref === "string") return ref;
  return ref.id ?? "";
}

function anchorsOfKind(canvas: WovenCanvas | null | undefined, ...kinds: string[]): WovenCanvasAnchor[] {
  if (!canvas?.anchors) return [];
  const set = new Set(kinds);
  return canvas.anchors.filter((a) => set.has(a.kind));
}

// ── Questions ────────────────────────────────────────────────────────────────────────────────────
// A backend "question" anchor carries the real question body (positions with participantRef/statement).
// We map it into a ClarityObject the existing QuestionFocus renders (ref/claim display shape), preserving
// every teammate position as its own branch — never blended.
export function normalizePosition(p: CanvasPosition): TeammatePosition {
  return {
    ref: refId(p.participantRef),
    claim: p.statement,
    uncertainty: p.uncertainty ?? null,
    recommendation: p.recommendation ?? null,
    falsifier: p.falsifier ?? null,
    evidenceRefs: (p.evidenceRefs ?? []).map(refId).filter(Boolean),
    // The backend carries no explicit disagreement list yet; disagreement is preserved structurally by
    // keeping every position as its own branch. Kept optional/forward-compatible.
    disagreesWith: [],
    provenance: null,
  };
}

// The normalized, render-ready question: a ClarityObject whose positions/evidence/unknowns/decisions are
// filled from the canonical body. Positions become teammate branches; unknowns aggregate from positions;
// evidence and decisions stay honestly empty when the backend body carries only refs (no typed bodies).
export function normalizeCanvasQuestion(body: CanvasQuestionBody): ClarityObject {
  const positions = (body.positions ?? []).map(normalizePosition);
  const unknowns: string[] = [];
  for (const p of body.positions ?? []) {
    const u = p.unknowns;
    if (Array.isArray(u)) unknowns.push(...u.filter(Boolean));
    else if (typeof u === "string" && u.trim()) unknowns.push(u.trim());
  }
  return {
    id: body.id,
    kind: "question",
    text: body.text,
    createdAt: body.createdAt ?? "",
    status: body.status,
    updatedAt: body.updatedAt,
    positions,
    // No typed evidence/decision bodies on the question anchor — only refs; render honest empties.
    evidence: [],
    unknowns: [...new Set(unknowns)],
    decisions: [],
    participantRefs: (body.relevantParticipantRefs ?? body.participantRefs ?? []).map(refId).filter(Boolean),
    productRefs: (body.productRefs ?? []).map(refId).filter(Boolean),
  };
}

export function canvasQuestions(canvas: WovenCanvas | null | undefined): ClarityObject[] {
  return anchorsOfKind(canvas, "question")
    .map((a) => (a.body && typeof a.body === "object" ? normalizeCanvasQuestion(a.body as CanvasQuestionBody) : null))
    .filter((q): q is ClarityObject => !!q);
}

// The ids of the questions that have a CANONICAL canvas anchor — those render from the woven canvas, so
// their raw clarity card is redundant and must not double-render.
export function canonicalQuestionIds(canvas: WovenCanvas | null | undefined): Set<string> {
  return new Set(canvasQuestions(canvas).map((q) => q.id));
}

// The clarity pins to render as raw cards: every non-question pin (unaffected), plus only those question
// pins that have NO canonical canvas anchor (fallback). This removes the duplicate where a pinned question
// showed both as a canonical anchor and as a separate raw clarity card.
export function clarityFallbackItems(
  clarityItems: ClarityObject[], canvas: WovenCanvas | null | undefined,
): ClarityObject[] {
  const canonical = canonicalQuestionIds(canvas);
  return clarityItems.filter((c) => c.kind !== "question" || !canonical.has(c.id));
}

// The focused-question id implied by a woven focus selection: set only when a CANONICAL question anchor is
// selected (its ref type is "question"), so clicking that anchor opens the QuestionFocus sidecar. Any other
// focus (object / lane / cluster / non-question anchor / cleared) yields null — the sidecar isn't forced.
export function questionIdFromFocus(
  focus: { kind: string; ref?: { type?: string | null; id: string } | null } | null | undefined,
): string | null {
  return focus && focus.kind === "anchor" && focus.ref?.type === "question" ? focus.ref.id : null;
}

// Resolve one focused question by id, preferring the canonical canvas projection and falling back to the
// raw clarity record. Returns null when neither has it (a stale focus collapses to product altitude).
export function resolveFocusedQuestion(
  questionId: string | null,
  canvas: WovenCanvas | null | undefined,
  clarityFallback: ClarityObject[],
): ClarityObject | null {
  if (!questionId) return null;
  const fromCanvas = canvasQuestions(canvas).find((q) => q.id === questionId);
  if (fromCanvas) return fromCanvas;
  return clarityFallback.find((c) => c.id === questionId && c.kind === "question") ?? null;
}

// ── Outcomes ─────────────────────────────────────────────────────────────────────────────────────
// A backend "outcome" anchor plus the canvas relationships that route it home. We build the JoinedOutcome
// the OutcomeReturn rail renders: what came back, and the pipeline / question / product / crew it returns
// toward — derived from real "returns-to" / "produced" / "resulted-in" / "contributed-to" edges.
const KIND_MAP: Array<[RegExp, JoinedOutcome["kind"]]> = [
  [/paid|revenue|deal|purchase|won/i, "business-outcome"],
  [/activat|signup|sign-up|onboard|install/i, "product-activation"],
  [/reply|repl|call|response|meeting|answer/i, "observed-response"],
  [/^sent$|published|released|delivered/i, "sent"],
];
function classifyOutcomeKind(outcomeKind: string, source?: string): JoinedOutcome["kind"] {
  const k = outcomeKind ?? "";
  if (/no.?reply|no.?response|ignored|bounce/i.test(k)) return "observed-response";
  for (const [re, kind] of KIND_MAP) if (re.test(k)) return kind;
  if (source && /founder/i.test(source)) return "founder-entered";
  return k.trim() ? "observed-response" : "unmeasured";
}
function humanizeOutcomeKind(k: string): string {
  return (k ?? "").replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim() || "Outcome";
}

type OutcomeBody = {
  id?: string; outcomeKind?: string; source?: string; value?: number | null; observedAt?: string | null;
  body?: string | null; status?: string | null;
  runId?: string | null; pathId?: string | null; channelId?: string | null; questionId?: string | null;
  productRefs?: WovenRef[]; participantRefs?: WovenRef[];
};

export function canvasOutcomes(canvas: WovenCanvas | null | undefined): JoinedOutcome[] {
  // Prefer the CANONICAL backend array — kind, channelId, and lineage are authoritative there and are
  // consumed verbatim (no re-derivation). Only fall back to reading anchor bodies when it is absent.
  if (Array.isArray(canvas?.outcomes)) {
    return canvas.outcomes.map((o) => ({
      id: o.id,
      kind: o.kind,
      label: o.label || humanizeOutcomeKind(o.outcomeKind ?? ""),
      // The inspectable account (pull-only): the response body, the honest status, the raw kind.
      body: o.body ?? null,
      status: o.status ?? null,
      outcomeKind: o.outcomeKind ?? null,
      value: o.value ?? null,
      observedAt: o.observedAt ?? null,
      channelId: o.channelId ?? null,
      questionId: o.questionId ?? null,
      productRefs: o.productRefs ?? [],
      crewRefs: o.crewRefs ?? [],
      runId: o.runId ?? null,
    } satisfies JoinedOutcome));
  }
  const anchors = anchorsOfKind(canvas, "outcome");
  const rels = canvas?.relationships ?? [];
  return anchors.map((a) => {
    const body = (a.body && typeof a.body === "object" ? a.body : {}) as OutcomeBody;
    const outcomeKind = body.outcomeKind ?? String(a.label ?? "");
    // Return edges: pipeline/path → outcome (the pipeline it returns to), outcome → question/product
    // (returns-to), teammate → outcome (contributed-to).
    let channelId = body.channelId ?? body.pathId ?? null;
    let questionId = body.questionId ?? null;
    const productRefs = (body.productRefs ?? []).map(refId).filter(Boolean);
    const crewRefs = (body.participantRefs ?? []).map(refId).filter(Boolean);
    for (const r of rels) {
      const srcIsThis = r.source.id === a.ref.id;
      const tgtIsThis = r.target.id === a.ref.id;
      if (tgtIsThis && (r.kind === "produced" || r.kind === "resulted-in")
        && (r.source.type === "pipeline" || r.source.type === "path")) channelId ??= r.source.id;
      if (srcIsThis && r.kind === "returns-to" && r.target.type === "question") questionId ??= r.target.id;
      if (srcIsThis && r.kind === "returns-to" && r.target.type !== "question" && !productRefs.includes(r.target.id)) productRefs.push(r.target.id);
      if (tgtIsThis && r.kind === "contributed-to" && r.source.type === "teammate" && !crewRefs.includes(r.source.id)) crewRefs.push(r.source.id);
    }
    return {
      id: body.id ?? a.ref.id,
      kind: classifyOutcomeKind(outcomeKind, body.source),
      label: humanizeOutcomeKind(outcomeKind),
      body: body.body ?? null,
      status: body.status ?? null,
      outcomeKind: body.outcomeKind ?? null,
      value: body.value ?? null,
      observedAt: body.observedAt ?? a.authority.updatedAt ?? null,
      channelId,
      questionId,
      productRefs,
      crewRefs,
      runId: body.runId ?? null,
    } satisfies JoinedOutcome;
  });
}

// ── Implications ─────────────────────────────────────────────────────────────────────────────────
// The canonical backend array (canvas.implications) is the source; anchor bodies are the fallback. We
// preserve the server-derived `review` descriptor, the raw `status`, and the proposal lineage for
// status/display/DEDUPE — but NEVER as executable client authority. The accept route derives the real
// graph target and operations server-side; the client never selects a graph or supplies operations.
export function canvasImplications(canvas: WovenCanvas | null | undefined): ProductImplication[] {
  if (Array.isArray(canvas?.implications)) {
    return canvas.implications.map((i) => ({
      id: i.id,
      text: i.text || i.body || "",
      sourceOutcomeId: i.sourceOutcomeId ?? null,
      productRefs: i.productRefs ?? [],
      questionId: i.questionId ?? null,
      disposition: i.disposition ?? (i.status === "staged" ? "accepted" : "proposed"),
      status: i.status,           // raw backend status, for dedupe/display
      review: i.review ?? null,   // server-derived review descriptor — display only, non-executable
    } satisfies ProductImplication));
  }
  return anchorsOfKind(canvas, "product-implication", "implication")
    .map((a) => {
      const b = (a.body && typeof a.body === "object" ? a.body : {}) as CanvasImplicationBody;
      return {
        id: b.id ?? a.ref.id,
        text: b.body ?? a.label,
        sourceOutcomeId: b.sourceOutcomeId ?? null,
        productRefs: (b.productRefs ?? []).map(refId).filter(Boolean),
        questionId: b.questionId ?? null,
        disposition: b.status === "staged" ? "accepted" : "proposed",
        status: b.status,
      } satisfies ProductImplication;
    });
}
