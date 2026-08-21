import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { CrokiEvidenceObservedActivityPayload } from "./evidence.ts";

const decode = Schema.decodeUnknownSync(CrokiEvidenceObservedActivityPayload);

const observation = {
  id: "activation-call-17",
  domain: "customer",
  type: "customer-objection",
  title: "Setup felt too technical",
  summary: "The customer expected the first useful result before connecting a repository.",
  observedAt: "2026-08-03T18:00:00.000Z",
  source: {
    kind: "customer-call",
    id: "call-17",
    label: "Activation interview",
    uri: "notion://calls/17",
  },
  confidence: 0.9,
};

describe("venture evidence", () => {
  it("accepts source-grounded product and GTM observations", () => {
    expect(decode({ observations: [observation] }).observations[0]).toEqual(observation);
  });

  it("rejects unbounded batches and invalid confidence", () => {
    expect(() => decode({ observations: Array.from({ length: 51 }, () => observation) })).toThrow();
    expect(() => decode({ observations: [{ ...observation, confidence: 1.01 }] })).toThrow();
  });
});
