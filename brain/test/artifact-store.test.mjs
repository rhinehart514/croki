import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  fileForArtifact, isValidRef, listArtifacts, parseFrontmatter, readArtifact, writeArtifact,
} from "../src/artifact-store.mjs";

let dir;
const opts = () => ({ claudeDir: dir });

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-artifacts-"));
  fs.mkdirSync(path.join(dir, "agents"), { recursive: true });
  fs.mkdirSync(path.join(dir, "skills", "positioning"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "agents", "gtm-find.md"),
    "---\nname: gtm-find\ndescription: Find real prospects.\ntools: WebSearch, WebFetch\nmodel: sonnet\n---\n\n# gtm-find\n\nBody here.\n",
  );
  fs.writeFileSync(
    path.join(dir, "skills", "positioning", "SKILL.md"),
    "---\nname: positioning\ndescription: Sharpen the claim.\n---\n\n# positioning\n",
  );
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("artifact path safety", () => {
  it("accepts plain slugs, rejects traversal and junk", () => {
    assert.equal(isValidRef("gtm-find"), true);
    assert.equal(isValidRef("gtm_enrich2"), true);
    assert.equal(isValidRef("../etc/passwd"), false);
    assert.equal(isValidRef("a/b"), false);
    assert.equal(isValidRef("with.dot"), false);
    assert.equal(isValidRef(""), false);
  });

  it("a valid ref resolves strictly inside the artifact root", () => {
    const file = fileForArtifact("agent", "gtm-find", opts());
    assert.ok(file.startsWith(path.join(dir, "agents") + path.sep));
    assert.equal(fileForArtifact("skill", "positioning", opts()), path.join(dir, "skills", "positioning", "SKILL.md"));
  });

  it("a traversal ref throws rather than escaping the root", () => {
    assert.throws(() => fileForArtifact("agent", "../../evil", opts()), /Invalid artifact ref/);
  });
});

describe("frontmatter parse (summary only, never re-serialized)", () => {
  it("pulls name/description/tools/model and the body", () => {
    const { meta, body } = parseFrontmatter("---\nname: x\ndescription: \"quoted\"\ntools: A, B\n---\n\nbody\n");
    assert.equal(meta.name, "x");
    assert.equal(meta.description, "quoted");
    assert.equal(meta.tools, "A, B");
    assert.match(body, /body/);
  });
  it("no frontmatter → empty meta, body is the whole text", () => {
    const { meta, body } = parseFrontmatter("# just a heading\n");
    assert.deepEqual(meta, {});
    assert.match(body, /just a heading/);
  });
});

describe("list / read / write", () => {
  it("lists agents and skills with summaries", () => {
    const { agents, skills } = listArtifacts(opts());
    assert.equal(agents.length, 1);
    assert.equal(agents[0].ref, "gtm-find");
    assert.equal(agents[0].tools, "WebSearch, WebFetch");
    assert.equal(skills.length, 1);
    assert.equal(skills[0].ref, "positioning");
  });

  it("reads the full raw markdown of an existing agent", () => {
    const a = readArtifact("agent", "gtm-find", opts());
    assert.equal(a.exists, true);
    assert.match(a.content, /Body here/);
    assert.equal(a.meta.model, "sonnet");
  });

  it("returns a create scaffold (exists:false) for an unknown ref", () => {
    const a = readArtifact("agent", "gtm-draft", opts());
    assert.equal(a.exists, false);
    assert.match(a.content, /name: gtm-draft/);
    assert.match(a.content, /tools:/);
  });

  it("writes the full file back, round-trips, and creates a new skill dir", () => {
    const updated = "---\nname: gtm-find\ndescription: Edited.\ntools: WebSearch\nmodel: opus\n---\n\n# gtm-find\n\nNew body.\n";
    writeArtifact("agent", "gtm-find", updated, opts());
    assert.match(readArtifact("agent", "gtm-find", opts()).content, /New body/);

    writeArtifact("skill", "distribute", "---\nname: distribute\ndescription: Ship it.\n---\n\n# distribute\n", opts());
    const sk = readArtifact("skill", "distribute", opts());
    assert.equal(sk.exists, true);
    assert.match(sk.content, /Ship it/);
  });

  it("refuses an empty write", () => {
    assert.throws(() => writeArtifact("agent", "gtm-find", "   ", opts()), /non-empty/);
  });
});
