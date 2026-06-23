import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { generateOpportunities, saveGeneratedOpportunities, updateOpportunity } from "../src/opportunity-engine.mjs";
import { buildProductUnderstanding } from "../src/product-understanding.mjs";
import { createProject, loadProject } from "../src/project-store.mjs";
import { scanRepo } from "../src/scan.mjs";

// A fake ideator stands in for the live subscription: it returns raw proposals the way the
// model would, so the host's grounding + normalization + persistence are tested without a
// real model call. This mirrors how step-runners.mjs is tested with fakes.
function fakeIdeator(proposals) {
  return async () => ({ ok: true, items: proposals });
}

describe("ideation-driven opportunity studio", () => {
  let parent;
  let repo;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-opportunities-"));
    repo = path.join(parent, "product");
    fs.mkdirSync(repo);
    fs.writeFileSync(path.join(repo, "app.ts"), `
      const inviteCode = params.get("ref");
      await analytics.track("project_created", { projectId, inviteCode });
    `);
    options = { root: path.join(parent, "state") };
    createProject({ name: "Product" }, options);
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("grounding reports cited reality with no GTM signal taxonomy", () => {
    const report = scanRepo(repo, { winEvent: "project_created" });
    const grounding = buildProductUnderstanding(report);
    assert.ok(!("signals" in grounding), "grounding must not carry a hardcoded signal taxonomy");
    assert.ok(grounding.evidence.length > 0, "grounding still carries reproducible cited evidence");
    assert.equal(grounding.winEvent.name, "project_created");
  });

  it("normalizes ideation proposals; demotes evidence-free 'derived' to speculative", async () => {
    const report = scanRepo(repo, { winEvent: "project_created" });
    const generated = await generateOpportunities(report, {
      ideate: fakeIdeator([
        { type: "channel", title: "Referral loop", objective: "loop", rationale: "real", origin: "derived",
          evidence: [{ label: "invite", file: "app.ts", line: 2, text: "params.get(\"ref\")" }] },
        { type: "channel", title: "A bet", objective: "bet", rationale: "unproven", origin: "speculative", evidence: [] },
        { type: "channel", title: "Bad derived", objective: "x", rationale: "y", origin: "derived", evidence: [] },
        { type: "agent", title: "Researcher", objective: "research", rationale: "needed", provider: "claude", prompt: "Research." },
      ]),
    });
    const derived = generated.items.filter((i) => i.type === "channel" && i.origin === "derived");
    const speculative = generated.items.filter((i) => i.type === "channel" && i.origin === "speculative");
    assert.ok(derived.some((i) => i.title === "Referral loop"));
    assert.ok(derived.every((i) => i.evidence.length > 0), "derived channels must carry evidence");
    // "Bad derived" claimed derived with no evidence — demoted so the truth/bet line never blurs.
    assert.ok(speculative.some((i) => i.title === "Bad derived"));
    assert.ok(generated.items.some((i) => i.type === "agent" && i.provider === "claude"));
    assert.equal(generated.ideation.proposed, 4);
    assert.equal(generated.ideation.kept, 4);
  });

  it("the blank default fabricates nothing", async () => {
    const report = scanRepo(repo, { winEvent: "project_created" });
    const generated = await generateOpportunities(report);
    assert.deepEqual(generated.items, []);
    assert.equal(generated.ideation.blank, true);
  });

  it("persists founder review decisions and edits", async () => {
    const report = scanRepo(repo, { winEvent: "project_created" });
    const studio = await saveGeneratedOpportunities(report, {
      ...options,
      ideate: fakeIdeator([
        { type: "channel", title: "Referral loop", objective: "loop", rationale: "real", origin: "derived",
          evidence: [{ label: "invite", file: "app.ts", line: 2, text: "ref" }] },
      ]),
    });
    const channel = studio.items.find((item) => item.type === "channel");
    const updated = updateOpportunity(channel.id, {
      status: "accepted",
      objective: "Use the existing invite path as an attributable referral loop.",
    }, options);
    assert.equal(updated.status, "accepted");
    assert.match(updated.objective, /attributable referral/);
    assert.equal(loadProject(options).opportunities.items.find((item) => item.id === channel.id).status, "accepted");
  });
});
