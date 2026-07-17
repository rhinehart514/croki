import { describe, expect, it } from "vitest";
import {
  deriveEpistemicState,
  CONSEQUENCE_PRESSURE,
  type EpistemicState,
} from "./deriveEpistemicState";
import type {
  FirmArchitectureEvidenceAnnotation,
  FirmArchitecturePressure,
  FirmArchitectureJoin,
  FirmTraceabilityGap,
} from "@/types";

// EXHAUSTIVE test of the 8-state precedence grammar (Drover Law 11). Every field VALUE and every ABSENCE
// is enumerated so the greyscale token test is non-vacuous: all eight states are reachable from real field
// values, and the precedence (first match wins) plus the brain-law asymmetries are pinned here.

const NOW = Date.parse("2026-07-17T00:00:00.000Z");
const PAST = "2020-01-01T00:00:00.000Z";
const FUTURE = "2099-01-01T00:00:00.000Z";

function annotation(stance: "supports" | "challenges", basis: FirmArchitectureEvidenceAnnotation["basis"]): FirmArchitectureEvidenceAnnotation {
  return { id: `a-${stance}-${basis}`, subjectRef: "object:x", evidenceRef: "evidence:1", stance, basis, note: "" };
}
function pressure(reason: FirmArchitecturePressure["reason"]): FirmArchitecturePressure {
  return { subjectId: "x", reason, detail: null };
}
function join(basis: FirmArchitectureJoin["basis"], extra: Partial<FirmArchitectureJoin> = {}): FirmArchitectureJoin {
  return { basis, causal: false, ...extra };
}

describe("deriveEpistemicState — reachability of all eight states from real field values", () => {
  const cases: Array<[EpistemicState, Parameters<typeof deriveEpistemicState>[0], Parameters<typeof deriveEpistemicState>[1]]> = [
    ["contested", {}, { pressure: [pressure("challenged-claim")] }],
    ["stale", {}, { pressure: [pressure("stale-source")] }],
    ["unsupported", {}, { pressure: [pressure("missing-evidence")] }],
    ["historical", { bounds: { endsAt: PAST } }, { now: NOW }],
    ["measured", {}, { outcomeJoins: [join("exact")] }],
    ["repository-backed", { provenance: { kind: "repository-grounded" } }, {}],
    ["founder-established", { provenance: { kind: "founder-authored" } }, {}],
    ["drovers-read", { provenance: { kind: "conversation-derived" } }, {}],
  ];

  it("reaches every one of the eight states", () => {
    const reached = new Set(cases.map(([, subject, context]) => deriveEpistemicState(subject, context)));
    expect(reached).toEqual(new Set<EpistemicState>([
      "contested", "stale", "unsupported", "historical",
      "measured", "repository-backed", "founder-established", "drovers-read",
    ]));
  });

  for (const [expected, subject, context] of cases) {
    it(`derives ${expected} from its establishing field`, () => {
      expect(deriveEpistemicState(subject, context)).toBe(expected);
    });
  }
});

describe("deriveEpistemicState — absence is a visible claim, never silent establishment", () => {
  it("an empty subject is Drover's read, not established", () => {
    expect(deriveEpistemicState({}, {})).toBe("drovers-read");
  });
  it("a provenance-absent object reads Drover's read", () => {
    expect(deriveEpistemicState({ provenance: undefined }, {})).toBe("drovers-read");
  });
  it.each(["conversation-derived", "teammate-proposed"] as const)("provenance %s reads Drover's read", (kind) => {
    expect(deriveEpistemicState({ provenance: { kind } }, {})).toBe("drovers-read");
  });
  it("a tentative connection reads Drover's read", () => {
    expect(deriveEpistemicState({ connection: { assertion: "tentative" } }, {})).toBe("drovers-read");
  });
  it("an inferred join reads Drover's read", () => {
    expect(deriveEpistemicState({ join: join("inferred") }, {})).toBe("drovers-read");
  });
});

describe("deriveEpistemicState — precedence (first match wins)", () => {
  it("Contested outranks every lower state", () => {
    expect(deriveEpistemicState(
      { provenance: { kind: "repository-grounded" }, join: join("exact") },
      { pressure: [pressure("founder-assertion-conflict")], outcomeJoins: [join("exact")] },
    )).toBe("contested");
  });

  it("both supports+challenges annotations are Contested even with founder provenance", () => {
    expect(deriveEpistemicState(
      { provenance: { kind: "founder-authored" } },
      { annotations: [annotation("supports", "founder-confirmed"), annotation("challenges", "captured-join")] },
    )).toBe("contested");
  });

  it("Stale outranks Unsupported/Measured/lower", () => {
    expect(deriveEpistemicState(
      { join: join("exact") },
      { pressure: [pressure("stale-source")], outcomeJoins: [join("exact")] },
    )).toBe("stale");
  });

  it("Unsupported (gap) beats Founder-established — gap-beats-assertion mirrors the brain", () => {
    // A founder-asserted claim with no product reach is still unsupported-claim (venture-traceability law).
    const gap: FirmTraceabilityGap = { kind: "unsupported-claim", objectRef: "object:x", type: "claim", territory: "gtm", reason: "" };
    expect(deriveEpistemicState(
      { ref: "object:x", provenance: { kind: "founder-authored" }, connection: { assertion: "founder-asserted" } },
      { gaps: [gap] },
    )).toBe("unsupported");
  });

  it("a relationship with no basis at all is Unsupported (every 'Keep visual only' pair)", () => {
    expect(deriveEpistemicState({ relationshipWithoutBasis: true }, {})).toBe("unsupported");
  });

  it("Historical outranks Measured/Repository/Founder", () => {
    expect(deriveEpistemicState(
      { bounds: { endsAt: PAST }, provenance: { kind: "repository-grounded" } },
      { now: NOW, outcomeJoins: [join("exact")] },
    )).toBe("historical");
  });

  it("Measured outranks Repository/Founder — returned reality outranks assertion", () => {
    expect(deriveEpistemicState(
      { provenance: { kind: "founder-authored" } },
      { outcomeJoins: [join("contextual")] },
    )).toBe("measured");
    // captured-join annotation also outranks assertion.
    expect(deriveEpistemicState(
      { provenance: { kind: "founder-authored" } },
      { annotations: [annotation("supports", "captured-join")] },
    )).toBe("measured");
  });

  it("Repository-backed outranks Founder-established", () => {
    expect(deriveEpistemicState(
      { provenance: { kind: "repository-grounded" }, connection: { assertion: "founder-asserted" } },
      {},
    )).toBe("repository-backed");
    expect(deriveEpistemicState({ join: join("exact") }, {})).toBe("repository-backed");
    expect(deriveEpistemicState({}, { annotations: [annotation("supports", "repository-citation")] })).toBe("repository-backed");
  });
});

describe("deriveEpistemicState — the four consequence pressures never drive the token", () => {
  it.each([...CONSEQUENCE_PRESSURE])("%s is consequence pressure, not an epistemic state", (reason) => {
    // With no other establishing signal a consequence pressure leaves the object at Drover's read — it
    // drives the amber --gap treatment elsewhere, never the token.
    expect(deriveEpistemicState({}, { pressure: [pressure(reason)] })).toBe("drovers-read");
  });

  it("consequence pressure does not mask a real epistemic state", () => {
    expect(deriveEpistemicState(
      { provenance: { kind: "repository-grounded" } },
      { pressure: [pressure("held-release")] },
    )).toBe("repository-backed");
  });
});

describe("deriveEpistemicState — every pressure.reason is classified", () => {
  const contested = ["challenged-claim", "founder-assertion-conflict"] as const;
  const unsupported = ["missing-evidence", "unattributed-return"] as const;
  const stale = ["stale-source"] as const;

  it.each([...contested])("%s → contested", (reason) => {
    expect(deriveEpistemicState({}, { pressure: [pressure(reason)] })).toBe("contested");
  });
  it.each([...unsupported])("%s → unsupported", (reason) => {
    expect(deriveEpistemicState({}, { pressure: [pressure(reason)] })).toBe("unsupported");
  });
  it.each([...stale])("%s → stale", (reason) => {
    expect(deriveEpistemicState({}, { pressure: [pressure(reason)] })).toBe("stale");
  });
  it.each([...CONSEQUENCE_PRESSURE])("%s → no epistemic state", (reason) => {
    expect(deriveEpistemicState({}, { pressure: [pressure(reason)] })).toBe("drovers-read");
  });
});

describe("deriveEpistemicState — join basis normalisation over the open union", () => {
  it("nested join.basis and join.level are read via the three-way fallback", () => {
    expect(deriveEpistemicState({ join: { join: { basis: "exact" } } }, {})).toBe("repository-backed");
    expect(deriveEpistemicState({}, { outcomeJoins: [{ join: { level: "contextual" } }] })).toBe("measured");
  });
  it("unknown brain basis strings do not misfire Measured/Repository", () => {
    // "working-theory-anchor" / "work-ref" are real brain payloads and are NOT allowlist members.
    expect(deriveEpistemicState({ join: join("working-theory-anchor") }, {})).toBe("drovers-read");
    expect(deriveEpistemicState({}, { outcomeJoins: [join("work-ref")] })).toBe("drovers-read");
  });
  it("founder-applied join is Founder-established", () => {
    expect(deriveEpistemicState({ join: join("founder-applied") }, {})).toBe("founder-established");
  });
});

describe("deriveEpistemicState — bounds & history", () => {
  it("a future endsAt is not historical", () => {
    expect(deriveEpistemicState({ bounds: { endsAt: FUTURE } }, { now: NOW })).toBe("drovers-read");
  });
  it("without a supplied clock, a past endsAt fails toward visibility (not historical)", () => {
    expect(deriveEpistemicState({ bounds: { endsAt: PAST } }, {})).toBe("drovers-read");
  });
  it("live.ended is historical", () => {
    expect(deriveEpistemicState({ live: { ended: true } }, {})).toBe("historical");
  });
  it("survivesViaHistory is historical", () => {
    expect(deriveEpistemicState({ survivesViaHistory: true }, {})).toBe("historical");
  });
  it("a malformed endsAt never throws and is not historical", () => {
    expect(deriveEpistemicState({ bounds: { endsAt: "not-a-date" } }, { now: NOW })).toBe("drovers-read");
  });
});

describe("deriveEpistemicState — consumes brain traceability gaps, never re-derives them", () => {
  it("a tentative connection WITH resolved evidence (no gap) does not read unsupported", () => {
    // The brain cleared this link (it has evidence), so no unsupported-link gap targets it. A naive UI
    // re-derivation would wrongly call it unsupported; consuming the gap keeps the UI aligned.
    expect(deriveEpistemicState(
      { ref: "conn-1", connection: { assertion: "tentative" } },
      { gaps: [] },
    )).toBe("drovers-read");
  });
  it("an unsupported-link gap targeting the connection reads unsupported", () => {
    const gap: FirmTraceabilityGap = { kind: "unsupported-link", relationshipId: "conn-1", fromRef: "object:a", toRef: "object:b", pair: null, reason: "" };
    expect(deriveEpistemicState({ ref: "conn-1" }, { gaps: [gap] })).toBe("unsupported");
  });
  it("only supports/challenges stances are read; an unrelated annotation stays default", () => {
    expect(deriveEpistemicState({}, { annotations: [annotation("supports", "founder-confirmed")] })).toBe("founder-established");
  });
});
