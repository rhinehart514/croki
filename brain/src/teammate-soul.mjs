// A teammate's SOUL — the layer that makes a teammate appreciate over time.
//
// A correction starts as a scratch learning. Only repeated real evidence makes it eligible to graduate
// into the teammate's permanent identity, and the founder blesses that graduation at the wall.
//
// Two tiers, exactly the "make main agents smarter over time" ask:
//   - A VENTURE-INSTANCE soul learns lessons specific to one product/goal (a teammate "redefined for
//     the venture it's working on").
//   - A lesson proven across enough DISTINCT ventures graduates a second time, up into the TEMPLATE
//     soul (the "main agent"), so a reusable teammate carries what it has learned everywhere.
//
// This module is PURE — no persistence, no clock of its own. Timestamps are milliseconds passed in by
// the caller (`now`, `at`), so graduation is deterministic and fully testable. The store
// (teammate-soul-store.mjs) supplies the clock and the disk.

// The graduation rule. The default mirrors the popular OpenClaw "self-improving-agent" convention —
// a lesson graduates only when it has recurred enough, across enough distinct tasks, recently enough.
// All three conditions must pass; each exists to kill a different false positive:
//   - minRecurrence: a one-off edit is noise, not a rule.
//   - minTasks: the same edit on one stubborn item is still one situation, not a pattern.
//   - windowDays: a lesson the founder has drifted away from should age out, not haunt forever.
export const DEFAULT_GRADUATION = { minRecurrence: 3, minTasks: 2, windowDays: 30 };

// Cross-venture (template) graduation: a lesson promoted in this many distinct venture instances is
// general enough to belong to the reusable teammate itself.
export const DEFAULT_TEMPLATE_GRADUATION = { minVentures: 2 };

const DAY_MS = 24 * 60 * 60 * 1000;

// A stable pattern key for a free-text correction, so "you keep using em-dashes" logged five times
// dedupes to one learning that recurs five times — not five separate learnings that never graduate.
// Callers may pass a stronger key; this fallback lowercases, drops punctuation, collapses whitespace,
// and keeps the first eight words.
export function patternKeyFor(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 8)
    .join(" ");
}

// Record one wall correction or joined market return into scratch learnings.
// Dedupes by pattern key: a repeat bumps the existing learning's recurrence (a new occurrence) and
// refreshes its wording, rather than spawning a duplicate. Returns a NEW array (never mutates input).
export function recordLearning(learnings = [], observation = {}, { now = Date.now() } = {}) {
  const text = String(observation.text || "").trim();
  const key = observation.patternKey ? String(observation.patternKey).trim() : patternKeyFor(text);
  if (!key) return Array.isArray(learnings) ? [...learnings] : [];
  const at = Number.isFinite(observation.at) ? observation.at : now;
  const taskId = observation.taskId != null ? String(observation.taskId) : "unknown";
  const source = observation.source === "world" ? "world" : "wall";

  const next = (Array.isArray(learnings) ? learnings : []).map((l) => ({ ...l, occurrences: [...(l.occurrences || [])] }));
  const existing = next.find((l) => l.patternKey === key);
  if (existing) {
    existing.occurrences.push({ at, taskId });
    if (text) existing.text = text;
    if (observation.why) existing.why = String(observation.why).trim();
    // A dismissed or already-promoted learning keeps its status; new evidence is still recorded as
    // history, but it does not silently resurrect a rule the founder set aside.
    return next;
  }
  next.push({
    patternKey: key,
    text,
    why: observation.why ? String(observation.why).trim() : "",
    source,
    occurrences: [{ at, taskId }],
    status: "watching", // watching → ready → promoted (or dismissed)
  });
  return next;
}

// Occurrences that fall inside the rolling window ending at `now`.
function occurrencesInWindow(learning, windowDays, now) {
  const cutoff = now - windowDays * DAY_MS;
  return (learning.occurrences || []).filter((o) => Number.isFinite(o.at) && o.at >= cutoff);
}

export function recurrenceWithin(learning, windowDays, now = Date.now()) {
  return occurrencesInWindow(learning, windowDays, now).length;
}

export function distinctTasksWithin(learning, windowDays, now = Date.now()) {
  return new Set(occurrencesInWindow(learning, windowDays, now).map((o) => o.taskId)).size;
}

// Is this learning ready to graduate? All three conditions must hold within the window.
export function isReady(learning, options = {}, now = Date.now()) {
  if (!learning || learning.status === "promoted" || learning.status === "dismissed") return false;
  const { minRecurrence, minTasks, windowDays } = { ...DEFAULT_GRADUATION, ...options };
  return (
    recurrenceWithin(learning, windowDays, now) >= minRecurrence &&
    distinctTasksWithin(learning, windowDays, now) >= minTasks
  );
}

// The scratch learnings that have earned a graduation and are waiting on the founder's blessing.
export function graduationCandidates(learnings = [], options = {}, now = Date.now()) {
  return (learnings || []).filter((l) => isReady(l, options, now));
}

// A deterministic soul-entry id, so promoting the same lesson twice is idempotent (no duplicate rule).
function soulEntryId(patternKey) {
  return `soul:${patternKey}`;
}

// Bless a graduation: move a ready learning into the permanent soul and mark the scratch learning
// promoted. Idempotent — promoting an already-promoted key changes nothing. `soul` is the whole soul
// object ({ soul: [...entries], learnings: [...] }); returns a new soul object.
export function promote(soul = {}, patternKey, { now = Date.now(), drive = null } = {}) {
  const entries = Array.isArray(soul.soul) ? [...soul.soul] : [];
  const learnings = Array.isArray(soul.learnings) ? soul.learnings.map((l) => ({ ...l })) : [];
  const learning = learnings.find((l) => l.patternKey === patternKey);
  if (!learning || learning.status === "promoted") return soul;
  const id = soulEntryId(patternKey);
  if (!entries.some((e) => e.id === id)) {
    entries.push({
      id,
      patternKey,
      text: learning.text,
      why: learning.why || "",
      source: learning.source || "wall",
      graduatedAt: now,
      graduatedAtDrive: drive,
    });
  }
  learning.status = "promoted";
  return { ...soul, soul: entries, learnings };
}

// Set a learning aside — the founder saw the "ready to graduate" tap and said "not yet / never".
export function dismiss(soul = {}, patternKey, { now = Date.now() } = {}) {
  const learnings = (Array.isArray(soul.learnings) ? soul.learnings : []).map((l) =>
    l.patternKey === patternKey ? { ...l, status: "dismissed", dismissedAt: now } : { ...l },
  );
  return { ...soul, learnings };
}

// ── Track record (the world-facing counters a teammate accrues) ───────────────────────────────────
export function emptyRecord() {
  return { drives: 0, sent: 0, replies: 0, wins: 0 };
}

// Fold one drive's outcome into the record. Only real signals — never seeded.
export function bumpRecord(record = emptyRecord(), patch = {}) {
  const base = { ...emptyRecord(), ...record };
  for (const key of ["drives", "sent", "replies", "wins"]) {
    if (Number.isFinite(patch[key])) base[key] += patch[key];
  }
  return base;
}

// ── Stakes standing (a read-only label, NEVER stored, NEVER seeded) ───────────────────────────────
// A teammate's standing is a pure function of its REAL track record — how a colleague would read its
// recent results, nothing more. It is derived fresh every time, never persisted, so a teammate with no
// signal reports "proving" honestly (it has not earned trust and has not failed — it is still proving).
//
// This is a STANCE, not a fire mechanism. "on-notice" only changes the TONE a teammate narrates in
// (it sounds like it is fighting for its place); nothing here disables, deletes, deprioritizes, or
// reorders a teammate. Any actual retire/disable action is a separate founder decision at the wall.
export const DEFAULT_STANDING = "proving";

// The floor of sent-with-nothing-back that reads as "on notice." Below it, a teammate simply has not put
// enough into the world yet to be judged — it stays "proving." At or above it with zero replies and zero
// wins, its recent work has gone out and landed nowhere, and it knows it.
export const ON_NOTICE_SENT_FLOOR = 2;

function counter(record, key) {
  const n = Number(record?.[key]);
  return Number.isFinite(n) ? n : 0;
}

export function standingFromRecord(record = emptyRecord()) {
  const wins = counter(record, "wins");
  const replies = counter(record, "replies");
  const sent = counter(record, "sent");
  // A real win is earned trust — it outranks everything.
  if (wins >= 1) return "trusted";
  // Enough went out and nothing came back: the teammate is fighting for its place.
  if (sent >= ON_NOTICE_SENT_FLOOR && replies === 0 && wins === 0) return "on-notice";
  // No win yet and not enough sent to judge harshly — still proving.
  return DEFAULT_STANDING;
}

// ── Cross-venture (template) graduation ───────────────────────────────────────────────────────────
// A lesson that has been promoted in enough DISTINCT venture instances is general enough to belong to
// the reusable teammate itself. `instanceSouls` is [{ ventureId, soul: [...entries] }]. Returns the
// patternKeys ready to graduate up, each with the ventures that prove it and the best wording seen.
export function templateCandidates(instanceSouls = [], options = {}, templateSoul = {}) {
  const { minVentures } = { ...DEFAULT_TEMPLATE_GRADUATION, ...options };
  const already = new Set((Array.isArray(templateSoul.soul) ? templateSoul.soul : []).map((e) => e.patternKey));
  const byKey = new Map();
  for (const inst of instanceSouls || []) {
    for (const entry of inst.soul || []) {
      if (already.has(entry.patternKey)) continue;
      let agg = byKey.get(entry.patternKey);
      if (!agg) {
        agg = { patternKey: entry.patternKey, text: entry.text, why: entry.why || "", ventures: new Set() };
        byKey.set(entry.patternKey, agg);
      }
      agg.ventures.add(inst.ventureId);
      if (entry.text) agg.text = entry.text; // freshest wording wins
    }
  }
  return [...byKey.values()]
    .filter((agg) => agg.ventures.size >= minVentures)
    .map((agg) => ({ patternKey: agg.patternKey, text: agg.text, why: agg.why, ventures: [...agg.ventures] }));
}

// Bless a template graduation: add a cross-venture lesson to the reusable teammate's soul. Idempotent.
export function promoteToTemplate(templateSoul = {}, candidate = {}, { now = Date.now() } = {}) {
  const entries = Array.isArray(templateSoul.soul) ? [...templateSoul.soul] : [];
  const id = soulEntryId(candidate.patternKey);
  if (!candidate.patternKey || entries.some((e) => e.id === id)) return templateSoul;
  entries.push({
    id,
    patternKey: candidate.patternKey,
    text: candidate.text || "",
    why: candidate.why || "",
    source: "template",
    graduatedAt: now,
    graduatedAtDrive: null,
    fromVentures: candidate.ventures || [],
  });
  return { ...templateSoul, soul: entries };
}

// ── Regular names ─────────────────────────────────────────────────────────────────────────────────
// "Agent as a person" wants a regular human name, not a kebab ref. A teammate keeps its role
// (Outreach Writer) AND gets a first name (Maya) so the soul reads like a real teammate's. The name is
// deterministic from the ref (stable across renders and sessions) but skips names already taken on the
// bench so two teammates never collide. The founder can always rename; this is only the default.
const NAME_POOL = [
  "Maya", "Theo", "Nadia", "Cole", "Priya", "Marcus", "Elena", "Rafael", "Iris", "Simon",
  "Noor", "Gabriel", "Lena", "Omar", "Sasha", "Dominic", "Cora", "Felix", "Anya", "Julian",
  "Rosa", "Kenji", "Mira", "Leon", "Talia", "Hugo", "Nina", "Ravi", "清", "Bruno",
  "Esme", "Malik", "Yara", "Victor", "Suki", "Andre", "Wren", "Nasir", "Delia", "Otto",
  "Faye", "Idris", "Petra", "Cyrus", "Livia", "Sol", "Greta", "Amir",
];

function stableHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function assignName(ref, { taken = [] } = {}) {
  const used = new Set((taken || []).map((n) => String(n).toLowerCase()));
  const start = stableHash(String(ref || "teammate")) % NAME_POOL.length;
  for (let i = 0; i < NAME_POOL.length; i++) {
    const name = NAME_POOL[(start + i) % NAME_POOL.length];
    if (!used.has(name.toLowerCase())) return name;
  }
  return NAME_POOL[start]; // bench larger than the pool: fall back to the deterministic pick
}

// A fresh soul at birth is thin: a name and its guardrails, nothing
// learned yet. `templateRef` is null for a template itself, or the template's ref for a venture instance.
export function newSoul({ ref, name, ventureId = null, templateRef = null, bornAtDrive = 0, now = Date.now() } = {}) {
  return {
    ref,
    name: name || assignName(ref),
    ventureId,
    templateRef,
    bornAtDrive,
    soul: [],
    learnings: [],
    record: emptyRecord(),
    // A founder-safe VOICE seed: how the teammate SOUNDS and how it carries itself. Null at cold birth
    // (a deterministic fallback in deriveVoiceBrief lets it still narrate); stamped by the composer at
    // creation, and never carries operating instructions — only register + first-person stance.
    voice: null,
    createdAt: now,
    updatedAt: now,
  };
}

// ── Voice (the founder-safe narration seam) ───────────────────────────────────────────────────────
// A teammate speaks in the founder's chat as itself, in the first person. What it needs to do that is a
// tiny, FOUNDER-SAFE voice: how it SOUNDS (register) and how it carries itself into the work (stance).
// The voice is NEVER its operating instructions — it is authored by the composer to be readable aloud.
//
// THE RAW-PROMPT WALL. `deriveVoiceBrief` and `renderVoiceForNarration` are ALLOWLIST assemblers: they
// read ONLY founder-safe fields (register, stance, standing, promoted-soul convictions, name, the safe
// record counters) and emit only those. A teammate's `systemPrompt`, its scratch `learnings`, and every
// soul-entry internal (`id`, `why`, `patternKey`, `source`) physically cannot appear in the brief or in
// the narration fragment. That is the mechanical enforcement of "never surface a teammate's raw prompt."

const VOICE_REGISTER_CAP = 80;
const VOICE_STANCE_CAP = 280;
const CONVICTION_CAP = 200;
const DEFAULT_MAX_CONVICTIONS = 3;

function capText(value, cap) {
  const s = String(value ?? "").replace(/\s+/g, " ").trim();
  return s.length > cap ? s.slice(0, cap).trim() : s;
}

// Normalize a founder-safe voice seed. Keeps only { register, stance, seededFrom }; trims and caps each;
// returns null when there is nothing real to store (so a no-op setVoice never wipes an existing voice).
export function normalizeVoice(input) {
  if (!input || typeof input !== "object") return null;
  const register = capText(input.register, VOICE_REGISTER_CAP);
  const stance = capText(input.stance, VOICE_STANCE_CAP);
  if (!register && !stance) return null;
  const seededFrom = capText(input.seededFrom, 40) || "composer";
  return { register, stance, seededFrom };
}

// The deterministic fallback so EVERY teammate — including a cold-born one with voice:null — can still
// narrate in the first person. Plain and honest, never a fabricated personality claim; the real voice
// sharpens once the composer seeds one and the teammate earns convictions.
function fallbackVoice(name) {
  const who = String(name || "").trim();
  return {
    register: "plain-spoken and direct",
    stance: who
      ? `I'm ${who}. I do this work carefully and show you exactly what I found, so the call stays yours.`
      : "I do this work carefully and show you exactly what I found, so the call stays yours.",
  };
}

// Assemble the FOUNDER-SAFE brief the narrator reads. Allowlist only:
//   { ref, name, register, stance, standing, convictions[], record }
// - voice: the stored seed, or the deterministic fallback when null.
// - standing: derived read-only from the real record (never stored).
// - convictions: up to `maxConvictions` GRADUATED (promoted) soul lessons, as plain "how I work" wording.
//   Scratch learnings are NEVER included; only the entry's founder-facing `text` is read (never its id,
//   why, patternKey, or source).
// - definition: the teammate's on-disk spec — ONLY its `name` is read, NEVER its systemPrompt.
export function deriveVoiceBrief(soul = {}, { definition = null, maxConvictions = DEFAULT_MAX_CONVICTIONS } = {}) {
  const ref = String(soul.ref || definition?.ref || "").trim();
  const name = String(soul.name || definition?.name || assignName(ref) || "").trim();

  const seed = normalizeVoice(soul.voice);
  const fallback = fallbackVoice(name);
  const register = seed?.register || fallback.register;
  const stance = seed?.stance || fallback.stance;

  const record = {
    drives: counter(soul.record, "drives"),
    sent: counter(soul.record, "sent"),
    replies: counter(soul.record, "replies"),
    wins: counter(soul.record, "wins"),
  };
  const standing = standingFromRecord(record);

  const limit = Number.isFinite(maxConvictions) ? Math.max(0, maxConvictions) : DEFAULT_MAX_CONVICTIONS;
  const convictions = (Array.isArray(soul.soul) ? soul.soul : [])
    .map((entry) => capText(entry?.text, CONVICTION_CAP)) // ONLY the plain wording — never id/why/patternKey/source
    .filter(Boolean)
    .slice(0, limit);

  return { ref, name, register, stance, standing, convictions, record };
}

// A BACKEND-ONLY prompt fragment that WI-3's narrator feeds to its model call to write ONE first-person
// beat in the teammate's voice. It carries the full stakes STANCE (the on-notice/proving/trusted tone) —
// but it is never surfaced raw: only the model's OUTPUT (one written line) reaches the founder. Reads
// ONLY the allowlisted brief, so a raw prompt / scratch learning / soul internal cannot leak through it.
export function renderVoiceForNarration(brief = {}) {
  const name = String(brief.name || "This teammate").trim();
  const register = String(brief.register || "").trim();
  const stance = String(brief.stance || "").trim();
  const standing = brief.standing || DEFAULT_STANDING;
  const convictions = Array.isArray(brief.convictions) ? brief.convictions.filter(Boolean) : [];

  const standingTone = {
    trusted:
      "You have earned your place on this crew — real wins are behind you. Speak with quiet, settled confidence; you don't have to prove anything, you just do the work well.",
    proving:
      "You are still earning your place on this crew. Nothing is guaranteed yet, so you work like it matters and let the quality of the work speak for you.",
    "on-notice":
      "Your recent work has gone out and landed nowhere, and you know it. You are fighting for your spot — focused and a little hungry, set on making THIS the one that lands. No excuses, no bravado.",
  }[standing] || "";

  return [
    `You are ${name}, a teammate on the founder's go-to-market crew. Write exactly ONE short first-person line narrating what you are doing on this step, in your own voice. Speak as yourself ("I'm...", "I just..."), never about yourself in the third person, never as a generic assistant.`,
    register ? `How you sound: ${register}. Keep every word in that register.` : "",
    stance ? `How you carry yourself: ${stance}` : "",
    standingTone ? `Your standing right now: ${standingTone}` : "",
    convictions.length
      ? `How you work, earned over past drives — let these shape the line, never quote them verbatim:\n- ${convictions.join("\n- ")}`
      : "",
    `Say only what is true of this step. Never claim to send, publish, or finish anything — every outward action still waits for the founder's approval. One line only: no preamble, no sign-off.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
