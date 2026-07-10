import { describe, it, expect } from "vitest";
import { humanizeSlugsInText, humanizeStepLabel, humanizeFieldLabel } from "./labels";

// The register boundary at the crew rail: a founder must NEVER read a raw kebab/snake machine slug in a
// teammate's speech or a step line. These guard the translator that rewrites embedded slugs to plain words
// while leaving the human prose around them untouched.
describe("humanizeSlugsInText — no machine slug survives in crew speech", () => {
  it("rewrites an embedded kebab slug inside a prose beat", () => {
    expect(humanizeSlugsInText("On it — identify-referral-partners-and-warm-users.")).toBe(
      "On it — identify referral partners and warm users.",
    );
  });

  it("rewrites the machinery done line's slug", () => {
    expect(humanizeSlugsInText("Completed identify-referral-partners · 3 items")).toBe(
      "Completed identify referral partners · 3 items",
    );
  });

  it("leaves already-human prose exactly as written (idempotent)", () => {
    const human = "Drafted 4 for your review.";
    expect(humanizeSlugsInText(human)).toBe(human);
    expect(humanizeSlugsInText("Reached the founder gate · 5 items awaiting release")).toBe(
      "Reached the founder gate · 5 items awaiting release",
    );
  });

  it("keeps an acronym-leading slug's caps", () => {
    expect(humanizeSlugsInText("seo-content-plan first")).toBe("SEO content plan first");
  });

  it("does NOT mangle an ordinary two-part hyphenated compound", () => {
    // "read-only" / "opt-in" are English, not machine ids — the {2,} extra-part floor protects them.
    expect(humanizeSlugsInText("this stays read-only here")).toBe("this stays read-only here");
  });

  it("empty in, empty out", () => {
    expect(humanizeSlugsInText("")).toBe("");
  });
});

describe("humanizeStepLabel — a prose title is cleaned of embedded slugs too", () => {
  it("humanizes a bare slug title", () => {
    expect(humanizeStepLabel("draft-referral-ask")).toBe("Draft referral ask");
  });

  it("cleans a slug riding inside a written title", () => {
    expect(humanizeStepLabel("On it — warm-inbound-users now")).toBe("On it — warm inbound users now");
  });

  it("leaves a plain written title untouched", () => {
    expect(humanizeStepLabel("Draft the outreach note")).toBe("Draft the outreach note");
  });
});

describe("humanizeFieldLabel — known and generic keys", () => {
  it("collapses value-prop aliases to one concept", () => {
    expect(humanizeFieldLabel("valueProposition")).toBe("Value proposition");
    expect(humanizeFieldLabel("value_prop")).toBe("Value proposition");
  });
});
