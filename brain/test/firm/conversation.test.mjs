import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { appendConversationMessage, listConversation } from "../../src/firm/conversation.mjs";
import { createVenture, exportVenture, importVenture } from "../../src/firm/venture-store.mjs";

function freshRoot() {
  return { root: fs.mkdtempSync(path.join(os.tmpdir(), "firm-conversation-")) };
}

describe("venture conversation — passive, durable transcript", () => {
  it("orders actual messages and keeps ventures isolated", () => {
    const options = freshRoot();
    const first = createVenture({ name: "First venture" }, options);
    const second = createVenture({ name: "Second venture" }, options);

    appendConversationMessage({
      ventureId: first.id, role: "founder", content: "Find our first buyer", teammateRef: "sable",
    }, options);
    appendConversationMessage({
      ventureId: first.id, role: "teammate", content: "I found three segments.", teammateRef: "sable", betId: "bet-1",
    }, options);
    appendConversationMessage({
      ventureId: first.id, role: "founder", content: "Start with the first one.", teammateRef: "sable", betId: "bet-1",
    }, options);
    appendConversationMessage({
      ventureId: first.id, role: "teammate", content: "I have the first draft staged.", teammateRef: "sable", betId: "bet-1",
    }, options);
    appendConversationMessage({
      ventureId: first.id,
      role: "system",
      kind: "handoff",
      content: "Work landed on the canvas — 1 bet opened.",
      teammateRef: "sable",
      changes: { openedBetIds: ["bet-2", "bet-2"], stagedBetIds: [], wallBetIds: [] },
    }, options);

    assert.deepEqual(listConversation(first.id, options).map(({ role, kind, content, changes }) => ({ role, kind, content, changes })), [
      { role: "founder", kind: "message", content: "Find our first buyer", changes: null },
      { role: "teammate", kind: "message", content: "I found three segments.", changes: null },
      { role: "founder", kind: "message", content: "Start with the first one.", changes: null },
      { role: "teammate", kind: "message", content: "I have the first draft staged.", changes: null },
      {
        role: "system",
        kind: "handoff",
        content: "Work landed on the canvas — 1 bet opened.",
        changes: { openedBetIds: ["bet-2"], stagedBetIds: [], wallBetIds: [] },
      },
    ]);
    assert.deepEqual(listConversation(second.id, options), []);
  });

  it("travels with the venture bundle and survives a reload on another root", () => {
    const source = freshRoot();
    const venture = createVenture({ name: "Portable chat" }, source);
    appendConversationMessage({
      ventureId: venture.id, role: "founder", content: "Keep the chat with the venture", teammateRef: "operator",
    }, source);

    const destination = freshRoot();
    importVenture(exportVenture(venture.id, source), destination);

    const [message] = listConversation(venture.id, destination);
    assert.equal(message.content, "Keep the chat with the venture");
    assert.equal(message.role, "founder");
  });

  it("persists explicit firm, bet, work, and participant targeting as conversation context", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Scoped direction" }, options);
    appendConversationMessage({
      ventureId: venture.id,
      role: "founder",
      content: "Tighten this offer with both perspectives.",
      teammateRef: "yara",
      betId: "bet-signal",
      target: {
        betId: "bet-signal",
        workRef: "staged-offer",
        teammateRefs: ["yara", "reed", "yara"],
      },
    }, options);

    assert.deepEqual(listConversation(venture.id, options)[0].target, {
      betId: "bet-signal",
      workRef: "staged-offer",
      teammateRefs: ["yara", "reed"],
    });
  });

  it("keeps only portable journey-import metadata in the Thread", () => {
    const options = freshRoot();
    const venture = createVenture({ name: "Observed journey" }, options);
    appendConversationMessage({
      ventureId: venture.id,
      role: "founder",
      content: "Map this observed journey.",
      attachments: [{
        kind: "journey-import",
        importRef: "journey-import:abc",
        name: "observed.csv",
        mediaType: "text/csv",
        byteSize: 64,
        digest: "digest-abc",
        rawRows: [{ session: "person-one" }],
      }],
    }, options);

    assert.deepEqual(listConversation(venture.id, options)[0].attachments, [{
      kind: "journey-import",
      importRef: "journey-import:abc",
      name: "observed.csv",
      mediaType: "text/csv",
      byteSize: 64,
      digest: "digest-abc",
    }]);
  });
});
