// consult-guard.mjs — required-consult enforcement for taste and design (E2.3).
//
// Pure, deterministic functions. No model calls, no I/O, no side effects.
// The rule: grounding through the moat is not optional when the agent is about to produce
// something the founder will see. A draft or outreach that bypasses the taste ledger loses
// the only thing that makes it non-generic — the founder's own accumulated signal.
//
// What this module does: given a list of tool-call names the agent made during a step and
// a description of what the step produced, it tells you whether the required moat tools
// were consulted before production started.
//
// What this module does NOT do (yet): capture the actual tool-call names from a live agent
// run. That wiring happens at the wall: when the run completes a node, the teammate runtime
// collects the observed tool calls from the step result and calls assertMoatConsulted before
// marking the wall ready. That follow-up is intentionally left to teammate-runtime.mjs /
// Firm drives enforce this rule before staged work reaches the wall.
//
// Rules:
//   - If the step produced a draft or outreach (producedDraft: true):
//       get_taste MUST appear in toolCalls.
//   - If the step produced a UI or visual artifact (producedVisual: true):
//       get_taste AND get_design MUST appear in toolCalls.
//   - Non-draft work (neither flag set): always ok — no moat requirement for lookup/research/plan work.
//
// Returns { ok: boolean, missing: string[], note: string }.

// Canonical tool names the moat uses — must match retrieval-tools.mjs.
export const MOAT_TOOLS = {
  TASTE: "get_taste",
  DESIGN: "get_design",
};

// Predicate: was a specific moat tool called?
export function wasConsulted(toolCalls, name) {
  if (!Array.isArray(toolCalls)) return false;
  return toolCalls.includes(name);
}

// Assert that the agent consulted the required moat tools before producing its output.
//
// Args:
//   toolCalls     — string[] — the retrieval tool names the agent called during this step.
//   producedDraft — boolean  — true if the step output is a draft, message, or outreach.
//   producedVisual — boolean — true if the step output is a UI component, design, or visual artifact.
//                              (Visual output implies draft-grade requirement too.)
//
// Returns { ok, missing, note }.
export function assertMoatConsulted({ toolCalls = [], producedDraft = false, producedVisual = false } = {}) {
  // Non-production work: research, enrichment, planning, discovery — no moat requirement.
  if (!producedDraft && !producedVisual) {
    return { ok: true, missing: [], note: "Non-draft work — no moat consult required." };
  }

  const missing = [];

  // Taste is always required when the step produces output the founder reviews.
  if (!wasConsulted(toolCalls, MOAT_TOOLS.TASTE)) {
    missing.push(MOAT_TOOLS.TASTE);
  }

  // Design is additionally required for visual/UI artifacts.
  if (producedVisual && !wasConsulted(toolCalls, MOAT_TOOLS.DESIGN)) {
    missing.push(MOAT_TOOLS.DESIGN);
  }

  if (missing.length === 0) {
    return {
      ok: true,
      missing: [],
      note: producedVisual
        ? "Moat consulted: taste + design both called before producing visual output."
        : "Moat consulted: taste called before producing draft.",
    };
  }

  const what = producedVisual ? "a visual artifact" : "a draft";
  return {
    ok: false,
    missing,
    note: `Step produced ${what} without consulting the moat. Missing: ${missing.join(", ")}. Call these tools before drafting so the output is grounded in the founder's own signal, not the generic mean.`,
  };
}
