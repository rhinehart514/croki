import * as Schema from "effect/Schema";

import { NonNegativeInt, ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";

export const CodexGoalStatus = Schema.Literals([
  "active",
  "paused",
  "blocked",
  "usageLimited",
  "budgetLimited",
  "complete",
]);
export type CodexGoalStatus = typeof CodexGoalStatus.Type;

export const CodexGoal = Schema.Struct({
  objective: TrimmedNonEmptyString,
  status: CodexGoalStatus,
  tokenBudget: Schema.NullOr(NonNegativeInt),
  tokensUsed: NonNegativeInt,
  timeUsedSeconds: NonNegativeInt,
  createdAt: NonNegativeInt,
  updatedAt: NonNegativeInt,
});
export type CodexGoal = typeof CodexGoal.Type;

export const CodexGoalThreadInput = Schema.Struct({ threadId: ThreadId });
export type CodexGoalThreadInput = typeof CodexGoalThreadInput.Type;

export const CodexGoalSetInput = Schema.Struct({
  threadId: ThreadId,
  objective: TrimmedNonEmptyString,
  tokenBudget: Schema.optional(NonNegativeInt),
});
export type CodexGoalSetInput = typeof CodexGoalSetInput.Type;

export const CodexGoalSetStatusInput = Schema.Struct({
  threadId: ThreadId,
  status: Schema.Literals(["active", "paused"]),
});
export type CodexGoalSetStatusInput = typeof CodexGoalSetStatusInput.Type;

export const CodexGoalSnapshot = Schema.Struct({ goal: Schema.NullOr(CodexGoal) });
export type CodexGoalSnapshot = typeof CodexGoalSnapshot.Type;

export class CodexGoalError extends Schema.TaggedErrorClass<CodexGoalError>()("CodexGoalError", {
  kind: Schema.Literals(["unsupported", "not-ready", "provider-error"]),
  message: Schema.String,
}) {}
