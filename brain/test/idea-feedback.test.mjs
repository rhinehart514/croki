import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  ideaDecisionSignals,
  recordIdeaDecisions,
  loadFeedbackLedger,
} from "../src/feedback-ledger.mjs";
import {
  extractIdeaTaste,
  buildDraftMemory,
  buildTasteProfile,
  renderDraftMemory,
  queryTaste,
} from "../src/memory.mjs";

function freshRoot() {
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), "gtm-idea-feedback-")) };
}

describe("feedback-ledger — IdeaKill / IdeaKeep on the FEEDBACK rail", () => {
  it("turns a killed idea into an IdeaKill signal and a survived one into IdeaKeep", () => {
    const signals = ideaDecisionSignals({
      projectId: "p1",
      decisions: [
        { id: "idea-a", angle: "scarcity-first", pitch: "Own the only invite slot.", killed: true },
        { id: "idea-b", angle: "asset-first", pitch: "Turn the repo into a public scorecard.", verdict: "survived" },
      ],
    });
    assert.equal(signals.length, 2);
    const kill = signals.find((s) => s.type === "IdeaKill");
    const keep = signals.find((s) => s.type === "IdeaKeep");
    assert.equal(kill.angle, "scarcity-first");
    assert.equal(kill.ideaId, "idea-a");
    assert.equal(keep.angle, "asset-first");
  });

  it("honors an explicit founder decision over the idea's stored verdict", () => {
    // The founder kills a survived idea — the founder act wins.
    const signals = ideaDecisionSignals({
      decisions: [{ idea: { id: "idea-c", angle: "second-order-first", pitch: "x", verdict: "survived" }, decision: "kill" }],
    });
    assert.equal(signals.length, 1);
    assert.equal(signals[0].type, "IdeaKill");
  });

  it("skips an undecided idea (no verdict, no explicit decision)", () => {
    const signals = ideaDecisionSignals({ decisions: [{ id: "idea-d", angle: "x", pitch: "y" }] });
    assert.equal(signals.length, 0);
  });

  it("banks the decisions in the same project feedback ledger gate decisions use", () => {
    const options = freshRoot();
    recordIdeaDecisions({
      projectId: "p1",
      decisions: [{ id: "idea-a", angle: "scarcity-first", pitch: "p", killed: true }],
    }, options);
    const ledger = loadFeedbackLedger("p1", options);
    assert.ok(ledger.signals.some((s) => s.type === "IdeaKill"));
  });

  it("idea decisions live on the feedback rail, never as AgentAction records", () => {
    const signals = ideaDecisionSignals({ decisions: [{ id: "i", angle: "a", pitch: "p", killed: true }] });
    assert.ok(signals.every((s) => s.type !== "AgentAction"));
  });
});

describe("memory — idea taste folds into the next round", () => {
  const ideaSignals = [
    { type: "IdeaKill", angle: "scarcity-first", summary: "Own the only invite slot." },
    { type: "IdeaKill", angle: "scarcity-first", summary: "Hoard the credential." },
    { type: "IdeaKeep", angle: "asset-first", summary: "Public scorecard from the repo." },
    { type: "FounderApproval", summary: "not an idea signal" },
  ];

  it("extracts killed and kept angles with counts, newest first", () => {
    const taste = extractIdeaTaste(ideaSignals);
    assert.equal(taste.killedAngles[0].angle, "scarcity-first");
    assert.equal(taste.killedAngles[0].count, 2);
    assert.equal(taste.keptAngles[0].angle, "asset-first");
    assert.equal(taste.killedPitches.length, 2);
  });

  it("returns null when there are no idea signals", () => {
    assert.equal(extractIdeaTaste([{ type: "FounderApproval", summary: "x" }]), null);
  });

  it("buildDraftMemory carries idea taste even with no gate decisions", () => {
    const memory = buildDraftMemory(null, { ideaTaste: extractIdeaTaste(ideaSignals) });
    assert.ok(memory, "memory built from idea taste alone");
    assert.equal(memory.ideaTaste.killedAngles[0].angle, "scarcity-first");
    const rendered = renderDraftMemory(memory);
    assert.match(rendered, /KILLED before/);
    assert.match(rendered, /scarcity-first/);
  });

  it("buildTasteProfile counts killed/kept angles", () => {
    const profile = buildTasteProfile(null, { ideaTaste: extractIdeaTaste(ideaSignals) });
    assert.equal(profile.counts.killedAngles, 1);
    assert.equal(profile.counts.keptAngles, 1);
  });

  it("queryTaste surfaces a killed angle even when no draft decision matches the question", () => {
    const profile = buildTasteProfile(
      { approved: [], rejected: [], edits: [] },
      { ideaTaste: extractIdeaTaste(ideaSignals) },
    );
    const out = queryTaste(profile, { question: "scarcity angle" });
    assert.ok(out, "query returned something");
    assert.match(out.text, /scarcity-first/);
    assert.equal(out.meta.killedAngles, 1);
  });
});
