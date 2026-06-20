import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { runPipeline, defaultTemplate, listConnectors } from "../src/pipeline.mjs";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const BASE_ICP = {
  query: "SaaS founders building B2B analytics",
  keywords: ["founder", "analytics", "saas"],
};

const SCORE_STAGE = {
  id: "score", type: "score", connector: "default", label: "Score",
  config: { minFitScore: 0.5, keywords: ["founder", "analytics", "b2b"] },
};

const GATE_STAGE = {
  id: "gate", type: "gate", connector: "default", label: "Gate",
  config: {},
};

const ENRICH_STAGE = {
  id: "enrich", type: "enrich", connector: "clay", label: "Enrich",
  config: {},
};

function ch(id, label, stages) {
  return { id, label, stages };
}

// ─── Score stage ──────────────────────────────────────────────────────────────

describe("pipeline — score stage", () => {
  it("runs and produces ok result from ICP passthrough", async () => {
    const result = await runPipeline({
      icp: BASE_ICP,
      channels: [ch("a", "Test", [SCORE_STAGE])],
    });
    assert.ok(result.ok);
    const stage = result.channels[0].stages[0];
    assert.ok(stage.ok);
    assert.equal(typeof stage.meta?.total, "number");
  });

  it("filters items by minFitScore — icp items don't pass a keyword score filter", async () => {
    const result = await runPipeline({
      icp: BASE_ICP,
      channels: [ch("a", "Test", [{
        id: "score", type: "score", connector: "default", label: "Score",
        config: { minFitScore: 0.5, keywords: ["unicorn", "billionaire"] },
      }])],
    });
    assert.ok(result.ok);
    const stage = result.channels[0].stages[0];
    assert.ok(stage.ok);
    assert.equal(stage.items.length, 0); // icp item doesn't match unicorn/billionaire
  });
});

// ─── Gate stage ───────────────────────────────────────────────────────────────

describe("pipeline — gate stage", () => {
  it("marks all incoming items as gated", async () => {
    const result = await runPipeline({
      icp: BASE_ICP,
      channels: [ch("a", "Test", [GATE_STAGE])],
    });
    assert.ok(result.ok);
    const gate = result.channels[0].stages[0];
    assert.ok(gate.ok);
    assert.ok(gate.items.every((i) => i.gated), "all items should be gated");
  });
});

// ─── Clay enrich (pass-through stub) ─────────────────────────────────────────

describe("pipeline — clay enrich stub", () => {
  it("passes through prospects without throwing (stub, 0 prospects if no find stage)", async () => {
    const result = await runPipeline({
      icp: BASE_ICP,
      channels: [ch("a", "Test", [ENRICH_STAGE])],
    });
    // Clay is a stub — it only passes through items of type "prospect".
    // No find stage = no prospects upstream, so 0 items. Pipeline still ok.
    assert.ok(result.channels[0].ok);
    const enrich = result.channels[0].stages[0];
    assert.ok(enrich.ok);
    assert.equal(enrich.items.length, 0); // no prospect items from ICP passthrough
    assert.ok(enrich.meta?.stub);
  });
});

// ─── Find stage (requires EXA_API_KEY) ───────────────────────────────────────

describe("pipeline — find stage (requires EXA_API_KEY)", () => {
  let savedKey;

  beforeEach(() => { savedKey = process.env.EXA_API_KEY; delete process.env.EXA_API_KEY; });
  afterEach(() => {
    if (savedKey !== undefined) process.env.EXA_API_KEY = savedKey;
    else delete process.env.EXA_API_KEY;
  });

  it("fails with a clear error when EXA_API_KEY is missing", async () => {
    const result = await runPipeline({
      icp: BASE_ICP,
      channels: [ch("a", "Test", [{ id: "find", type: "find", connector: "exa", label: "Find", config: { limit: 3 } }])],
    });
    assert.equal(result.ok, false);
    assert.equal(result.channels[0].ok, false);
    const find = result.channels[0].stages[0];
    assert.ok(find.error?.includes("EXA_API_KEY"));
  });

  it("stops the channel at the failing stage, not the pipeline", async () => {
    const result = await runPipeline({
      icp: BASE_ICP,
      channels: [
        ch("a", "Failing", [
          { id: "find", type: "find", connector: "exa", label: "Find", config: { limit: 3 } },
          SCORE_STAGE,
          GATE_STAGE,
        ]),
        ch("b", "Passing", [GATE_STAGE]),
      ],
    });
    // Channel a fails at find, channel b succeeds
    assert.equal(result.channels[0].ok, false);
    assert.equal(result.channels[0].stages.length, 1); // stops at find
    assert.equal(result.channels[1].ok, true);
  });
});

// ─── Draft stage (requires ANTHROPIC_API_KEY) ─────────────────────────────────

describe("pipeline — draft stage (requires ANTHROPIC_API_KEY)", () => {
  let savedKey;

  beforeEach(() => { savedKey = process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_API_KEY; });
  afterEach(() => {
    if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey;
    else delete process.env.ANTHROPIC_API_KEY;
  });

  it("fails with a clear error when ANTHROPIC_API_KEY is missing", async () => {
    const result = await runPipeline({
      icp: BASE_ICP,
      channels: [ch("a", "Test", [
        { id: "draft", type: "draft", connector: "claude", label: "Draft", config: { senderName: "Jacob" } },
      ])],
    });
    assert.equal(result.ok, false);
    const draft = result.channels[0].stages[0];
    assert.ok(draft.error?.includes("ANTHROPIC_API_KEY"));
  });
});

// ─── Multi-channel parallel execution ────────────────────────────────────────

describe("pipeline — multi-channel", () => {
  it("runs two channels independently and returns results for each", async () => {
    const result = await runPipeline({
      icp: BASE_ICP,
      channels: [
        ch("email", "Cold email", [GATE_STAGE]),
        ch("linkedin", "LinkedIn", [SCORE_STAGE, GATE_STAGE]),
      ],
    });
    assert.ok(result.ok);
    assert.equal(result.channels.length, 2);
    assert.equal(result.channels[0].channelId, "email");
    assert.equal(result.channels[1].channelId, "linkedin");
    assert.ok(result.channels.every((c) => c.ok));
  });

  it("returns ok:false when any channel fails", async () => {
    const savedKey = process.env.EXA_API_KEY;
    delete process.env.EXA_API_KEY;
    try {
      const result = await runPipeline({
        icp: BASE_ICP,
        channels: [
          ch("good", "Good", [GATE_STAGE]),
          ch("bad", "Bad", [{ id: "find", type: "find", connector: "exa", label: "Find", config: {} }]),
        ],
      });
      assert.equal(result.ok, false);
      const good = result.channels.find((c) => c.channelId === "good");
      const bad  = result.channels.find((c) => c.channelId === "bad");
      assert.ok(good.ok);
      assert.equal(bad.ok, false);
    } finally {
      if (savedKey !== undefined) process.env.EXA_API_KEY = savedKey;
      else delete process.env.EXA_API_KEY;
    }
  });

  it("returns ok:true for empty channels array", async () => {
    const result = await runPipeline({ icp: BASE_ICP, channels: [] });
    assert.ok(result.ok);
    assert.deepEqual(result.channels, []);
  });
});

// ─── Connector registry ───────────────────────────────────────────────────────

describe("pipeline — connector registry", () => {
  it("listConnectors returns a non-empty array with expected fields", () => {
    const connectors = listConnectors();
    assert.ok(connectors.length > 0);
    for (const c of connectors) {
      assert.ok(c.id, `connector missing id`);
      assert.ok(c.type, `connector missing type`);
      assert.ok(c.name, `connector missing name`);
      assert.ok("configured" in c, `connector missing configured field`);
    }
  });

  it("unknown connector type produces a clear error and stops the channel", async () => {
    const result = await runPipeline({
      icp: BASE_ICP,
      channels: [ch("a", "Test", [{ id: "bad", type: "bogus", connector: "bogus", label: "Bad", config: {} }])],
    });
    assert.equal(result.ok, false);
    const stage = result.channels[0].stages[0];
    assert.ok(stage.error?.includes("bogus"), `expected error mentioning 'bogus', got: ${stage.error}`);
  });
});

// ─── Default template ─────────────────────────────────────────────────────────

describe("pipeline — defaultTemplate", () => {
  it("returns a pipeline with icp, channels, and context", () => {
    const t = defaultTemplate();
    assert.ok(t.id);
    assert.ok(t.name);
    assert.ok(t.icp?.query);
    assert.ok(Array.isArray(t.channels) && t.channels.length >= 1);
    assert.ok(t.context?.senderName);
  });

  it("every channel has at least find, draft, and gate stages", () => {
    const t = defaultTemplate();
    for (const ch of t.channels) {
      assert.ok(ch.id);
      assert.ok(ch.label);
      assert.ok(Array.isArray(ch.stages));
      const types = ch.stages.map((s) => s.type);
      assert.ok(types.includes("find"), `channel ${ch.id} missing find stage`);
      assert.ok(types.includes("draft"), `channel ${ch.id} missing draft stage`);
      assert.ok(types.includes("gate"), `channel ${ch.id} missing gate stage`);
    }
  });

  it("every stage has id, type, connector, label, and config", () => {
    const t = defaultTemplate();
    for (const ch of t.channels) {
      for (const stage of ch.stages) {
        assert.ok(stage.id, `stage missing id in channel ${ch.id}`);
        assert.ok(stage.type, `stage missing type in channel ${ch.id}`);
        assert.ok(stage.connector, `stage missing connector in channel ${ch.id}`);
        assert.ok(stage.label, `stage missing label in channel ${ch.id}`);
        assert.ok(stage.config !== undefined, `stage missing config in channel ${ch.id}`);
      }
    }
  });
});
