import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import { ThreadId } from "./baseSchemas.ts";
import { CodexGoalSetInput, CodexGoalSnapshot } from "./codexGoal.ts";

const decodeGoalSetInput = Schema.decodeUnknownSync(CodexGoalSetInput);
const decodeGoalSnapshot = Schema.decodeUnknownSync(CodexGoalSnapshot);

describe("Codex goal contracts", () => {
  it("accepts a bounded explicit objective", () => {
    expect(
      decodeGoalSetInput({
        threadId: ThreadId.make("thread-1"),
        objective: "Keep going until CI is green",
        tokenBudget: 20_000,
      }),
    ).toMatchObject({ objective: "Keep going until CI is green", tokenBudget: 20_000 });
  });

  it("represents no active goal without inventing state", () => {
    expect(decodeGoalSnapshot({ goal: null })).toEqual({ goal: null });
  });
});
