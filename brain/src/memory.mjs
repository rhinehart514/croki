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

// ── Open item content (shared by memory, gate-pattern, eval) ──────────────────
// Composition is free-form: a step may stage an item under ANY field names (a post as
// { post_text, scheduled_for }, a page as { headline, sections }…). Taste learning and gate
// patterning must key off whatever fields the item actually has, or decisions on non-outreach
// shapes train nothing. These are NOT a content taxonomy — content stays open. The only closed
// list is the bookkeeping the host itself stamps onto items, which is never reviewable content.
const BOOKKEEPING_KEYS = new Set([
  "id", "gtmActionId", "type", "approvalStatus", "approved", "viaPattern", "isException",
  "reasons", "exception", "needsReview", "confidence", "editedFrom", "evidence_lines", "source",
  "score", "fit", "enriched", "gated", "sentAt", "channel",
]);

// Known draft aliases, preferred when present so legacy shapes read exactly as before.
const DRAFT_ALIASES = ["draft", "draft_note", "message", "body", "summary", "text", "content"];

// Known identity / evidence aliases — who an item is about, where it came from, why it fits. The
// gate surfaces these in their own named slots; they are not the item's sendable content, so the
// open fallback never mistakes a bare name or URL for a draft (a prospect-only item is reviewable
// at the gate but teaches no voice). UNKNOWN keys stay open and DO count as content.
const NON_CONTENT_KEYS = new Set([
  "name", "founder_name", "handle", "subject", "suggested_subject_line",
  "email", "linkedin", "linkedinUrl", "url", "sourceUrl", "founder_github_or_url",
  "role", "title", "company", "nowTrigger", "now_trigger",
  "grounding_citation", "icpFitRationale", "fitRationale", "fitReasons",
]);

// Coerce one field value to reviewable text: a string as-is, a STRUCTURED draft object
// ({subject, body}) joined — an object draft was once silently skipped, so every approval banked
// nothing and taste stayed empty forever despite the gate working end to end.
function asText(value) {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return [value.subject, value.body ?? value.message ?? value.text]
      .filter((s) => typeof s === "string" && s.trim()).join("\n").trim();
  }
  return "";
}

// The reviewable text of a staged item AND the field it came from, whatever the item's shape: the
// known draft aliases when present, otherwise the most substantial text the item's own fields carry.
// Both empty only when the item truly has no reviewable text of any shape.
function reviewSource(item) {
  if (!item || typeof item !== "object") return { field: null, text: "" };
  for (const key of DRAFT_ALIASES) {
    const text = asText(item[key]);
    if (text) return { field: key, text };
  }
  let best = { field: null, text: "" };
  for (const [key, value] of Object.entries(item)) {
    if (BOOKKEEPING_KEYS.has(key) || NON_CONTENT_KEYS.has(key)) continue;
    const text = asText(value);
    if (text.length > best.text.length) best = { field: key, text };
  }
  return best;
}

export function itemReviewText(item) {
  return reviewSource(item).text;
}

// The field name the reviewable text was read from (e.g. "draft", "post_text"), or null for an item
// with nothing reviewable. The gate connector writes a founder's inline rewrite back onto this same
// field, so a downstream executor reading the item's own shape sends the founder's words.
export function itemReviewField(item) {
  return reviewSource(item).field;
}

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
// `agentRef` (optional) filters to decisions on items a SPECIFIC agent produced — the per-agent
// slice the agent face reads. Items carry item.agentRef when an agent step stamped them (graph.mjs).
// Null/absent = every gate item, the prior behavior, so existing callers are unchanged.
export function extractDecisions(runs = [], { limit = 5, agentRef = null } = {}) {
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
        if (agentRef != null && item?.agentRef !== agentRef) continue;
        const status = item?.approvalStatus;
        if (status !== "approved" && status !== "rejected") continue;
        // Open content: the known draft aliases when present, else whatever reviewable text the
        // item's own fields carry — so a decision on a staged post, note, or page trains taste the
        // same as an outreach draft. Only an item with truly no reviewable text banks nothing.
        const draft = itemReviewText(item) || null;
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

// The per-agent slice of the taste ledger: the same extraction as extractDecisions, but only over
// items the named agent produced (item.agentRef === agentRef). This is what powers the agent face —
// "what has THIS agent learned from the founder." A blank agentRef returns an honest empty rather than
// falling back to every agent's decisions, so an unstamped/unknown agent never borrows another's taste.
export function extractDecisionsForAgent(runs = [], agentRef, options = {}) {
  if (!agentRef) return { approved: [], rejected: [], edits: [] };
  return extractDecisions(runs, { ...options, agentRef });
}

// How many distinct runs this agent produced a gate item in — derived purely from stamped items in the
// run ledger, never seeded. A run counts once if any of its gate nodes holds an item this agent
// produced, regardless of the founder's decision on it (a rejected draft is still a run the agent ran).
function runCountForAgent(runs = [], agentRef) {
  if (!agentRef) return 0;
  let count = 0;
  for (const run of runs) {
    const nodes = run?.result?.nodes;
    if (!nodes) continue;
    let produced = false;
    for (const node of Object.values(nodes)) {
      if (node?.category !== "gate" || !Array.isArray(node.items)) continue;
      if (node.items.some((item) => item?.agentRef === agentRef)) { produced = true; break; }
    }
    if (produced) count += 1;
  }
  return count;
}

// The agent's derived profile — the "how it learned" panel behind the agent face, computed entirely
// from real run state. Nothing is seeded: an agent with no runs reads honestly (hasRuns false, zero
// counts, empty edits, blank voice, a "no runs yet" note) rather than a fabricated 0-dressed-as-data.
// `editLimit` caps the before/after edits carried (the strongest learning signal); `voiceExamples`
// caps how many approved/rejected/edit examples the rendered current-voice summary shows.
export function buildAgentProfile(runs = [], agentRef, { editLimit = 5, voiceExamples = 3 } = {}) {
  const decisions = extractDecisionsForAgent(runs, agentRef, { limit: Infinity });
  const runCount = runCountForAgent(runs, agentRef);
  const counts = {
    approved: decisions.approved.length,
    rejected: decisions.rejected.length,
    edits: decisions.edits.length,
  };
  const hasRuns = runCount > 0 || counts.approved > 0 || counts.rejected > 0 || counts.edits > 0;
  const voice = hasRuns
    ? renderDraftMemory(buildDraftMemory(decisions, { maxExamples: voiceExamples })).replace(/^\n+/, "")
    : "";
  return {
    agentRef: agentRef ?? null,
    hasRuns,
    runCount,
    counts,
    // Newest-first; extractDecisions already orders runs newest → oldest.
    lastEdits: decisions.edits.slice(0, editLimit),
    voice,
    note: hasRuns ? null : "no runs yet",
  };
}

// Idea taste — the founder's kills/keeps on GENERATED ideas, read off the feedback ledger's
// IdeaKill/IdeaKeep signals and shaped into killed/kept ANGLES so the next ideation round avoids the
// angles the founder has already thrown out. This is the ideation half of loop memory: gate decisions
// teach voice (above), idea decisions teach which angles bite. Newest decisions win; an angle's count
// is how many times the founder has killed (or kept) from it. Connector-agnostic, like the rest.
export function extractIdeaTaste(signals = [], { limit = 5 } = {}) {
  const killedAngles = new Map();
  const keptAngles = new Map();
  const killedPitches = [];
  const keptPitches = [];
  for (let i = (signals?.length ?? 0) - 1; i >= 0; i--) {
    const s = signals[i];
    if (s?.type !== "IdeaKill" && s?.type !== "IdeaKeep") continue;
    const killed = s.type === "IdeaKill";
    const angle = typeof s.angle === "string" && s.angle.trim() ? s.angle.trim() : null;
    if (angle) {
      const bucket = killed ? killedAngles : keptAngles;
      bucket.set(angle, (bucket.get(angle) ?? 0) + 1);
    }
    const pitch = typeof s.summary === "string" ? s.summary.trim() : "";
    if (pitch) (killed ? killedPitches : keptPitches).push(pitch);
  }
  const rankAngles = (m) =>
    [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, limit)
      .map(([angle, count]) => ({ angle, count }));
  const taste = {
    killedAngles: rankAngles(killedAngles),
    keptAngles: rankAngles(keptAngles),
    killedPitches: killedPitches.slice(0, limit),
    keptPitches: keptPitches.slice(0, limit),
  };
  const empty = !taste.killedAngles.length && !taste.keptAngles.length
    && !taste.killedPitches.length && !taste.keptPitches.length;
  return empty ? null : taste;
}

// Trim idea taste down to the next run's budget, mirroring how approved/rejected/edits are sliced.
function shapeIdeaTaste(ideaTaste, maxExamples) {
  if (!ideaTaste) return null;
  const killedAngles = (ideaTaste.killedAngles ?? []).slice(0, maxExamples);
  const keptAngles = (ideaTaste.keptAngles ?? []).slice(0, maxExamples);
  const killedPitches = (ideaTaste.killedPitches ?? []).slice(0, maxExamples);
  const keptPitches = (ideaTaste.keptPitches ?? []).slice(0, maxExamples);
  if (!killedAngles.length && !keptAngles.length && !killedPitches.length && !keptPitches.length) return null;
  return { killedAngles, keptAngles, killedPitches, keptPitches };
}

// Shape decisions into a compact memory object the next run consumes.
// Returns null when there is nothing to learn from yet (the first run). `ideaTaste` folds the founder's
// idea kills/keeps in alongside the gate voice signal, so one memory object carries both halves.
export function buildDraftMemory(decisions, { maxExamples = 3, ideaTaste = null } = {}) {
  const approved = (decisions?.approved ?? []).slice(0, maxExamples).map((d) => d.draft);
  const rejected = (decisions?.rejected ?? []).slice(0, maxExamples).map((d) => d.draft);
  const edits = (decisions?.edits ?? []).slice(0, maxExamples);
  const idea = shapeIdeaTaste(ideaTaste, maxExamples);
  if (!approved.length && !rejected.length && !edits.length && !idea) return null;
  return { approved, rejected, edits, ...(idea ? { ideaTaste: idea } : {}) };
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
  if (memory.ideaTaste?.killedAngles?.length) {
    parts.push(
      "Ideation angles the founder has KILLED before. Do not pitch from these again:\n" +
        memory.ideaTaste.killedAngles
          .map((a) => `- ${a.angle}${a.count > 1 ? ` (killed ${a.count}×)` : ""}`)
          .join("\n") +
        (memory.ideaTaste.killedPitches?.length
          ? "\nExamples of killed ideas:\n" +
            memory.ideaTaste.killedPitches.map((p, i) => `[killed ${i + 1}] ${p}`).join("\n")
          : "")
    );
  }
  if (memory.ideaTaste?.keptAngles?.length) {
    parts.push(
      "Ideation angles the founder has KEPT before — lean into these:\n" +
        memory.ideaTaste.keptAngles
          .map((a) => `- ${a.angle}${a.count > 1 ? ` (kept ${a.count}×)` : ""}`)
          .join("\n")
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
      killedAngles: memory.ideaTaste?.killedAngles?.length ?? 0,
      keptAngles: memory.ideaTaste?.keptAngles?.length ?? 0,
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

// ── Queried taste (E2.1) ──────────────────────────────────────────────────────
// The moat as a precision instrument, not a dump. Instead of stapling the founder's entire
// decision history onto every prompt, the agent asks a SPECIFIC question ("subject line tone",
// "how direct an ask") and gets only the prior decisions that bear on it. Deterministic keyword
// overlap — code, not a model call (ENGINEERING.md: if code can answer, code answers). Edits are
// weighted strongest because an edit is the founder correcting the model, not just judging it.
// No question (or no usable one) falls back to the full render, so this is a strict superset of
// renderTasteProfile and get_taste stays backward-compatible.
const TASTE_STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "to", "of", "for", "in", "on", "is", "it", "this", "that",
  "with", "you", "your", "their", "they", "we", "our", "be", "are", "as", "at", "by", "from",
]);

function tasteTokens(value) {
  return (String(value ?? "").toLowerCase().match(/[a-z0-9]+/g) || []).filter(
    (w) => w.length > 2 && !TASTE_STOPWORDS.has(w),
  );
}

function tasteOverlap(text, questionTokens) {
  const present = new Set(tasteTokens(text));
  let score = 0;
  for (const q of questionTokens) if (present.has(q)) score += 1;
  return score;
}

export function queryTaste(profile, { question = "", limit = 3 } = {}) {
  if (!profile) return null;
  const q = tasteTokens(question);
  if (!q.length) {
    const text = renderTasteProfile(profile);
    return text ? { text, meta: { mode: "full", ...(profile.counts ?? {}) } } : null;
  }
  const rank = (arr, asText) =>
    (arr ?? [])
      .map((entry) => ({ entry, score: tasteOverlap(asText(entry), q) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x) => x.entry);

  const approved = rank(profile.approved, (d) => d);
  const rejected = rank(profile.rejected, (d) => d);
  // Always surface a correction: top matches, or — if none match — the most recent edit, since a
  // correction usually generalizes past the exact words of the question.
  let edits = rank(profile.edits, (e) => `${e.from} ${e.to}`);
  if (!edits.length && profile.edits?.length) edits = profile.edits.slice(0, 1);

  // Killed angles generalize past the exact words of the question (like edits), so always carry the
  // idea taste through — a question about an angle should never miss what the founder already killed.
  const ideaTaste = profile.ideaTaste ?? null;

  if (!approved.length && !rejected.length && !edits.length && !ideaTaste) {
    const c = profile.counts ?? {};
    return {
      text: `No prior taste decisions match "${question}". Observed so far — approved ${c.approved ?? 0}, rejected ${c.rejected ?? 0}, edits ${c.edits ?? 0}, killed angles ${c.killedAngles ?? 0}.`,
      meta: { mode: "no-match", question },
    };
  }
  return {
    text: renderDraftMemory({ approved, rejected, edits, ideaTaste }).replace(/^\n+/, ""),
    meta: {
      mode: "query",
      question,
      approved: approved.length,
      rejected: rejected.length,
      edits: edits.length,
      killedAngles: ideaTaste?.killedAngles?.length ?? 0,
    },
  };
}
