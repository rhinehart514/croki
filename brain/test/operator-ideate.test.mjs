import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createOperatorSession } from "../src/operator-store.mjs";
import {
  operatorTools,
  resolveOperatorIdeas,
  resumeOperatorSession,
  runOperatorSession,
} from "../src/operator-runtime.mjs";
import { listGtmIdeas, getGtmIdea } from "../src/idea-store.mjs";
import { assertSafeTool, safeOperatorTools } from "../src/operator-mcp.mjs";

function fakeClient(responses) {
  let index = 0;
  return {
    messages: {
      async create() {
        const response = responses[index];
        index += 1;
        if (!response) throw new Error("Unexpected extra model turn.");
        return response;
      },
    },
  };
}

// A generator that produces one pitch per angle, tagged so the bar can split survivors from kills.
// A DIFFERENT function from the bar by construction — composeIdeas refuses a shared function.
function fakeGenerator() {
  return async function generate({ angle }) {
    return { ideas: [`A concrete move from the ${angle} angle for this product.`] };
  };
}

// A SEPARATE critic. Kills anything from the scarcity angle, survives the rest. Never grades its own
// output — it only ever sees pitches the generator made.
function fakeBar() {
  return async function bar({ idea }) {
    const pitch = typeof idea === "string" ? idea : idea?.pitch || "";
    const killed = /scarcity/.test(pitch);
    return {
      barScore: killed ? 2.1 : 7.4,
      verdict: killed ? "killed" : "survived",
      killed,
      axes: { showable: killed ? 2 : 8, demo_is_core: killed ? 3 : 7, loop_able: 6, edge: 6, differentiation: 6, distinctiveness: 6 },
    };
  };
}

// Keep distinctiveness deterministic and offline — never huddled, so no regen loop, no shelling out.
function fakeDistinct() {
  return { available: true, batch_distinctiveness: 0.8, verdict: "DISTINCT", huddled: false };
}

describe("operator ideate move", () => {
  let parent;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-operator-ideate-"));
    options = { root: path.join(parent, "state") };
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("exposes ideate as an operator tool", () => {
    assert.ok(operatorTools.some((tool) => tool.name === "ideate"), "ideate is an operator tool");
  });

  it("generates, grades with a separate critic, persists, and pauses with survivors for the founder", async () => {
    const session = createOperatorSession({ goal: "Get 5 pilot conversations without paid ads.", projectId: "default" }, options);

    const paused = await runOperatorSession(session.id, {
      options: {
        ...options,
        ideaGenerator: fakeGenerator(),
        ideaBar: fakeBar(),
        ideaDistinct: fakeDistinct,
      },
      client: fakeClient([{
        content: [{ type: "tool_use", id: "ideate-1", name: "ideate", input: {} }],
      }]),
    });

    // It PAUSES for the founder — it never builds on its own.
    assert.equal(paused.status, "waiting_for_ideas");
    assert.ok(paused.pendingIdeas, "the session carries the pending ideas");
    assert.ok(paused.pendingIdeas.ideas.length > 0, "survivors are surfaced to the founder");
    assert.ok(paused.pendingIdeas.killedCount >= 1, "the bar killed at least the scarcity-angle idea");
    assert.ok(paused.events.some((event) => event.type === "operator_ideating"));
    assert.ok(paused.events.some((event) => event.type === "ideas_proposed"));

    // Survivors are persisted with build wiring pre-loaded into compose_and_run; killed ideas are
    // persisted too (so they are not re-proposed) but never wired.
    const ideas = listGtmIdeas({ ...options, projectId: "default" });
    const survivors = ideas.filter((idea) => !idea.killed);
    const killed = ideas.filter((idea) => idea.killed);
    assert.ok(survivors.length > 0 && killed.length > 0, "both survivors and kills are durable");
    for (const idea of survivors) {
      assert.equal(idea.buildWiring?.kind, "compose_and_run", "each survivor is pre-wired to the build door");
      assert.ok(idea.buildWiring.goal, "the wiring carries the idea as the build goal");
    }
    for (const idea of killed) {
      assert.equal(idea.buildWiring, null, "a killed idea is never wired into a build");
    }
  });

  it("a plain text resume is refused while ideas wait — the founder must pick or kill", async () => {
    const session = createOperatorSession({ goal: "Find a wedge.", projectId: "default" }, options);
    await runOperatorSession(session.id, {
      options: { ...options, ideaGenerator: fakeGenerator(), ideaBar: fakeBar(), ideaDistinct: fakeDistinct },
      client: fakeClient([{ content: [{ type: "tool_use", id: "i", name: "ideate", input: {} }] }]),
    });
    assert.throws(() => resumeOperatorSession(session.id, "just go", { options }), /Pick or kill/);
  });

  it("the founder kills weak ideas and picks one to build — a founder act, off the agent surface", async () => {
    const session = createOperatorSession({ goal: "Land a design partner.", projectId: "default" }, options);
    const paused = await runOperatorSession(session.id, {
      options: { ...options, ideaGenerator: fakeGenerator(), ideaBar: fakeBar(), ideaDistinct: fakeDistinct },
      client: fakeClient([{ content: [{ type: "tool_use", id: "i", name: "ideate", input: {} }] }]),
    });
    assert.equal(paused.status, "waiting_for_ideas");
    const survivors = paused.pendingIdeas.ideas;
    const buildId = survivors[0].id;
    const killId = survivors[1]?.id ?? null;

    const resolved = resolveOperatorIdeas(session.id, {
      build: buildId,
      kill: killId ? [killId] : [],
    }, {
      options,
      client: fakeClient([{ content: [{ type: "tool_use", id: "done", name: "complete", input: { outcome: "achieved", summary: "Built the founder's pick." } }] }]),
    });

    assert.equal(resolved.status, "ready");
    assert.equal(resolved.pendingIdeas, null);
    assert.ok(resolved.events.some((event) => event.type === "ideas_resolved"));
    // The resume instruction tells the operator to build the picked idea through compose_and_run.
    const lastMessage = resolved.modelMessages.at(-1);
    assert.match(lastMessage.content, /compose_and_run/);

    // The founder's kill is durable: the killed idea is dead in the store and unwireable.
    if (killId) {
      const killedIdea = getGtmIdea(killId, options);
      assert.equal(killedIdea.killed, true, "the founder's kill marked the idea dead");
      assert.equal(killedIdea.buildWiring, null);
    }

    // Let the relaunched drive settle so the temp dir is not torn down mid-write.
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  it("resolving ideas requires a session actually holding proposed ideas", () => {
    const session = createOperatorSession({ goal: "No ideas yet.", projectId: "default" }, options);
    assert.throws(() => resolveOperatorIdeas(session.id, { build: "x" }, { options }), /no proposed ideas/i);
  });

  it("keeps idea verdicts off the agent (MCP) surface, while ideate stays available", () => {
    // ideate itself is exposed — it only generates and pauses.
    assert.doesNotThrow(() => assertSafeTool("ideate"));
    assert.ok(safeOperatorTools().some((tool) => tool.name === "ideate"), "the MCP door exposes ideate");
    // A kill/keep/verdict tool would be a founder act leaking onto the agent door — refused.
    assert.throws(() => assertSafeTool("kill_idea"), /founder act/);
    assert.throws(() => assertSafeTool("idea_verdict"), /founder act/);
    assert.throws(() => assertSafeTool("keep_idea"), /founder act/);
    // resolveOperatorIdeas is not a tool at all — the MCP bridge can never call it.
    assert.ok(!safeOperatorTools().some((tool) => /resolve.*idea/i.test(tool.name)));
  });
});
