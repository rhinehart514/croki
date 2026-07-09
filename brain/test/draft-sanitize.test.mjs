import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sanitizeDraft } from "../src/connectors/draft/claude.mjs";

// A drafting model sometimes leaves a raw merge token in the message it hands back — "Hi [first name],"
// or "how [company] handles this". Those blanks used to survive all the way to the founder gate, where a
// visible "[first name]" reads as broken. sanitizeDraft is the deterministic last pass that fills the
// token from the known prospect or, when the data isn't there, removes the bracket and heals the text so
// the founder never sees a placeholder.
describe("sanitizeDraft — no raw merge token reaches the gate", () => {
  it("fills [first name] from the prospect's name when known", () => {
    const out = sanitizeDraft("Hi [first name], I saw your work.", { name: "Ada Lovelace" });
    assert.equal(out, "Hi Ada, I saw your work.");
  });

  it("fills {{ first_name }} and {company} shapes too", () => {
    const out = sanitizeDraft(
      "Hey {{ first_name }}, {company} is doing great things.",
      { name: "Bo", company: "Acme" },
    );
    assert.equal(out, "Hey Bo, Acme is doing great things.");
  });

  it("falls back to a natural greeting when no first name is available", () => {
    const out = sanitizeDraft("Hi [first name], quick note.", { name: "" });
    assert.equal(out, "Hi there, quick note.");
    assert.ok(!/[[{]/.test(out), "no bracket survives to the gate");
  });

  it("does not treat a URL/title 'name' as a first name — greeting stays generic", () => {
    const out = sanitizeDraft("Hello [first name], I noticed something.", {
      name: "https://example.com/blog/how-we-scaled",
    });
    assert.equal(out, "Hello there, I noticed something.");
  });

  it("drops an unfillable [company] token without leaving a bracket or ragged spacing", () => {
    const out = sanitizeDraft("I love what [company] is building lately.", { name: "Ada" });
    assert.equal(out, "I love what is building lately.");
    assert.ok(!/[[{]/.test(out), "no bracket survives");
    assert.ok(!/ {2,}/.test(out), "no double space left behind");
  });

  it("removes an unrecognized placeholder rather than showing it", () => {
    const out = sanitizeDraft("Your [some random thing] caught my eye.", {});
    assert.ok(!/[[{]/.test(out), "no bracket survives");
    assert.equal(out, "Your caught my eye.");
  });

  it("leaves a clean draft with no tokens untouched", () => {
    const clean = "Hi Ada, I loved your talk on lattices. Worth 15 minutes?";
    assert.equal(sanitizeDraft(clean, { name: "Ada" }), clean);
  });

  it("passes non-string drafts through unchanged (null on API failure)", () => {
    assert.equal(sanitizeDraft(null, { name: "Ada" }), null);
    assert.equal(sanitizeDraft("", { name: "Ada" }), "");
  });
});
