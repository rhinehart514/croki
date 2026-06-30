// The microproduct producer — the leg that emits { artifactSpec, artifactFiles } for a deployable
// artifact cut from the real product. These tests exercise the host plumbing (normalize → validate →
// honest blank/empty errors) and the wall (the producer is a read-only data producer with NO deploy
// path), with a FAKE producer/subscription. The artifact execute connector (tested separately) stages
// whatever this returns behind the founder gate.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MICROPRODUCT_PROMPT,
  normalizeMicroproduct,
  produceMicroproduct,
  createClaudeMicroproductProducer,
} from "../src/microproduct-composer.mjs";
import { createClaudeMicroproductInvoker } from "../src/agent-bridge.mjs";
import { run as runArtifactConnector } from "../src/connectors/execute/artifact.mjs";

// A fake producer that returns a small static landing microproduct, mirroring the live producer's
// { ok, artifactSpec, artifactFiles } contract.
function fakeLandingProducer({ goal, grounding } = {}) {
  return {
    ok: true,
    artifactSpec: { name: "rodent-radar-demo", kind: "landing", summary: "A demo landing page.", entry: "index.html" },
    artifactFiles: [
      { path: "index.html", contents: `<!doctype html><title>${goal || "Demo"}</title>` },
      { path: "README.md", contents: "# Demo\nWhat it is." },
    ],
    __sawGrounding: grounding,
  };
}

describe("MICROPRODUCT_PROMPT — the producer's doctrine", () => {
  it("asks for the { artifactSpec, artifactFiles } shape", () => {
    assert.match(MICROPRODUCT_PROMPT, /artifactSpec/);
    assert.match(MICROPRODUCT_PROMPT, /artifactFiles/);
    assert.match(MICROPRODUCT_PROMPT, /"path"/);
    assert.match(MICROPRODUCT_PROMPT, /"contents"/);
  });

  it("leashes product claims to the scan but lets the GTM framing run free (truth wall in artifact form)", () => {
    assert.match(MICROPRODUCT_PROMPT, /Do NOT invent/);
    assert.match(MICROPRODUCT_PROMPT, /grounding/);
  });

  it("keeps the wall explicit — produces files, never deploys/publishes/pushes", () => {
    assert.match(MICROPRODUCT_PROMPT, /THE WALL/);
    assert.match(MICROPRODUCT_PROMPT, /never deploy|never deploys|do NOT.*deploy/i);
    // No instruction to auto-deploy may be offered.
    assert.match(MICROPRODUCT_PROMPT, /founder gate|founder approval/i);
  });
});

describe("normalizeMicroproduct — host shaping of the produced artifact", () => {
  it("passes through a clean spec + files", () => {
    const out = normalizeMicroproduct({
      artifactSpec: { name: "x", kind: "tool" },
      artifactFiles: [{ path: "index.html", contents: "<html>" }],
    });
    assert.deepEqual(out.artifactSpec, { name: "x", kind: "tool" });
    assert.equal(out.artifactFiles.length, 1);
    assert.equal(out.artifactFiles[0].path, "index.html");
  });

  it("drops malformed files (no path or no string body) — never half-staged", () => {
    const out = normalizeMicroproduct({
      artifactFiles: [
        { path: "index.html", contents: "<html>" },
        { path: "", contents: "orphan body" },
        { path: "no-body.md" },
        { contents: "no path" },
        "not-an-object",
        null,
      ],
    });
    assert.equal(out.artifactFiles.length, 1);
    assert.equal(out.artifactFiles[0].path, "index.html");
  });

  it("accepts a `content` alias and de-dupes repeated paths", () => {
    const out = normalizeMicroproduct({
      artifactFiles: [
        { path: "a.md", content: "first" },
        { path: "a.md", contents: "second (dropped — path already seen)" },
        { path: "b.md", contents: "" },
      ],
    });
    assert.equal(out.artifactFiles.length, 2);
    assert.equal(out.artifactFiles[0].contents, "first");
    assert.equal(out.artifactFiles[1].contents, ""); // an empty string body is valid, only null/undefined is dropped
  });

  it("returns a null spec when the producer omitted one (no fabrication)", () => {
    const out = normalizeMicroproduct({ artifactFiles: [{ path: "i.html", contents: "x" }] });
    assert.equal(out.artifactSpec, null);
  });
});

describe("produceMicroproduct — host orchestration", () => {
  it("returns the normalized { artifactSpec, artifactFiles } for a goal", async () => {
    const out = await produceMicroproduct(
      { goal: "Get 5 pilot conversations", grounding: { headline: "RodentRadar" } },
      { produce: fakeLandingProducer },
    );
    assert.equal(out.artifactSpec.kind, "landing");
    assert.equal(out.artifactFiles.length, 2);
    assert.match(out.artifactFiles[0].contents, /Get 5 pilot conversations/);
  });

  it("folds the scan grounding through to the producer (artifact is scan-grounded, not invented)", async () => {
    let seen = null;
    await produceMicroproduct(
      { goal: "g", grounding: { winEvent: { name: "project_created" } } },
      { produce: (input) => { seen = input.grounding; return fakeLandingProducer(input); } },
    );
    assert.deepEqual(seen, { winEvent: { name: "project_created" } });
  });

  it("throws an honest blocked error on the blank default (no subscription)", async () => {
    await assert.rejects(
      () => produceMicroproduct({ goal: "g" }),
      /needs a live Claude subscription/,
    );
  });

  it("throws an honest error when the producer returns no usable files (never a silent empty artifact)", async () => {
    await assert.rejects(
      () => produceMicroproduct({ goal: "g" }, { produce: () => ({ ok: true, artifactFiles: [{ path: "" }] }) }),
      /no usable files/,
    );
  });

  it("surfaces a producer failure as an honest error", async () => {
    await assert.rejects(
      () => produceMicroproduct({ goal: "g" }, { produce: () => ({ ok: false, error: "limit reached" }) }),
      /limit reached/,
    );
  });
});

describe("createClaudeMicroproductProducer — the live producer wired to a (fake) subscription", () => {
  it("builds a grounded prompt and returns the parsed artifact (injected invoke)", async () => {
    let prompt = null;
    const produce = createClaudeMicroproductProducer({
      invoke: async (input) => {
        prompt = input.prompt;
        return {
          ok: true,
          artifactSpec: { name: "calc", kind: "calculator" },
          artifactFiles: [{ path: "index.html", contents: "<html>calc</html>" }],
        };
      },
    });
    const result = await produce({ goal: "Show ROI", grounding: { stack: ["next.config.mjs"] } });
    assert.equal(result.ok, true);
    assert.equal(result.artifactSpec.kind, "calculator");
    assert.match(prompt, /MICROPRODUCT|microproduct|Show ROI/);
    assert.match(prompt, /next\.config\.mjs/); // grounding folded into the prompt
  });

  it("returns an honest failure when the subscription leg fails", async () => {
    const produce = createClaudeMicroproductProducer({ invoke: async () => ({ ok: false, error: "no result" }) });
    const result = await produce({ goal: "g" });
    assert.equal(result.ok, false);
    assert.match(result.error, /no result/);
  });
});

describe("createClaudeMicroproductInvoker — the read-only subscription leg (the wall)", () => {
  it("parses { artifactSpec, artifactFiles } out of the model's reply via an injected runQuery", async () => {
    const invoke = createClaudeMicroproductInvoker({
      runQuery: async () => ({
        text: 'Here you go:\n```json\n{ "artifactSpec": { "name": "demo" }, "artifactFiles": [ { "path": "index.html", "contents": "<html>" } ] }\n```',
        error: null,
        toolCalls: ["Read"],
      }),
    });
    const out = await invoke({ prompt: "build it" });
    assert.equal(out.ok, true);
    assert.equal(out.artifactSpec.name, "demo");
    assert.equal(out.artifactFiles.length, 1);
    assert.equal(out.artifactFiles[0].path, "index.html");
  });

  it("drops a file with no path or no body (never half-staged)", async () => {
    const invoke = createClaudeMicroproductInvoker({
      runQuery: async () => ({
        text: '{ "artifactFiles": [ { "path": "ok.html", "contents": "x" }, { "path": "", "contents": "y" }, { "path": "z.md" } ] }',
        error: null,
      }),
    });
    const out = await invoke({ prompt: "p" });
    assert.equal(out.artifactFiles.length, 1);
    assert.equal(out.artifactFiles[0].path, "ok.html");
  });

  it("surfaces a subscription error honestly (e.g. a quota limit), with no artifact", async () => {
    const invoke = createClaudeMicroproductInvoker({
      runQuery: async () => ({ text: "", error: { message: "limit reached", kind: "limit", retriable: true } }),
    });
    const out = await invoke({ prompt: "p" });
    assert.equal(out.ok, false);
    assert.match(out.error, /limit reached/);
  });

  it("fails honestly when the reply has no JSON object", async () => {
    const invoke = createClaudeMicroproductInvoker({
      runQuery: async () => ({ text: "I couldn't build it.", error: null }),
    });
    const out = await invoke({ prompt: "p" });
    assert.equal(out.ok, false);
    assert.match(out.error, /did not return a JSON/);
  });
});

describe("the wall: a produced microproduct only deploys after a founder gate approval", () => {
  it("stages the produced files (deployed:false) and never deploys on its own", async () => {
    // Produce the artifact, then hand it to the artifact execute connector exactly as a run would —
    // as an UN-approved upstream item. The connector must stage nothing past the gate.
    const { artifactSpec, artifactFiles } = await produceMicroproduct(
      { goal: "g", grounding: {} },
      { produce: fakeLandingProducer },
    );
    const unapproved = [{ artifactSpec, artifactFiles, approved: false }];
    const held = await runArtifactConnector({ config: { target: "preview" } }, unapproved);
    assert.equal(held.items.length, 0, "nothing stages without a founder gate approval");
    assert.equal(held.meta.deployed, 0);

    // Only an item the founder gate marked approved gets staged — and even then it is staged, never deployed.
    const approved = [{ artifactSpec, artifactFiles, approved: true }];
    const staged = await runArtifactConnector({ config: { target: "preview" } }, approved);
    assert.equal(staged.items.length, 1);
    assert.equal(staged.items[0].deployed, false);
    assert.equal(staged.items[0].live, false);
    assert.equal(staged.items[0].deployStatus, "awaiting founder approval to deploy");
    assert.deepEqual(staged.items[0].artifact.files, artifactFiles);
  });
});
