// The rich card face the composer renders when a card is selected on the object graph — the detail
// that used to live in the separate right-dock inspector, now folded into the top of the composer.
// It's computed once in ObjectGraphCanvas from the SAME helpers the card itself uses (tone, evidence,
// receipts, related, weakness) and threaded down inside the selection payload, so the composer never
// re-derives product truth — it just displays what the canvas already decided.

export type CardReceipt = {
  preview: string;
  // The provenance label (observed / researched / inferred / speculative / founder), or null when
  // unknown. Inferred/speculative render softer so a guess never reads as a grounded fact.
  kind: string | null;
  ref: string;
};

// One hop out from the selected card: the other card and the edge's verb. Clicking it re-targets the
// composer to that card (re-selects it on the canvas) without closing the panel.
export type CardRelated = { id: string; verb: string; name: string };

export type CardDetail = {
  id: string;
  statement: string;
  // The object's raw type (e.g. "value_prop"); the UI humanizes it to "value prop".
  type: string;
  // The maturity stage (loose / typed / execution / outcome), shown beside the type on the chip.
  maturity: string;
  // The card's honest STATE tone — semantic color only (amber = weakness needs review, green =
  // observed/worked, gray = an unproven draft, neutral = the grounded middle).
  tone: "amber" | "green" | "gray" | "neutral";
  evidenceLabel: string;
  receipts: CardReceipt[];
  related: CardRelated[];
  weakness: { statement: string; repair: string } | null;
};

// The canvas → composer selection payload. Carries the light identity every subject has (a node-graph
// step or an object-graph card) plus, for an object-graph card, the rich detail the composer renders as
// its card face. `detail` is absent/null for node-graph steps, which keep the lightweight header.
export type CanvasSubject = {
  id: string;
  label: string;
  kind: string;
  detail?: CardDetail | null;
};
