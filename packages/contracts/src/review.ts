import * as Schema from "effect/Schema";
import { ThreadId, TrimmedNonEmptyString, TurnId } from "./baseSchemas.ts";
import { GitCommandError } from "./git.ts";
import { VcsError } from "./vcs.ts";

export const ReviewDiffPreviewInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  baseRef: Schema.optional(TrimmedNonEmptyString),
  ignoreWhitespace: Schema.optionalKey(Schema.Boolean),
});
export type ReviewDiffPreviewInput = typeof ReviewDiffPreviewInput.Type;

export const ReviewDiffPreviewSourceKind = Schema.Literals(["working-tree", "branch-range"]);
export type ReviewDiffPreviewSourceKind = typeof ReviewDiffPreviewSourceKind.Type;

export const ReviewDiffPreviewSource = Schema.Struct({
  id: TrimmedNonEmptyString,
  kind: ReviewDiffPreviewSourceKind,
  title: TrimmedNonEmptyString,
  baseRef: Schema.NullOr(TrimmedNonEmptyString),
  headRef: Schema.NullOr(TrimmedNonEmptyString),
  diff: Schema.String,
  diffHash: TrimmedNonEmptyString,
  truncated: Schema.Boolean,
});
export type ReviewDiffPreviewSource = typeof ReviewDiffPreviewSource.Type;

export const ReviewDiffPreviewResult = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  generatedAt: Schema.DateTimeUtc,
  sources: Schema.Array(ReviewDiffPreviewSource),
});
export type ReviewDiffPreviewResult = typeof ReviewDiffPreviewResult.Type;

export const ReviewDiffPreviewError = Schema.Union([VcsError, GitCommandError]);
export type ReviewDiffPreviewError = typeof ReviewDiffPreviewError.Type;

/** Targets accepted by Codex's native `review/start` protocol. */
export const NativeReviewTarget = Schema.Union([
  Schema.Struct({ type: Schema.Literal("uncommittedChanges") }),
  Schema.Struct({ type: Schema.Literal("baseBranch"), branch: TrimmedNonEmptyString }),
  Schema.Struct({
    type: Schema.Literal("commit"),
    sha: TrimmedNonEmptyString,
    title: Schema.optionalKey(TrimmedNonEmptyString),
  }),
]);
export type NativeReviewTarget = typeof NativeReviewTarget.Type;

export const NativeReviewStartInput = Schema.Struct({
  threadId: ThreadId,
  target: NativeReviewTarget,
});
export type NativeReviewStartInput = typeof NativeReviewStartInput.Type;

export const NativeReviewStartResult = Schema.Struct({
  reviewThreadId: ThreadId,
  turnId: TurnId,
});
export type NativeReviewStartResult = typeof NativeReviewStartResult.Type;

export class NativeReviewUnavailableError extends Schema.TaggedErrorClass<NativeReviewUnavailableError>()(
  "NativeReviewUnavailableError",
  { reason: TrimmedNonEmptyString },
) {
  override get message(): string {
    return this.reason;
  }
}

export class NativeReviewStartFailedError extends Schema.TaggedErrorClass<NativeReviewStartFailedError>()(
  "NativeReviewStartFailedError",
  { detail: TrimmedNonEmptyString },
) {
  override get message(): string {
    return this.detail;
  }
}

export const NativeReviewStartError = Schema.Union([
  NativeReviewUnavailableError,
  NativeReviewStartFailedError,
]);
export type NativeReviewStartError = typeof NativeReviewStartError.Type;
