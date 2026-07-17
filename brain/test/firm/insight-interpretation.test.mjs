import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createInsightInterpretation, supersedeInsightInterpretation } from "../../src/firm/insight-interpretation.mjs";

const evidence = [{ kind: "conversation", id: "message-one" }];

describe("InsightInterpretation", () => {
  it("keeps model interpretation tentative and source-bearing", () => {
    const insight = createInsightInterpretation({ id: "insight-one", ventureId: "venture-one", statement: "This may matter.", subjectRefs: ["object:one"], evidenceRefs: evidence, proposedBy: { authority: "agent", id: "codex" } });
    assert.equal(insight.assertion, "tentative");
    assert.deepEqual(insight.sourceRefs, ["conversation:message-one"]);
    assert.equal(insight.properties.evidenceRefs[0].ventureId, "venture-one");
    assert.throws(() => { insight.statement = "changed"; }, TypeError);
  });

  it("refuses evidence that claims a foreign venture", () => {
    assert.throws(
      () => createInsightInterpretation({ id: "crossed", ventureId: "venture-one", statement: "Claim", subjectRefs: ["object:one"], evidenceRefs: [{ kind: "conversation", id: "message-one", ventureId: "venture-two" }], proposedBy: { authority: "agent" } }),
      (error) => error.code === "insight_interpretation_cross_scope",
    );
  });

  it("accepts a string evidence ref and scopes it to this venture", () => {
    const insight = createInsightInterpretation({ id: "string-ev", ventureId: "venture-one", statement: "Cited.", subjectRefs: ["object:one"], evidenceRefs: ["conversation:message-one"], proposedBy: { authority: "agent" } });
    assert.deepEqual(insight.sourceRefs, ["conversation:message-one"]);
    assert.equal(insight.properties.evidenceRefs[0].ventureId, "venture-one");
  });

  it("refuses founder assertion spoofing and preserves explicit supersession", () => {
    assert.throws(
      () => createInsightInterpretation({ id: "bad", ventureId: "venture-one", statement: "Claim", subjectRefs: ["object:one"], evidenceRefs: evidence, assertion: "founder-asserted", proposedBy: { authority: "agent" } }),
      (error) => error.code === "insight_interpretation_authority",
    );
    const prior = createInsightInterpretation({ id: "prior", ventureId: "venture-one", statement: "First", subjectRefs: ["object:one"], evidenceRefs: evidence, proposedBy: { authority: "agent" } });
    const lineage = supersedeInsightInterpretation(prior, { id: "next", ventureId: "venture-one", statement: "Next", subjectRefs: ["object:one"], evidenceRefs: evidence, proposedBy: { authority: "agent" } });
    assert.equal(lineage.previous.status, "superseded");
    assert.deepEqual(lineage.next.supersedes, ["insight:prior"]);
  });
});
