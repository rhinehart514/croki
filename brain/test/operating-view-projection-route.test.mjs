import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "operating-view-projection-route-"));
process.env.GTM_IDE_HOME = HOME;
process.env.HOST = "127.0.0.1";

const probe = net.createServer();
probe.listen(0, "127.0.0.1");
await once(probe, "listening");
const PORT = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
process.env.PORT = String(PORT);

const { createProject } = await import("../src/project-store.mjs");
const { addClarity } = await import("../src/clarity-store.mjs");
const { appendOperatorEvent, createOperatorSession, saveOperatorSession } = await import("../src/operator-store.mjs");
const { resultStore } = await import("../src/gtm-store.mjs");
const { server } = await import("../src/server.mjs");
if (!server.listening) await once(server, "listening");
const base = `http://127.0.0.1:${PORT}`;

after(async () => {
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(HOME, { recursive: true, force: true });
});

describe("GET operating view — production canvas projection", () => {
  it("returns question positions plus project-isolated outcome and implication entries", async () => {
    const { project } = createProject({ name: "Route Alpha" });
    const { project: other } = createProject({ name: "Route Other" });
    const question = addClarity(project.id, { kind: "question", text: "What blocks activation?" });
    const session = createOperatorSession({ goal: "Investigate", projectId: project.id, questionId: question.id });
    saveOperatorSession(appendOperatorEvent(session, {
      id: "route-position",
      type: "crew_position",
      data: { position: { questionId: question.id, statement: "The first action is hidden.", relation: "challenges" } },
    }));
    const outcome = resultStore.create({
      projectId: project.id,
      joinKey: "route-alpha-outcome",
      outcomeKind: "activation",
      body: "Founders could not find the first useful action.",
      productImplication: {
        body: "Expose the first useful action earlier in onboarding.",
        authorRef: { type: "teammate", id: session.id },
        artifactRef: { type: "operator-event", id: "route-position" },
      },
      questionId: question.id,
      source: "founder-entered",
    });
    resultStore.create({ projectId: other.id, joinKey: "other-outcome", outcomeKind: "reply", body: "Other only", source: "founder-entered" });

    const response = await fetch(`${base}/api/operating-view?project=${project.id}`);
    assert.equal(response.status, 200);
    const canvas = (await response.json()).woven.canvas;
    const questionAnchor = canvas.anchors.find((item) => item.ref.type === "question" && item.ref.id === question.id);
    assert.equal(questionAnchor.body.positions[0].statement, "The first action is hidden.");
    assert.deepEqual(canvas.outcomes.map((item) => item.id), [outcome.id]);
    assert.equal(canvas.outcomes[0].kind, "product-activation");
    assert.equal(canvas.outcomes[0].label, "Founders could not find the first useful action.");
    assert.equal(canvas.outcomes[0].questionId, question.id);
    assert.deepEqual(canvas.implications.map((item) => item.authority.sourceOutcomeRef.id), [outcome.id]);
    assert.equal(canvas.implications[0].text, "Expose the first useful action earlier in onboarding.");
    assert.equal(canvas.implications[0].disposition, "proposed");
    assert.equal(canvas.outcomes.some((item) => item.body === "Other only"), false);
  });

  it("returns honest empty outcome and implication arrays for a fresh project", async () => {
    const { project } = createProject({ name: "Route Empty" });
    const response = await fetch(`${base}/api/operating-view?project=${project.id}`);
    assert.equal(response.status, 200);
    const canvas = (await response.json()).woven.canvas;
    assert.equal(canvas.state.kind, "empty");
    assert.deepEqual(canvas.outcomes, []);
    assert.deepEqual(canvas.implications, []);
  });
});
