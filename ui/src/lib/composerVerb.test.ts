import { describe, it, expect } from "vitest";
import { deriveVerb, frameVerbMessage, verbById, COMPOSER_VERBS } from "./composerVerb";

// The verb-scoped send is the whole point of the attached composer: with a canvas object selected, the
// founder must SEE the action pressing send will run before they press it. That verb is derived
// deterministically — plain code, no model call — from the selection kind plus whatever's typed. These
// lock that derivation: a kind's sensible default, a typed imperative overriding it, an explicit menu
// pick winning over both, and an unknown kind falling through to "ask" instead of dead-ending.

describe("deriveVerb", () => {
  it("uses the selection kind's default verb when nothing is typed and nothing is overridden", () => {
    expect(deriveVerb("message", "").id).toBe("draft");   // a message wants drafting
    expect(deriveVerb("proof_point", "").id).toBe("find"); // a proof point wants evidence
    expect(deriveVerb("gate", "").id).toBe("stage");       // the gate stages a decision
    expect(deriveVerb("offer", "").id).toBe("sharpen");
  });

  it("covers node-graph step categories, not just object-graph card kinds", () => {
    expect(deriveVerb("generate", "").id).toBe("draft");
    expect(deriveVerb("execute", "").id).toBe("stage");
    expect(deriveVerb("source", "").id).toBe("find");
  });

  it("falls through to ask for a kind it has never seen (open set, never a dead end)", () => {
    expect(deriveVerb("some_new_kind_we_never_added", "").id).toBe("ask");
    expect(deriveVerb("", "").id).toBe("ask");
  });

  it("derives the verb from a typed imperative, overriding the kind default", () => {
    // "proof_point" defaults to find, but leading with "connect…" means the founder wants Connect.
    expect(deriveVerb("proof_point", "connect it to the gate").id).toBe("connect");
    // A message defaults to draft, but "split by segment" means Split.
    expect(deriveVerb("message", "split by segment").id).toBe("split");
  });

  it("matches a lead word only at the START of the text, and is case-insensitive", () => {
    expect(deriveVerb("message", "Wire this into the next step").id).toBe("connect"); // "wire" is a connect lead
    // A lead word buried mid-sentence does NOT hijack the verb — only the first word derives it.
    expect(deriveVerb("message", "make this connect better").id).toBe("draft"); // stays the kind default
  });

  it("lets an explicit founder override win over both the typed text and the kind default", () => {
    // Typed "connect…" would derive connect, kind would derive find — but the override pins stage.
    expect(deriveVerb("proof_point", "connect it", "stage").id).toBe("stage");
  });

  it("ignores an override id that isn't a real verb (degrades to the derived verb)", () => {
    expect(deriveVerb("message", "", "not-a-verb").id).toBe("draft");
  });

  it("never throws — always returns a verb from the registry", () => {
    for (const kind of ["message", "", "weird", "gate"]) {
      const v = deriveVerb(kind, "");
      expect(COMPOSER_VERBS).toContainEqual(v);
    }
  });
});

describe("frameVerbMessage", () => {
  const draft = verbById("draft")!;
  const ask = verbById("ask")!;
  const connect = verbById("connect")!;

  it("sends ask text verbatim (ask has no framing, no solo)", () => {
    expect(frameVerbMessage(ask, "why is this empty?")).toBe("why is this empty?");
    expect(frameVerbMessage(ask, "")).toBe("");
  });

  it("sends the verb's solo imperative when the input is empty (the verb IS the instruction)", () => {
    expect(frameVerbMessage(draft, "")).toBe(draft.solo);
    expect(frameVerbMessage(draft, "   ")).toBe(draft.solo);
    expect(frameVerbMessage(connect, "")).toBe(connect.solo);
  });

  it("prefixes the verb label onto free-form text", () => {
    expect(frameVerbMessage(draft, "keep it under 80 words")).toBe("Draft: keep it under 80 words");
  });

  it("does not double the verb when the text already leads with it", () => {
    // "connect this to the gate" already starts with the connect lead — left as-is, no "Connect:" prefix.
    expect(frameVerbMessage(connect, "connect this to the gate")).toBe("connect this to the gate");
    expect(frameVerbMessage(draft, "write the intro")).toBe("write the intro"); // "write" is a draft lead
  });
});
