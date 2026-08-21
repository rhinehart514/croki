import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import { CrokiThoughtView } from "./thoughtView.ts";

describe("CrokiThoughtView", () => {
  it("rejects values outside the trusted semantic catalog", () => {
    const decode = Schema.decodeUnknownSync(CrokiThoughtView);
    expect(() =>
      decode({
        version: 1,
        id: "view-1",
        generatedAt: "2026-08-08T12:00:00.000Z",
        sourceRevision: 1,
        representation: "html-script",
        alternateRepresentation: "comparison",
        basis: {
          question: "What matters?",
          foregrounds: ["Relationships"],
          omits: [],
          coverage: "One source",
        },
        statements: [],
        relationships: [],
        regions: [],
        sources: [],
      }),
    ).toThrow();
  });
});
