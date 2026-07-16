import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { appendConversationMessage } from "../../src/firm/conversation.mjs";
import { createBet } from "../../src/firm/bet.mjs";
import { getArchitecture, getArchitectureState } from "../../src/firm/architecture.mjs";
import { buildArchitectureProjection } from "../../src/firm/architecture-projection.mjs";
import { decideArchitectureProposal, recordWorkingTheory } from "../../src/firm/architecture-proposals.mjs";
import { driveTeammate } from "../../src/firm/work-loop.mjs";
import { readRepositoryExcerpt, searchRepository } from "../../src/firm/truth.mjs";
import { createVenture, getVentureDoc, listVentureDocs, setVentureDoc } from "../../src/firm/venture-store.mjs";

function directory(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function fixture() {
  const options = { root: directory("drover-theory-store-") };
  const repository = directory("drover-theory-repo-");
  fs.mkdirSync(path.join(repository, "src"));
  fs.writeFileSync(path.join(repository, "src", "onboarding.mjs"), [
    "export function firstRun(user) {",
    "  if (!user.workspace) return 'configure';",
    "  return user.firstResult ?? 'empty';",
    "}",
  ].join("\n"));
  const venture = createVenture({ name: "Working theory", repository }, options);
  return { options, repository, venture };
}

describe("working theory grounding and identity", () => {
  it("searches and cites only exact repository paths under the venture root", () => {
    const fx = fixture();
    const search = searchRepository(fx.repository, { query: "firstResult", include: ["src/*.mjs"] });
    assert.equal(search.matches[0].path, "src/onboarding.mjs");
    assert.equal(search.matches[0].line, 3);
    const source = readRepositoryExcerpt(fx.repository, { file: "src/onboarding.mjs", startLine: 1, endLine: 3 });
    assert.match(source.ref, /^repository:src\/onboarding\.mjs#L1-L3:[a-f0-9]{12}$/);
    assert.match(source.excerpt, /firstResult/);
    assert.throws(() => readRepositoryExcerpt(fx.repository, { file: "../outside.txt", startLine: 1 }), (error) => error.code === "repository_path_invalid");
    assert.throws(() => readRepositoryExcerpt(fx.repository, { file: ".env", startLine: 1 }), (error) => error.code === "repository_path_invalid");
  });

  it("stores a source-bearing current theory beside proposals without changing durable architecture", () => {
    const fx = fixture();
    const direction = appendConversationMessage({ ventureId: fx.venture.id, role: "founder", content: "Help this venture grow." }, fx.options);
    const source = readRepositoryExcerpt(fx.repository, { file: "src/onboarding.mjs", startLine: 1, endLine: 3 });
    const first = recordWorkingTheory({
      ventureId: fx.venture.id,
      baseRevision: 0,
      intent: "Make first value happen before setup",
      operations: [
        { op: "upsert-subject", id: "first-value", value: { name: "First useful result", statement: "A visible first result may matter more than configuration." } },
        { op: "upsert-subject", id: "self-serve", value: { name: "A self-serve path", statement: "People may need a useful result without setup expertise." } },
        { op: "upsert-relationship", id: "result-unlocks-path", value: { fromRef: "theory:first-value", toRef: "theory:self-serve", label: "may unlock" } },
      ],
      anchors: [
        { subjectRef: "theory:first-value", sourceRefs: [source.ref] },
        { subjectRef: "theory:self-serve", sourceRefs: [`conversation:${direction.id}`] },
      ],
      sources: [source],
      conversationRefs: [`conversation:${direction.id}`],
      proposedBy: { authority: "agent", id: "coordinator" },
    }, fx.options);
    assert.equal(first.theory.mode, "working-theory");
    assert.equal(first.theory.status, "current");
    assert.equal(first.theory.subjects[0].assertion, "tentative");
    assert.equal(getArchitecture(fx.venture.id, fx.options).revision, 0);
    const projection = buildArchitectureProjection(fx.venture.id, fx.options);
    assert.equal(projection.workingTheory.id, first.theory.id);
    assert.equal(projection.workingTheory.subjects.length, 2);
    assert.equal(projection.workingTheory.operations, undefined);
    assert.throws(
      () => decideArchitectureProposal({ ventureId: fx.venture.id, proposalId: first.theory.id, decision: "accept", actor: { authority: "founder" } }, fx.options),
      (error) => error.code === "working_theory_not_decidable",
    );
  });

  it("supersedes atomically and preserves unchanged subject identity during a correction", () => {
    const fx = fixture();
    const direction = appendConversationMessage({ ventureId: fx.venture.id, role: "founder", content: "Agencies are not the buyer." }, fx.options);
    const source = readRepositoryExcerpt(fx.repository, { file: "src/onboarding.mjs", startLine: 1, endLine: 3 });
    const first = recordWorkingTheory({
      ventureId: fx.venture.id, baseRevision: 0, intent: "Reach agencies", operations: [
        { op: "upsert-subject", id: "buyer", value: { name: "Agencies", statement: "Agencies may be the buyer." } },
        { op: "upsert-subject", id: "first-value", value: { name: "First value", statement: "First value may be unclear." } },
      ],
      anchors: [{ subjectRef: "theory:buyer", sourceRefs: [source.ref] }, { subjectRef: "theory:first-value", sourceRefs: [source.ref] }],
      sources: [source], proposedBy: { authority: "agent", id: "coordinator" },
    }, fx.options);
    const corrected = recordWorkingTheory({
      ventureId: fx.venture.id, baseRevision: 0, intent: "Reach operators directly", supersedes: first.theory.id,
      operations: [{ op: "upsert-subject", id: "buyer", value: { name: "Operators", statement: "Operators, not agencies, may own the live problem." } }],
      anchors: [{ subjectRef: "theory:buyer", sourceRefs: [`conversation:${direction.id}`] }],
      conversationRefs: [`conversation:${direction.id}`], proposedBy: { authority: "agent", id: "coordinator" }, requiredSubjectId: "buyer",
    }, fx.options);
    const state = getArchitectureState(fx.venture.id, fx.options);
    assert.equal(state.proposals.find((entry) => entry.id === first.theory.id).status, "superseded");
    assert.equal(corrected.theory.status, "current");
    assert.equal(corrected.theory.subjects.find((entry) => entry.id === "first-value").id, "first-value");
    assert.equal(corrected.theory.subjects.find((entry) => entry.id === "buyer").name, "Operators");
    assert.throws(() => recordWorkingTheory({
      ventureId: fx.venture.id, baseRevision: 0, intent: "Stale", supersedes: first.theory.id,
      operations: [{ op: "upsert-subject", id: "buyer", value: { name: "Stale", statement: "Stale" } }],
      anchors: [{ subjectRef: "theory:buyer", sourceRefs: [source.ref] }], proposedBy: { authority: "agent" },
    }, fx.options), (error) => error.code === "working_theory_stale");
  });

  it("reports complete only after repository grounding, current theory, and anchored inspectable work exist", async () => {
    const fx = fixture();
    let firstTheoryId;
    let stableWorkRef;
    const runtime = {
      id: "working-theory-runtime",
      label: "Working theory runtime",
      supportsAbort: true,
      costReporting: "none",
      async drive(context) {
        if (context.system.includes("Selected provisional theory subject")) {
          const correction = await context.runTool({ name: "record_working_theory", input: {
            baseRevision: 0,
            intent: "Operators own the problem directly",
            supersedes: firstTheoryId,
            operations: [{ op: "upsert-subject", id: "buyer", value: { name: "Operators", statement: "Operators, not agencies, may own the live problem." } }],
            anchors: [{ subjectRef: "theory:buyer", sourceRefs: [`work:${stableWorkRef}`] }],
          } });
          firstTheoryId = correction.result.theoryId;
          return { kind: "completed", summary: "corrected" };
        }
        const excerpt = await context.runTool({ name: "read_repository_excerpt", input: { file: "src/onboarding.mjs", startLine: 1, endLine: 3 } });
        const first = await context.runTool({ name: "record_working_theory", input: {
          baseRevision: 0,
          intent: "Find a clearer first result",
          operations: [{ op: "upsert-subject", id: "buyer", value: { name: "Agencies", statement: "Agencies may need a clearer first result." } }],
          anchors: [{ subjectRef: "theory:buyer", sourceRefs: [excerpt.result.citation] }],
        } });
        firstTheoryId = first.result.theoryId;
        const opened = await context.runTool({ name: "fork_bet", input: { intent: "Trace signup to the first visible result" } });
        await context.runTool({ name: "get_taste", input: {} });
        const staged = await context.runTool({ name: "stage_artifact", input: { betId: opened.result.id, title: "First-result trace", content: "Signup currently stops at configuration." } });
        stableWorkRef = staged.result.id;
        const current = await context.runTool({ name: "record_working_theory", input: {
          baseRevision: 0,
          intent: "Find a clearer first result",
          supersedes: firstTheoryId,
          operations: [{ op: "upsert-subject", id: "buyer", value: { name: "Agencies", statement: "Agencies may need a clearer first result." } }],
          anchors: [{ subjectRef: "theory:buyer", sourceRefs: [excerpt.result.citation, `work:${stableWorkRef}`] }],
        } });
        firstTheoryId = current.result.theoryId;
        return { kind: "completed", summary: "grounded and working" };
      },
    };
    const initial = await driveTeammate({
      ventureId: fx.venture.id, teammateRef: "coordinator", goal: "Help this venture grow.", initiatedBy: "founder", options: fx.options, deps: { runtime },
    });
    assert.equal(initial.completion.state, "complete");
    assert.equal(initial.completion.grounding.satisfied, true);
    assert.deepEqual(initial.completion.usefulWork.workRefs, [stableWorkRef]);
    assert.equal(buildArchitectureProjection(fx.venture.id, fx.options).workingTheory.joins.work[0].id, stableWorkRef);

    const corrected = await driveTeammate({
      ventureId: fx.venture.id, teammateRef: "coordinator", goal: "Agencies are not the buyer.", initiatedBy: "founder",
      target: { theoryId: firstTheoryId, theorySubjectId: "buyer", teammateRefs: [] }, options: fx.options, deps: { runtime },
    });
    assert.equal(corrected.completion.state, "complete");
    assert.equal(corrected.completion.usefulWork.workRefs[0], stableWorkRef);
    const [bet] = listVentureDocs(fx.venture.id, "bets", fx.options);
    assert.equal(getVentureDoc(fx.venture.id, "bets", bet.id, fx.options).staged[0].id, stableWorkRef);
  });

  it("scopes a correction to a provisional relationship while preserving its subjects and work", async () => {
    const fx = fixture();
    const source = readRepositoryExcerpt(fx.repository, { file: "src/onboarding.mjs", startLine: 1, endLine: 3 });
    const bet = createBet({ ventureId: fx.venture.id, intent: "Inspect the path to first value", teammateRef: "coordinator" });
    const work = {
      id: "work-first-value-trace",
      title: "First-value trace",
      content: "Signup currently stops at configuration.",
      ownerRefs: ["coordinator"],
      stagedAt: "2026-07-15T12:00:00.000Z",
      updatedAt: "2026-07-15T12:00:00.000Z",
    };
    setVentureDoc(fx.venture.id, "bets", bet.id, { ...bet, staged: [work] }, fx.options);
    const first = recordWorkingTheory({
      ventureId: fx.venture.id,
      baseRevision: 0,
      intent: "A clearer result may unlock self-serve adoption",
      operations: [
        { op: "upsert-subject", id: "first-value", value: { name: "First value", statement: "People need a useful first result." } },
        { op: "upsert-subject", id: "self-serve", value: { name: "Self-serve adoption", statement: "People may continue without setup help." } },
        { op: "upsert-relationship", id: "value-unlocks-adoption", value: { fromRef: "theory:first-value", toRef: "theory:self-serve", label: "may unlock" } },
      ],
      anchors: [
        { subjectRef: "theory:first-value", sourceRefs: [source.ref] },
        { subjectRef: "theory:self-serve", sourceRefs: [source.ref] },
        { subjectRef: "theory-relationship:value-unlocks-adoption", sourceRefs: [source.ref, `work:${work.id}`] },
      ],
      sources: [source],
      proposedBy: { authority: "agent", id: "coordinator" },
    }, fx.options);
    const runtime = {
      id: "relationship-correction-runtime",
      label: "Relationship correction runtime",
      costReporting: "none",
      async drive(context) {
        assert.match(context.system, /Selected provisional theory relationship/);
        await context.runTool({ name: "record_working_theory", input: {
          baseRevision: 0,
          intent: "The result earns exploration before it earns adoption",
          supersedes: first.theory.id,
          operations: [{
            op: "upsert-relationship",
            id: "value-unlocks-adoption",
            value: { fromRef: "theory:first-value", toRef: "theory:self-serve", label: "may earn further exploration before adoption" },
          }],
          anchors: [{ subjectRef: "theory-relationship:value-unlocks-adoption", sourceRefs: [`work:${work.id}`] }],
        } });
        return { kind: "completed", summary: "relationship corrected" };
      },
    };

    const result = await driveTeammate({
      ventureId: fx.venture.id,
      teammateRef: "coordinator",
      goal: "The first result earns exploration, not adoption yet.",
      initiatedBy: "founder",
      target: { theoryId: first.theory.id, theoryRelationshipId: "value-unlocks-adoption", teammateRefs: [] },
      options: fx.options,
      deps: { runtime },
    });

    assert.equal(result.completion.state, "complete");
    assert.deepEqual(result.completion.usefulWork.workRefs, [work.id]);
    const current = buildArchitectureProjection(fx.venture.id, fx.options).workingTheory;
    assert.equal(current.supersedes, first.theory.id);
    assert.deepEqual(current.subjects.map((subject) => subject.id), ["first-value", "self-serve"]);
    assert.equal(current.relationships[0].id, "value-unlocks-adoption");
    assert.match(current.relationships[0].label, /exploration before adoption/);
    assert.equal(current.joins.work[0].id, work.id);
    const founderMessage = listVentureDocs(fx.venture.id, "conversation", fx.options).find((message) => message.role === "founder");
    assert.equal(founderMessage.target.theoryRelationshipId, "value-unlocks-adoption");
  });
});
