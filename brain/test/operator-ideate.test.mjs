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

// Angles as a proposer would derive them for one goal — injected test data, never a house list.
const FAKE_ANGLES = [
  { angle: "who-it-tempts", lens: "start from the buyer it tempts most." },
  { angle: "where-its-seen", lens: "start from where it gets seen." },
  { angle: "scarcity-side", lens: "start from what is genuinely scarce here." },
];

// A generator that produces one decidable idea per angle. The pitch is a real pitch (it never embeds
// the angle name — the runtime must keep slugs out of founder-facing text, so the fixture can't smuggle
// one in). A DIFFERENT function from the bar by construction — composeIdeas refuses a shared function.
const PITCH_BY_ANGLE = {
  "who-it-tempts": "Chase the ten agencies already asking for this.",
  "where-its-seen": "Post the offer where the users already gather.",
  "scarcity-side": "Hoard the one scarce onboarding slot and auction it.",
};
function fakeGenerator() {
  return async function generate({ angle }) {
    return { ideas: [{
      pitch: PITCH_BY_ANGLE[angle] ?? "A concrete move for this product.",
      what: angle === "who-it-tempts" ? "an audience to chase" : "an offer",
      upside: "It starts from something real.",
      risk: "It may be too small to notice.",
    }] };
  };
}

// A SEPARATE critic. Kills the scarce-slot pitch, survives the rest, and carries the
// plain-line reason every kill must have. Never grades its own output.
function fakeBar() {
  return async function bar({ idea }) {
    const pitch = typeof idea === "string" ? idea : idea?.pitch || "";
    const killed = /scarce/i.test(pitch);
    return {
      barScore: killed ? 2.1 : 7.4,
      verdict: killed ? "killed" : "survived",
      killed,
      killReason: killed ? "It would not move anyone to act on this goal." : null,
      take: killed ? "It would not move anyone to act on this goal." : "A real move with a clear next step.",
      axes: { moves_the_goal: killed ? 2 : 8 },
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

  const ideateOptions = () => ({
    ...options,
    ideaGenerator: fakeGenerator(),
    ideaBar: fakeBar(),
    ideaDistinct: fakeDistinct,
    ideaAngles: FAKE_ANGLES,
  });

  it("exposes ideate as an operator tool, honestly described (bar derived from the goal, cuts revivable)", () => {
    const tool = operatorTools.find((t) => t.name === "ideate");
    assert.ok(tool, "ideate is an operator tool");
    assert.match(tool.description, /DERIVED from the founder's stated goal/);
    assert.match(tool.description, /revive/);
  });

  it("generates, grades with a separate critic, persists, and pauses with survivors AND the cut list", async () => {
    const session = createOperatorSession({ goal: "Get 5 pilot conversations without paid ads.", projectId: "default" }, options);

    const paused = await runOperatorSession(session.id, {
      options: ideateOptions(),
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

    // Survivors carry the decision texture the founder judges on — not just a pitch string.
    const survivor = paused.pendingIdeas.ideas[0];
    assert.ok(survivor.upside, "a survivor carries its strongest reason for");
    assert.ok(survivor.risk, "a survivor carries its strongest reason against");
    assert.ok(survivor.what, "a survivor says what kind of move it is");

    // The CUT ideas are retained and inspectable — each with a plain-line reason, none silently culled.
    assert.ok(Array.isArray(paused.pendingIdeas.cut), "the pause carries the cut list");
    assert.equal(paused.pendingIdeas.cut.length, paused.pendingIdeas.killedCount);
    for (const entry of paused.pendingIdeas.cut) {
      assert.ok(entry.pitch, "a cut idea keeps its pitch");
      assert.ok(entry.reason, "a cut idea carries the reason it was cut");
    }

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

  it("founder-facing run events speak plain progress, never the rig", async () => {
    const session = createOperatorSession({ goal: "Run the 50%-off X post.", projectId: "default" }, options);
    const paused = await runOperatorSession(session.id, {
      options: ideateOptions(),
      client: fakeClient([{ content: [{ type: "tool_use", id: "i", name: "ideate", input: {} }] }]),
    });

    const ideating = paused.events.find((event) => event.type === "operator_ideating");
    const proposed = paused.events.find((event) => event.type === "ideas_proposed");
    assert.match(ideating.detail, /Coming up with/);
    assert.match(proposed.title, /worth your look/);
    assert.match(proposed.detail, /set aside/);
    for (const text of [ideating.title, ideating.detail, proposed.title, proposed.detail]) {
      assert.doesNotMatch(text, /angle|critic|bar|floor|survivor|distinct/i, `machinery leaked into: ${text}`);
    }
  });

  it("on zero survivors, the pause says what happened and offers another side — not 'cleared the bar'", async () => {
    const session = createOperatorSession({ goal: "Find a wedge.", projectId: "default" }, options);
    const killAll = async ({ idea }) => ({
      barScore: 1, verdict: "killed", killed: true,
      killReason: "It restates the goal instead of moving it.", axes: { moves_the_goal: 1 },
    });
    const paused = await runOperatorSession(session.id, {
      options: { ...ideateOptions(), ideaBar: killAll },
      client: fakeClient([{ content: [{ type: "tool_use", id: "i", name: "ideate", input: {} }] }]),
    });
    assert.equal(paused.pendingIdeas.ideas.length, 0);
    assert.equal(paused.pendingIdeas.cut.length, 3, "every cut idea remains inspectable");
    const proposed = paused.events.find((event) => event.type === "ideas_proposed");
    assert.match(proposed.title, /No ideas made the cut/);
    assert.match(proposed.detail, /another side/);
    assert.doesNotMatch(proposed.detail, /bar|floor/i);
  });

  it("a plain text resume is refused while ideas wait — the founder must pick or kill", async () => {
    const session = createOperatorSession({ goal: "Find a wedge.", projectId: "default" }, options);
    await runOperatorSession(session.id, {
      options: ideateOptions(),
      client: fakeClient([{ content: [{ type: "tool_use", id: "i", name: "ideate", input: {} }] }]),
    });
    assert.throws(() => resumeOperatorSession(session.id, "just go", { options }), /Pick or kill/);
  });

  it("the founder kills weak ideas and picks one to build — a founder act, off the agent surface", async () => {
    const session = createOperatorSession({ goal: "Land a design partner.", projectId: "default" }, options);
    const paused = await runOperatorSession(session.id, {
      options: ideateOptions(),
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
    // The resume instruction tells the operator to build the picked idea through compose_and_run —
    // but that steering prompt stays backstage: the founder-visible event narrates the decision plainly.
    const lastMessage = resolved.modelMessages.at(-1);
    assert.match(lastMessage.content, /compose_and_run/);
    const resolvedEvent = resolved.events.find((event) => event.type === "ideas_resolved");
    assert.doesNotMatch(resolvedEvent.detail, /compose_and_run|idea_id|compose_new/);
    assert.match(resolvedEvent.detail, /stops at your gate/);

    // The founder's kill is durable: the killed idea is dead in the store and unwireable.
    if (killId) {
      const killedIdea = getGtmIdea(killId, options);
      assert.equal(killedIdea.killed, true, "the founder's kill marked the idea dead");
      assert.equal(killedIdea.buildWiring, null);
    }

    // Let the relaunched drive settle so the temp dir is not torn down mid-write.
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  it("the founder can REVIVE a bar-cut idea by building it — the founder's call beats the bar's", async () => {
    const session = createOperatorSession({ goal: "Land a design partner.", projectId: "default" }, options);
    const paused = await runOperatorSession(session.id, {
      options: ideateOptions(),
      client: fakeClient([{ content: [{ type: "tool_use", id: "i", name: "ideate", input: {} }] }]),
    });
    const cutEntry = paused.pendingIdeas.cut[0];
    assert.ok(cutEntry, "the bar cut the scarcity-angle idea");
    assert.equal(getGtmIdea(cutEntry.id, options).killed, true);

    const resolved = resolveOperatorIdeas(session.id, { build: [cutEntry.id], kill: [] }, {
      options,
      client: fakeClient([{ content: [{ type: "tool_use", id: "done", name: "complete", input: { outcome: "achieved", summary: "Built the revived idea." } }] }]),
    });

    const revivedIdea = getGtmIdea(cutEntry.id, options);
    assert.equal(revivedIdea.killed, false, "the revived idea is alive again");
    assert.equal(revivedIdea.buildWiring?.kind, "compose_and_run", "the revived idea is wired to build");
    const lastMessage = resolved.modelMessages.at(-1);
    assert.match(lastMessage.content, /compose_and_run/);

    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  it("a founder kill in the same payload cannot be built OR revived — kill wins", async () => {
    const session = createOperatorSession({ goal: "Land a design partner.", projectId: "default" }, options);
    const paused = await runOperatorSession(session.id, {
      options: ideateOptions(),
      client: fakeClient([{ content: [{ type: "tool_use", id: "i", name: "ideate", input: {} }] }]),
    });
    const target = paused.pendingIdeas.ideas[0];
    const resolved = resolveOperatorIdeas(session.id, { build: [target.id], kill: [target.id] }, {
      options,
      client: fakeClient([{ content: [{ type: "tool_use", id: "done", name: "complete", input: { outcome: "achieved", summary: "Nothing built." } }] }]),
    });
    assert.equal(getGtmIdea(target.id, options).killed, true);
    const resolvedEvent = resolved.events.find((event) => event.type === "ideas_resolved");
    assert.deepEqual(resolvedEvent.data.built, []);
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  it("directions mode: kept ideas land in the shared kernel AS WHAT THEY ARE — no generator slug in belief text", async () => {
    const session = createOperatorSession({ goal: "Find the first ICP.", projectId: "default" }, options);
    const paused = await runOperatorSession(session.id, {
      options: ideateOptions(),
      client: fakeClient([{ content: [{ type: "tool_use", id: "i", name: "ideate", input: {} }] }]),
    });
    const survivors = paused.pendingIdeas.ideas;
    const kept = survivors[0];

    const resolved = resolveOperatorIdeas(session.id, {
      build: kept.id,
      kill: survivors[1] ? [survivors[1].id] : [],
      mode: "directions",
    }, {
      options,
      client: fakeClient([{ content: [{ type: "tool_use", id: "done", name: "complete", input: { outcome: "achieved", summary: "Recommended the first probe." } }] }]),
    });

    // The resume instruction is direction-shaped: it must NOT tell the operator to compose pipelines.
    const lastMessage = resolved.modelMessages.at(-1);
    assert.match(lastMessage.content, /DIRECTIONS/);
    assert.match(lastMessage.content, /do NOT compose pipelines/);
    assert.doesNotMatch(lastMessage.content, /Build each with compose_and_run/);
    // And the founder-visible event narrates the keep plainly, not as the steering prompt.
    const resolvedEvent = resolved.events.find((event) => event.type === "ideas_resolved");
    assert.doesNotMatch(resolvedEvent.detail, /icp\.hypotheses|compose_and_run/);

    // The kept idea landed in the ONE shared kernel every future composition reads — recorded as what
    // it actually is (the generator's own words), with no generator slug polluting the belief text.
    const { loadProject } = await import("../src/project-store.mjs");
    const project = loadProject({ ...options, projectId: "default" });
    const hypotheses = project.sharedContext?.icp?.hypotheses ?? [];
    const line = hypotheses.find((entry) => entry.includes(kept.pitch));
    assert.ok(line, "the kept idea's pitch is recorded in shared context");
    assert.match(line, /^An audience to chase:/, "the belief line leads with what the idea is, in the generator's own words");
    assert.doesNotMatch(line, /\[[a-z-]+\]/, "no bracketed generator slug in stored belief text");
    for (const angle of FAKE_ANGLES) {
      assert.ok(!line.includes(angle.angle), `the generator slug ${angle.angle} leaked into belief text`);
    }

    // No channel was created for the kept idea — the kernel holds the belief, not a per-idea object.
    assert.equal((project.channels ?? []).length, 0, "directions mode never mints channels");

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
