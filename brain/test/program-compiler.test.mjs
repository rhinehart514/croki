import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { compileChannelProgram } from "../src/program-compiler.mjs";
import { listAgentCreationPolicies } from "../src/agent-policy-store.mjs";
import { listOutcomePrograms } from "../src/program-store.mjs";

// The opportunity object is gone: a program is compiled straight from a plain CHANNEL SPEC the
// founder or Claude defined, plus plain AGENT SPECS. No status, evidence, provenance, or review
// state is read off them — they are just the channel's intent.
describe("compileChannelProgram", () => {
  let parent;
  let options;
  let project;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-compile-channel-"));
    options = { root: parent, projectId: "project-a" };
    project = {
      id: "project-a",
      name: "GTM IDE",
      sharedContext: {
        version: 3,
        founderTaste: { policies: ["Be concrete."], rejectedPatterns: ["generic compliment"] },
        outcomes: [],
        productFeedback: [],
        experiments: [],
      },
    };
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("compiles a plain channel spec into an active-able program and mints its agents", () => {
    const channel = {
      id: "channel-design-partners",
      title: "Technical founder design partners",
      objective: "Book technical founder conversations.",
      kind: "outbound",
    };
    const agents = [
      { ref: "proof-extraction", title: "Proof Extraction Agent", objective: "Extract product proof.", prompt: "Find real proof." },
      { ref: "buyer-research", title: "Buyer Research Agent", objective: "Research the buyer.", prompt: "Research." },
    ];

    const { program, agents: compiled } = compileChannelProgram({ project, channel, agents }, options);

    assert.equal(program.name, channel.title);
    assert.equal(program.projectId, "project-a");
    assert.equal(compiled.length, 2);
    // Each compiled agent carries its plain spec, a creation policy, and a born instance.
    for (const entry of compiled) {
      assert.ok(entry.spec.ref);
      assert.ok(entry.policy.id);
      assert.ok(entry.instance.id);
      assert.ok(entry.profile.id);
    }

    // The program and its creation policies are persisted.
    assert.equal(listOutcomePrograms("project-a", options).length, 1);
    assert.equal(listAgentCreationPolicies("project-a", options).length, 2);
  });

  it("compiles a channel with no agents", () => {
    const channel = { id: "channel-content", title: "Content loop", objective: "Publish what founders read." };
    const { program, agents } = compileChannelProgram({ project, channel }, options);
    assert.equal(program.name, "Content loop");
    assert.deepEqual(agents, []);
  });

  it("is idempotent — re-compiling the same channel reuses the program", () => {
    const channel = { id: "channel-content", title: "Content loop", objective: "Publish." };
    const first = compileChannelProgram({ project, channel }, options);
    const second = compileChannelProgram({ project, channel }, options);
    assert.equal(first.program.id, second.program.id);
    assert.equal(listOutcomePrograms("project-a", options).length, 1);
  });

  it("rejects a missing project or channel", () => {
    assert.throws(() => compileChannelProgram({ channel: { id: "c", title: "x" } }, options), /project is required/i);
    assert.throws(() => compileChannelProgram({ project }, options), /channel spec is required/i);
  });
});
