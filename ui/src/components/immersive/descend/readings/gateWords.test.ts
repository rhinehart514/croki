import { describe, it, expect } from "vitest";
import { interpretGateWords } from "./gateWords";

describe("interpretGateWords", () => {
  it("reads release words", () => {
    for (const w of ["send it", "release", "ship it", "go", "make it real", "yes send", "publish"]) {
      expect(interpretGateWords(w)).toBe("release");
    }
  });

  it("reads hold words", () => {
    for (const w of ["hold it", "wait", "not yet", "hold off for now", "cancel", "stop"]) {
      expect(interpretGateWords(w)).toBe("hold");
    }
  });

  it("reads authorize words (deploy arming)", () => {
    for (const w of ["authorize", "authorise it", "arm the deploy", "approve the deploy"]) {
      expect(interpretGateWords(w)).toBe("authorize");
    }
  });

  it("treats negated sends as hold, never release", () => {
    for (const w of ["don't send", "do not send yet", "no, hold it", "not yet — don't ship"]) {
      expect(interpretGateWords(w)).toBe("hold");
    }
  });

  it("returns unknown for empty or ambiguous input", () => {
    for (const w of ["", "   ", "hmm", "what does this do", "maybe"]) {
      expect(interpretGateWords(w)).toBe("unknown");
    }
  });
});
