import assert from "node:assert/strict";
import test from "node:test";

import { diffFirmConfigurations } from "../../src/firm/configuration-diff.mjs";

test("firm configuration diffs ignore revisions and key participants by stable ref", () => {
  const before = {
    id: "firm", revision: 3, updatedAt: "before",
    presentation: { participantLabel: "teammate" },
    agents: [
      { ref: "sable", name: "Sable", capabilities: { additional: [] } },
      { ref: "reed", name: "Reed", capabilities: { additional: [] } },
    ],
  };
  const after = {
    id: "firm", revision: 4, updatedAt: "after",
    presentation: { participantLabel: "teammate" },
    agents: [
      { ref: "reed", name: "Reed", capabilities: { additional: [] } },
      { ref: "sable", name: "Sable", capabilities: { additional: ["independent verification"] } },
    ],
  };

  assert.deepEqual(diffFirmConfigurations(before, after), [{
    path: "agents.sable.capabilities.additional",
    before: [],
    after: ["independent verification"],
  }]);
});
