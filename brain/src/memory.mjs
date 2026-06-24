// Loop memory — reads the run ledger back into the next run.
//
// Reality constraint: before anything is sent, the only real outcome signal a
// GTM run produces is the founder's own gate decisions — what they approved,
// rejected, or edited. This module turns those recorded decisions into guidance
// for the next generation pass. No invented replies, no faked outcomes. The
// gate stops being a speed-bump and becomes the place the system learns taste.
//
// Connector-agnostic: it reads decisions off any gate node and shapes them into
// a memory object. Which connectors consume that memory is their choice.

// Stable per-item key for matching a founder's gate decision to the right draft across runs.
// The legacy contact fields (email/url/name/id) come first so existing flows key exactly as before;
// the founder_* and gtmActionId fallbacks cover agent-drafted items that carry none of those, which
// otherwise keyed to null and could never be matched. Mirrors itemKey() in ui/src/lib/itemKey.ts —
// keep the order identical in both.
export function draftKey(item) {
  return item?.email || item?.linkedinUrl || item?.url || item?.name || item?.id
    || item?.founder_github_or_url || item?.founder_name || item?.gtmActionId || null;
}

// Pull founder decisions out of recorded runs, newest first.
// A run's gate node stamps each reviewed item with approvalStatus
// ('approved' | 'rejected') and, for edits, editedFrom (the original draft)
// alongside the founder's rewritten draft.
export function extractDecisions(runs = [], { limit = 5 } = {}) {
  const approved = [];
  const rejected = [];
  const edits = [];
  const seen = new Set();

  for (let i = runs.length - 1; i >= 0; i--) {
    const nodes = runs[i]?.result?.nodes;
    if (!nodes) continue;
    for (const node of Object.values(nodes)) {
      if (node?.category !== "gate" || !Array.isArray(node.items)) continue;
      for (const item of node.items) {
        const status = item?.approvalStatus;
        if (status !== "approved" && status !== "rejected") continue;
        // The draft may be a plain string (legacy `draft`), an agent `draft_note`, or a STRUCTURED
        // object `{subject, body}` (the agent drafter's real shape). Coerce any of them to reviewable
        // text — an object draft was silently skipped, so every approval banked nothing and taste
        // stayed empty forever despite the gate working end to end.
        const rawDraft = item?.draft ?? item?.draft_note ?? item?.message ?? item?.body;
        const draft = typeof rawDraft === "string" ? rawDraft
          : (rawDraft && typeof rawDraft === "object")
            ? [rawDraft.subject, rawDraft.body ?? rawDraft.message ?? rawDraft.text]
                .filter((s) => typeof s === "string" && s.trim()).join("\n").trim()
            : null;
        if (!draft) continue;
        const personName = item?.name ?? item?.founder_name ?? null;

        const dedupKey = `${status}:${draftKey(item) ?? draft.slice(0, 40)}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);

        if (status === "approved") {
          if (approved.length < limit) approved.push({ name: personName, draft });
          if (typeof item.editedFrom === "string" && item.editedFrom && edits.length < limit) {
            edits.push({ from: item.editedFrom, to: draft });
          }
        } else if (rejected.length < limit) {
          rejected.push({ name: personName, draft });
        }
      }
    }
  }
  return { approved, rejected, edits };
}

// Shape decisions into a compact memory object the next run consumes.
// Returns null when there is nothing to learn from yet (the first run).
export function buildDraftMemory(decisions, { maxExamples = 3 } = {}) {
  if (!decisions) return null;
  const approved = (decisions.approved ?? []).slice(0, maxExamples).map((d) => d.draft);
  const rejected = (decisions.rejected ?? []).slice(0, maxExamples).map((d) => d.draft);
  const edits = (decisions.edits ?? []).slice(0, maxExamples);
  if (!approved.length && !rejected.length && !edits.length) return null;
  return { approved, rejected, edits };
}

// Render memory as a prompt block appended to draft instructions.
export function renderDraftMemory(memory) {
  if (!memory) return "";
  const parts = [];
  if (memory.approved?.length) {
    parts.push(
      "Messages the founder APPROVED before. Match this voice — same warmth, length, and directness:\n" +
        memory.approved.map((d, i) => `[approved ${i + 1}]\n${d}`).join("\n\n")
    );
  }
  if (memory.edits?.length) {
    parts.push(
      "Edits the founder made (before = your draft, after = their rewrite). Move toward the after:\n" +
        memory.edits.map((e, i) => `[edit ${i + 1}]\nbefore: ${e.from}\nafter: ${e.to}`).join("\n\n")
    );
  }
  if (memory.rejected?.length) {
    parts.push(
      "Messages the founder REJECTED before. Do not write anything like these:\n" +
        memory.rejected.map((d, i) => `[rejected ${i + 1}]\n${d}`).join("\n\n")
    );
  }
  if (!parts.length) return "";
  return "\n\n--- What the founder has taught you so far ---\n" + parts.join("\n\n");
}

// ── Taste profile (the compounding layer of the context substrate) ────────────
// The taste bank: gate decisions shaped into a base-layer context block for the assembler. It
// is the same approved/rejected/edits signal buildDraftMemory produces, plus counts that tell
// the next run HOW MUCH taste has been observed — a first run has none, so the block stays empty
// rather than faking confidence. Edits carry the strongest signal: they are the founder's own
// correction of the model, not just a verdict on it. Connector-agnostic, like the rest of memory.
export function buildTasteProfile(decisions, options = {}) {
  const memory = buildDraftMemory(decisions, options);
  if (!memory) return null;
  return {
    ...memory,
    counts: {
      approved: memory.approved.length,
      rejected: memory.rejected.length,
      edits: memory.edits.length,
    },
  };
}

// Render the taste profile as a base-layer block. Reuses the proven draft-memory rendering so
// the live voice guidance and the assembled context never drift apart; strips the leading blank
// lines so it nests cleanly under the assembler's [taste] header.
export function renderTasteProfile(profile) {
  if (!profile) return "";
  return renderDraftMemory(profile).replace(/^\n+/, "");
}
