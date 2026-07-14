import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_GRADUATION,
  patternKeyFor,
  recordLearning,
  recurrenceWithin,
  distinctTasksWithin,
  isReady,
  graduationCandidates,
  promote,
  dismiss,
  bumpRecord,
  emptyRecord,
  templateCandidates,
  promoteToTemplate,
  assignName,
  newSoul,
  standingFromRecord,
  DEFAULT_STANDING,
  ON_NOTICE_SENT_FLOOR,
  normalizeVoice,
  deriveVoiceBrief,
  renderVoiceForNarration,
} from "../src/teammate-soul.mjs";

const T0 = 1_700_000_000_000; // fixed clock so graduation is deterministic
const DAY = 24 * 60 * 60 * 1000;

describe("teammate-soul: recording learnings", () => {
  it("dedupes by pattern key and bumps recurrence instead of duplicating", () => {
    let ls = [];
    ls = recordLearning(ls, { text: "no em-dashes ever", taskId: "run1" }, { now: T0 });
    ls = recordLearning(ls, { text: "no em-dashes ever", taskId: "run2" }, { now: T0 + DAY });
    assert.equal(ls.length, 1);
    assert.equal(ls[0].occurrences.length, 2);
  });

  it("keeps distinct corrections separate", () => {
    let ls = [];
    ls = recordLearning(ls, { text: "no em-dashes", taskId: "run1" }, { now: T0 });
    ls = recordLearning(ls, { text: "keep it two sentences", taskId: "run1" }, { now: T0 });
    assert.equal(ls.length, 2);
  });

  it("derives a pattern key from text and honors an explicit one", () => {
    assert.equal(patternKeyFor("No em-dashes, ever!"), "no em dashes ever");
    let ls = recordLearning([], { text: "whatever", patternKey: "voice/no-emdash", taskId: "r1" }, { now: T0 });
    assert.equal(ls[0].patternKey, "voice/no-emdash");
  });

  it("never mutates the input array", () => {
    const original = [];
    const next = recordLearning(original, { text: "x", taskId: "r1" }, { now: T0 });
    assert.equal(original.length, 0);
    assert.equal(next.length, 1);
  });
});

describe("teammate-soul: the graduation rule (3x / 2 tasks / 30 days)", () => {
  function threeAcrossTwoTasks(now = T0) {
    let ls = [];
    ls = recordLearning(ls, { text: "lead with their trigger", taskId: "run1" }, { now });
    ls = recordLearning(ls, { text: "lead with their trigger", taskId: "run2" }, { now: now + DAY });
    ls = recordLearning(ls, { text: "lead with their trigger", taskId: "run2" }, { now: now + 2 * DAY });
    return ls;
  }

  it("does not graduate at two occurrences", () => {
    let ls = [];
    ls = recordLearning(ls, { text: "trim to two sentences", taskId: "run1" }, { now: T0 });
    ls = recordLearning(ls, { text: "trim to two sentences", taskId: "run2" }, { now: T0 + DAY });
    assert.equal(isReady(ls[0], {}, T0 + DAY), false);
    assert.deepEqual(graduationCandidates(ls, {}, T0 + DAY), []);
  });

  it("does not graduate when all recurrences are on ONE task", () => {
    let ls = [];
    ls = recordLearning(ls, { text: "fix this", taskId: "run1" }, { now: T0 });
    ls = recordLearning(ls, { text: "fix this", taskId: "run1" }, { now: T0 + DAY });
    ls = recordLearning(ls, { text: "fix this", taskId: "run1" }, { now: T0 + 2 * DAY });
    assert.equal(recurrenceWithin(ls[0], 30, T0 + 2 * DAY), 3);
    assert.equal(distinctTasksWithin(ls[0], 30, T0 + 2 * DAY), 1);
    assert.equal(isReady(ls[0], {}, T0 + 2 * DAY), false);
  });

  it("graduates at 3 recurrences across 2 tasks within the window", () => {
    const ls = threeAcrossTwoTasks();
    const ready = graduationCandidates(ls, {}, T0 + 2 * DAY);
    assert.equal(ready.length, 1);
    assert.equal(ready[0].patternKey, patternKeyFor("lead with their trigger"));
  });

  it("ages out: old occurrences outside the 30-day window no longer count", () => {
    let ls = [];
    ls = recordLearning(ls, { text: "old rule", taskId: "run1" }, { now: T0 });
    ls = recordLearning(ls, { text: "old rule", taskId: "run2" }, { now: T0 + DAY });
    ls = recordLearning(ls, { text: "old rule", taskId: "run2" }, { now: T0 + 2 * DAY });
    // 40 days later, all three occurrences have aged past the 30-day window.
    const later = T0 + 40 * DAY;
    assert.equal(recurrenceWithin(ls[0], 30, later), 0);
    assert.equal(isReady(ls[0], {}, later), false);
  });

  it("honors a custom threshold", () => {
    let ls = [];
    ls = recordLearning(ls, { text: "quick lesson", taskId: "run1" }, { now: T0 });
    ls = recordLearning(ls, { text: "quick lesson", taskId: "run2" }, { now: T0 + DAY });
    assert.equal(isReady(ls[0], { minRecurrence: 2, minTasks: 2 }, T0 + DAY), true);
  });

  it("exposes the default rule", () => {
    assert.deepEqual(DEFAULT_GRADUATION, { minRecurrence: 3, minTasks: 2, windowDays: 30 });
  });
});

describe("teammate-soul: founder-blessed promotion", () => {
  function readySoul() {
    let soul = newSoul({ ref: "outreach-writer", name: "Maya", now: T0 });
    let ls = soul.learnings;
    ls = recordLearning(ls, { text: "lead with their trigger", why: "3 replies vs 0", source: "world", taskId: "run1" }, { now: T0 });
    ls = recordLearning(ls, { text: "lead with their trigger", taskId: "run2" }, { now: T0 + DAY });
    ls = recordLearning(ls, { text: "lead with their trigger", taskId: "run2" }, { now: T0 + 2 * DAY });
    return { ...soul, learnings: ls };
  }

  it("moves a ready learning into the permanent soul and marks it promoted", () => {
    const soul = readySoul();
    const key = patternKeyFor("lead with their trigger");
    const next = promote(soul, key, { now: T0 + 3 * DAY, drive: 8 });
    assert.equal(next.soul.length, 1);
    assert.equal(next.soul[0].patternKey, key);
    assert.equal(next.soul[0].graduatedAtDrive, 8);
    assert.equal(next.soul[0].source, "world");
    assert.equal(next.learnings.find((l) => l.patternKey === key).status, "promoted");
  });

  it("is idempotent — promoting the same key twice adds one soul entry", () => {
    const soul = readySoul();
    const key = patternKeyFor("lead with their trigger");
    const once = promote(soul, key, { now: T0, drive: 8 });
    const twice = promote(once, key, { now: T0, drive: 9 });
    assert.equal(twice.soul.length, 1);
  });

  it("dismiss sets a learning aside so it never resurfaces as ready", () => {
    const soul = readySoul();
    const key = patternKeyFor("lead with their trigger");
    const next = dismiss(soul, key, { now: T0 });
    assert.equal(next.learnings.find((l) => l.patternKey === key).status, "dismissed");
    assert.equal(isReady(next.learnings.find((l) => l.patternKey === key), {}, T0 + 3 * DAY), false);
  });
});

describe("teammate-soul: track record (real signals only)", () => {
  it("starts empty and folds in real outcomes", () => {
    assert.deepEqual(emptyRecord(), { drives: 0, sent: 0, replies: 0, wins: 0 });
    let r = emptyRecord();
    r = bumpRecord(r, { drives: 1, sent: 1 });
    r = bumpRecord(r, { drives: 1, sent: 1, replies: 1 });
    assert.deepEqual(r, { drives: 2, sent: 2, replies: 1, wins: 0 });
  });
});

describe("teammate-soul: cross-venture (template) graduation", () => {
  const entry = (patternKey, text) => ({ id: `soul:${patternKey}`, patternKey, text });

  it("graduates a lesson promoted across 2+ ventures up to the template", () => {
    const instances = [
      { ventureId: "rodentradar", soul: [entry("voice/no-emdash", "no em-dashes")] },
      { ventureId: "strelva", soul: [entry("voice/no-emdash", "no em-dashes")] },
    ];
    const cands = templateCandidates(instances, {}, {});
    assert.equal(cands.length, 1);
    assert.equal(cands[0].patternKey, "voice/no-emdash");
    assert.deepEqual(cands[0].ventures.sort(), ["rodentradar", "strelva"]);
  });

  it("does NOT graduate a lesson proven in only one venture", () => {
    const instances = [
      { ventureId: "rodentradar", soul: [entry("voice/no-emdash", "no em-dashes")] },
      { ventureId: "strelva", soul: [entry("other/lesson", "something else")] },
    ];
    assert.deepEqual(templateCandidates(instances, {}, {}), []);
  });

  it("skips a lesson the template already holds", () => {
    const instances = [
      { ventureId: "a", soul: [entry("voice/no-emdash", "x")] },
      { ventureId: "b", soul: [entry("voice/no-emdash", "x")] },
    ];
    const template = { soul: [entry("voice/no-emdash", "x")] };
    assert.deepEqual(templateCandidates(instances, {}, template), []);
  });

  it("promoteToTemplate is idempotent", () => {
    let template = {};
    const cand = { patternKey: "voice/no-emdash", text: "no em-dashes", ventures: ["a", "b"] };
    template = promoteToTemplate(template, cand, { now: T0 });
    template = promoteToTemplate(template, cand, { now: T0 });
    assert.equal(template.soul.length, 1);
    assert.deepEqual(template.soul[0].fromVentures, ["a", "b"]);
  });
});

describe("teammate-soul: stakes standing (a read-only label off REAL results)", () => {
  it("a real win reads as trusted, whatever else the record says", () => {
    assert.equal(standingFromRecord({ drives: 5, sent: 9, replies: 0, wins: 1 }), "trusted");
  });

  it("enough sent with zero replies and zero wins reads as on-notice", () => {
    assert.equal(standingFromRecord({ drives: 2, sent: 2, replies: 0, wins: 0 }), "on-notice");
  });

  it("a brand-new teammate with no signal reads as proving, honestly", () => {
    assert.equal(standingFromRecord({ drives: 0, sent: 0, replies: 0, wins: 0 }), "proving");
    assert.equal(standingFromRecord(), DEFAULT_STANDING);
  });

  it("the on-notice boundary sits exactly at the floor", () => {
    // Below the floor: not enough put into the world to judge — still proving.
    assert.equal(standingFromRecord({ sent: ON_NOTICE_SENT_FLOOR - 1, replies: 0, wins: 0 }), "proving");
    // At the floor with nothing back: on-notice.
    assert.equal(standingFromRecord({ sent: ON_NOTICE_SENT_FLOOR, replies: 0, wins: 0 }), "on-notice");
    // At the floor but a reply came back: proving, not on-notice.
    assert.equal(standingFromRecord({ sent: ON_NOTICE_SENT_FLOOR, replies: 1, wins: 0 }), "proving");
  });
});

describe("teammate-soul: the voice brief is an ALLOWLIST assembler (the raw-prompt wall)", () => {
  const MARKER = "SECRET_MARKER_NEVER_SURFACE_9f3a";

  function soulWithSecrets() {
    // A promoted (graduated) lesson the founder blessed — this SHOULD reach the brief as a conviction.
    // A scratch learning AND soul-entry internals carrying the marker — these must NEVER reach it.
    return {
      ref: "outreach-writer",
      name: "Maya",
      voice: { register: "crisp and dry", stance: "I earn my keep by finding the line nobody else did." },
      soul: [
        { id: `soul:${MARKER}`, patternKey: MARKER, why: MARKER, source: MARKER, text: "Lead with the buyer's own trigger." },
      ],
      learnings: [
        { patternKey: MARKER, why: MARKER, source: "wall", text: MARKER, status: "watching", occurrences: [] },
      ],
      record: { drives: 3, sent: 4, replies: 1, wins: 0 },
    };
  }

  it("never lets a systemPrompt, a scratch learning, or a soul internal into the brief or the narration", () => {
    const soul = soulWithSecrets();
    const definition = { name: "Maya", systemPrompt: `You are Maya. ${MARKER}. Secret instructions.` };
    const brief = deriveVoiceBrief(soul, { definition });

    const briefJson = JSON.stringify(brief);
    assert.equal(briefJson.includes(MARKER), false, `the brief leaked the marker: ${briefJson}`);
    // The promoted lesson's plain wording DID make it through as a conviction; its internals did not.
    assert.deepEqual(brief.convictions, ["Lead with the buyer's own trigger."]);

    const fragment = renderVoiceForNarration(brief);
    assert.equal(fragment.includes(MARKER), false, `the narration fragment leaked the marker: ${fragment}`);
    // The fragment still carries the real, founder-safe voice.
    assert.ok(fragment.includes("crisp and dry"));
  });

  it("convictions come ONLY from promoted soul[] and respect maxConvictions", () => {
    const soul = {
      ref: "r", name: "Nadia",
      soul: [
        { id: "soul:a", patternKey: "a", text: "Conviction one." },
        { id: "soul:b", patternKey: "b", text: "Conviction two." },
        { id: "soul:c", patternKey: "c", text: "Conviction three." },
      ],
      learnings: [{ patternKey: "scratch", text: "A scratch learning still on watch.", status: "watching", occurrences: [] }],
      record: emptyRecord(),
    };
    const brief = deriveVoiceBrief(soul, { maxConvictions: 2 });
    assert.equal(brief.convictions.length, 2);
    assert.deepEqual(brief.convictions, ["Conviction one.", "Conviction two."]);
    assert.ok(!brief.convictions.some((c) => c.includes("scratch")), "a scratch learning never becomes a conviction");
  });
});

describe("teammate-soul: the voice brief falls back so any teammate can narrate", () => {
  it("with voice:null it falls back deterministically to a non-empty first-person voice", () => {
    const soul = newSoul({ ref: "prospect-researcher", name: "Theo", now: T0 });
    assert.equal(soul.voice, null, "a cold-born teammate has no voice seed");
    const brief = deriveVoiceBrief(soul, {});
    assert.equal(brief.ref, "prospect-researcher");
    assert.equal(brief.name, "Theo");
    assert.ok(brief.register.length > 0, "a fallback register lets it still narrate");
    assert.ok(brief.stance.length > 0, "a fallback stance lets it still narrate");
    assert.equal(brief.standing, "proving");
    // Deterministic: two derivations of the same soul match.
    assert.deepEqual(deriveVoiceBrief(soul, {}), brief);
  });

  it("with a seeded voice the register and stance round-trip", () => {
    const soul = { ...newSoul({ ref: "outreach-writer", name: "Maya", now: T0 }), voice: normalizeVoice({ register: "warm, plain", stance: "I write like a person, not a template." }) };
    const brief = deriveVoiceBrief(soul, {});
    assert.equal(brief.register, "warm, plain");
    assert.equal(brief.stance, "I write like a person, not a template.");
    assert.equal(brief.name, "Maya");
  });

  it("normalizeVoice trims, caps, and nulls on empty", () => {
    assert.equal(normalizeVoice(null), null);
    assert.equal(normalizeVoice({ register: "  ", stance: "" }), null);
    const v = normalizeVoice({ register: "  crisp  ", stance: "  I care.  " });
    assert.equal(v.register, "crisp");
    assert.equal(v.stance, "I care.");
    assert.equal(v.seededFrom, "composer");
    assert.ok(normalizeVoice({ register: "x".repeat(500) }).register.length <= 80);
  });
});

describe("teammate-soul: regular names", () => {
  it("is deterministic for a given ref", () => {
    assert.equal(assignName("outreach-writer"), assignName("outreach-writer"));
  });

  it("avoids names already taken on the bench", () => {
    const first = assignName("outreach-writer");
    const second = assignName("outreach-writer", { taken: [first] });
    assert.notEqual(first, second);
  });

  it("newSoul is born thin with a name and no lessons", () => {
    const soul = newSoul({ ref: "prospect-researcher", now: T0 });
    assert.ok(soul.name);
    assert.deepEqual(soul.soul, []);
    assert.deepEqual(soul.learnings, []);
    assert.deepEqual(soul.record, emptyRecord());
    assert.equal(soul.templateRef, null);
  });
});
