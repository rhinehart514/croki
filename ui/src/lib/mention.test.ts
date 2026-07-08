import { describe, it, expect } from "vitest";
import {
  buildRoster,
  detectMentionQuery,
  rankRoster,
  mentionToken,
  applyMention,
  extractMentions,
  tokenizeMessage,
  type MentionEntity,
} from "./mention";
import { CAPABILITIES } from "@/lib/capabilities";
import type { AgentBenchRow } from "@/api";

// The @-mention engine is the composer's keystone move, and it is pure — so it lives or dies on this
// parser being exactly right: it must open on a real "@" but not on an email, rank the founder's crew
// ahead of the toolbox, and — the load-bearing invariant — round-trip a placed chip back to the same
// structured hint the operator binds against. If a token can't survive the write→read trip, the founder's
// named teammate silently becomes prose again.

const benchRow = (over: Partial<AgentBenchRow> = {}): AgentBenchRow => ({
  ref: "gtm-signal-scout",
  job: "Watch new GitHub stars for buying signal",
  hasRuns: false,
  runCount: 0,
  counts: { approved: 0, rejected: 0, edits: 0 },
  note: null,
  ...over,
});

const bench: AgentBenchRow[] = [
  benchRow({ ref: "gtm-signal-scout", job: "watch github stars for buying signal" }),
  benchRow({ ref: "gtm-outreach-writer", job: "draft the first message in your voice" }),
  benchRow({ ref: "custom-1", name: "Content Strategist", job: "plan content that ranks" }),
];

describe("buildRoster", () => {
  it("puts teammates before capabilities, and derives a role label for unnamed agents", () => {
    const roster = buildRoster(bench, CAPABILITIES);
    const agents = roster.filter((e) => e.kind === "agent");
    const caps = roster.filter((e) => e.kind === "capability");
    expect(agents).toHaveLength(3);
    expect(caps).toHaveLength(CAPABILITIES.length);
    // teammates come first
    expect(roster.slice(0, 3).every((e) => e.kind === "agent")).toBe(true);
    // an unnamed agent reads as its derived role, a founder-named one keeps its name
    const scout = agents.find((e) => e.id === "gtm-signal-scout")!;
    expect(scout.label).toBe("Signal Scout");
    const named = agents.find((e) => e.id === "custom-1")!;
    expect(named.label).toBe("Content Strategist");
  });

  it("marks a gated capability gated and a teammate never gated", () => {
    const roster = buildRoster(bench, CAPABILITIES);
    const gmail = roster.find((e) => e.kind === "capability" && e.id === "gmail")!;
    expect(gmail.gated).toBe(true);
    expect(roster.filter((e) => e.kind === "agent").every((e) => e.gated === false)).toBe(true);
  });
});

describe("detectMentionQuery", () => {
  it("opens on a bare @ at the caret with an empty query", () => {
    const v = "have @";
    expect(detectMentionQuery(v, v.length)).toEqual({ query: "", start: 5, end: 6 });
  });

  it("captures the query typed after @, up to the caret", () => {
    const v = "send this to @Sig";
    expect(detectMentionQuery(v, v.length)).toEqual({ query: "Sig", start: 13, end: 17 });
  });

  it("does not trigger on an email address (@ mid-word)", () => {
    const v = "reach someone@example.com";
    expect(detectMentionQuery(v, v.length)).toBeNull();
  });

  it("closes once a space follows the query", () => {
    const v = "@Signal Scout";
    expect(detectMentionQuery(v, v.length)).toBeNull();
  });

  it("triggers after an opening bracket, not only after whitespace", () => {
    const v = "(@Gm";
    expect(detectMentionQuery(v, v.length)).toEqual({ query: "Gm", start: 1, end: 4 });
  });

  it("does not re-trigger when the caret sits just after a placed chip", () => {
    const entity = buildRoster(bench).find((e) => e.id === "gtm-signal-scout")!;
    const token = mentionToken(entity);
    const v = `${token}`;
    expect(detectMentionQuery(v, v.length)).toBeNull();
  });

  it("reads the query at a caret in the middle of the value, not the end", () => {
    const v = "a @Gm and more";
    // caret right after "@Gm"
    expect(detectMentionQuery(v, 5)).toEqual({ query: "Gm", start: 2, end: 5 });
  });
});

describe("rankRoster", () => {
  const roster = buildRoster(bench, CAPABILITIES);

  it("returns the roster (teammates first) for an empty query", () => {
    const ranked = rankRoster(roster, "", 20);
    expect(ranked[0].kind).toBe("agent");
  });

  it("prefix-matches a label ahead of a mere substring match", () => {
    const ranked = rankRoster(roster, "sig");
    expect(ranked[0].id).toBe("gtm-signal-scout");
  });

  it("matches a capability by name", () => {
    const ranked = rankRoster(roster, "gmail");
    expect(ranked[0].id).toBe("gmail");
  });

  it("matches an agent by monogram initials", () => {
    const ranked = rankRoster(roster, "ss");
    expect(ranked.some((e) => e.id === "gtm-signal-scout")).toBe(true);
  });

  it("drops non-matches entirely", () => {
    expect(rankRoster(roster, "zzzznotathing")).toHaveLength(0);
  });
});

describe("chip token round-trip", () => {
  const roster = buildRoster(bench, CAPABILITIES);
  const scout = roster.find((e) => e.id === "gtm-signal-scout")! as MentionEntity;
  const gmail = roster.find((e) => e.id === "gmail")! as MentionEntity;

  it("extracts an agent mention as a structured hint with its ref", () => {
    const msg = `have ${mentionToken(scout)} flag the buyers`;
    const { mentions, text } = extractMentions(msg);
    expect(mentions).toEqual([
      { kind: "agent", id: "gtm-signal-scout", ref: "gtm-signal-scout", label: "Signal Scout", gated: false },
    ]);
    expect(text).toBe("have @Signal Scout flag the buyers");
  });

  it("carries the gated flag through a capability token", () => {
    const msg = `then ${mentionToken(gmail)} sends it`;
    const { mentions } = extractMentions(msg);
    expect(mentions).toEqual([
      { kind: "capability", id: "gmail", label: "Gmail", gated: true },
    ]);
  });

  it("round-trips multiple mixed mentions in order", () => {
    const msg = `have ${mentionToken(scout)} then ${mentionToken(gmail)}`;
    const { mentions } = extractMentions(msg);
    expect(mentions.map((m) => m.id)).toEqual(["gtm-signal-scout", "gmail"]);
    expect(mentions.map((m) => m.kind)).toEqual(["agent", "capability"]);
  });

  it("survives a label with spaces, punctuation, and unicode", () => {
    const weird: MentionEntity = {
      kind: "capability",
      id: "cap:weird/id",
      label: "Señor O’Brien — 100% #real",
      cap: CAPABILITIES[0],
      blurb: "x",
      gated: false,
      search: "x",
    };
    const { mentions } = extractMentions(`x ${mentionToken(weird)} y`);
    expect(mentions[0].id).toBe("cap:weird/id");
    expect(mentions[0].label).toBe("Señor O’Brien — 100% #real");
  });

  it("applyMention splices a chip in at the query range and returns the caret after it", () => {
    const v = "have @Sig";
    const range = detectMentionQuery(v, v.length)!;
    const { value, caret } = applyMention(v, range, scout);
    expect(value.startsWith("have " + mentionToken(scout))).toBe(true);
    expect(value.slice(caret - 1, caret)).toBe(" "); // trailing space, caret parked after it
    // and the spliced value round-trips
    expect(extractMentions(value).mentions[0].id).toBe("gtm-signal-scout");
  });

  it("tokenizeMessage splits into ordered text and chip segments", () => {
    const msg = `a ${mentionToken(scout)} b`;
    const segs = tokenizeMessage(msg);
    expect(segs.map((s) => s.type)).toEqual(["text", "chip", "text"]);
    expect(segs[0]).toEqual({ type: "text", text: "a " });
    expect(segs[2]).toEqual({ type: "text", text: " b" });
  });

  it("a message with no mentions returns empty mentions and unchanged text", () => {
    expect(extractMentions("just plain words")).toEqual({ mentions: [], text: "just plain words" });
  });
});
