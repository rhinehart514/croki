import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  appendInput,
  listInputs,
  listUnroutedInputs,
  loadInputStore,
  markRouted,
} from "../src/inputs-store.mjs";

describe("durable, append-only inputs", () => {
  let parent;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-inputs-"));
    options = { root: parent };
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("appends a world signal and reloads it, defaulting to unrouted", () => {
    const input = appendInput("rodentradar", {
      kind: "signup",
      source: "landing-page",
      payload: { email: "founder@example.com" },
      provenance: "webhook:stripe",
    }, options);

    assert.equal(input.projectId, "rodentradar");
    assert.equal(input.kind, "signup");
    assert.equal(input.source, "landing-page");
    assert.equal(input.status, "unrouted");
    assert.equal(input.routedTo, null);
    assert.ok(input.id.startsWith("input-"));
    assert.ok(input.receivedAt);

    const reloaded = loadInputStore("rodentradar", options);
    assert.equal(reloaded.inputs.length, 1);
    assert.equal(reloaded.inputs[0].id, input.id);
    assert.equal(reloaded.schemaVersion, 1);
  });

  it("requires a kind and a source", () => {
    assert.throws(() => appendInput("p", { source: "x" }, options), /kind is required/);
    assert.throws(() => appendInput("p", { kind: "star" }, options), /source is required/);
  });

  it("is append-only and preserves order across many writes", () => {
    appendInput("p", { kind: "commit", source: "github" }, options);
    appendInput("p", { kind: "star", source: "github" }, options);
    appendInput("p", { kind: "reply", source: "gmail" }, options);

    const all = listInputs("p", options);
    assert.equal(all.length, 3);
    assert.deepEqual(all.map((entry) => entry.kind), ["commit", "star", "reply"]);
  });

  it("filters by kind, source, and status", () => {
    appendInput("p", { kind: "commit", source: "github" }, options);
    appendInput("p", { kind: "star", source: "github" }, options);
    appendInput("p", { kind: "reply", source: "gmail" }, options);

    assert.equal(listInputs("p", { ...options, source: "github" }).length, 2);
    assert.equal(listInputs("p", { ...options, kind: "reply" }).length, 1);
    assert.equal(listInputs("p", { ...options, status: "unrouted" }).length, 3);
  });

  it("routes an input to a target and drops it from the unrouted queue", () => {
    const a = appendInput("p", { kind: "signup", source: "landing-page" }, options);
    const b = appendInput("p", { kind: "signup", source: "landing-page" }, options);

    assert.equal(listUnroutedInputs("p", options).length, 2);

    const routed = markRouted("p", a.id, "run:outbound-2026", options);
    assert.equal(routed.status, "routed");
    assert.equal(routed.routedTo, "run:outbound-2026");

    const remaining = listUnroutedInputs("p", options);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].id, b.id);
  });

  it("marks an input ignored with no target", () => {
    const a = appendInput("p", { kind: "star", source: "github" }, options);
    const ignored = markRouted("p", a.id, null, { ...options, ignored: true });
    assert.equal(ignored.status, "ignored");
    assert.equal(ignored.routedTo, null);
    assert.equal(listUnroutedInputs("p", options).length, 0);
  });

  it("rejects routing with no target unless ignored", () => {
    const a = appendInput("p", { kind: "star", source: "github" }, options);
    assert.throws(() => markRouted("p", a.id, null, options), /routedTo target/);
  });

  it("throws for an unknown input id", () => {
    assert.throws(() => markRouted("p", "input-missing", "run:x", options), /Input not found/);
  });

  it("scopes inputs per project", () => {
    appendInput("alpha", { kind: "commit", source: "github" }, options);
    appendInput("beta", { kind: "reply", source: "gmail" }, options);

    assert.equal(listInputs("alpha", options).length, 1);
    assert.equal(listInputs("beta", options).length, 1);
    assert.equal(listInputs("alpha", options)[0].kind, "commit");
  });
});
