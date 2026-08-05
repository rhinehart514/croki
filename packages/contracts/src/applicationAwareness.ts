import * as Schema from "effect/Schema";

import { IsoDateTime, NonNegativeInt, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { CrokiPerceptionFrameReference, CrokiPerceptionSource } from "./perception.ts";
import { UiHistoryEntry } from "./uiHistory.ts";

const BoundedText = Schema.String.check(Schema.isMaxLength(4_096));

export const ApplicationScreenReference = Schema.Struct({
  sourceThreadId: TrimmedNonEmptyString,
  id: TrimmedNonEmptyString.check(Schema.isMaxLength(256)),
});
export type ApplicationScreenReference = typeof ApplicationScreenReference.Type;

export const ApplicationAwarenessInput = Schema.Struct({
  evidenceLimit: Schema.optional(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 50 })).annotate({
      description: "Maximum source-backed project observations to return. Defaults to 20.",
    }),
  ),
  checkedScreenLimit: Schema.optional(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 25 })).annotate({
      description: "Maximum checked screens from this project to return. Defaults to 10.",
    }),
  ),
  sourceKinds: Schema.optional(
    Schema.Array(TrimmedNonEmptyString).check(Schema.isMaxLength(16)).annotate({
      description:
        "Optional observed source families to include, such as preview, evidence, review, or checkpoint.",
    }),
  ),
  baselineScreen: Schema.optional(ApplicationScreenReference).annotate({
    description: "Qualified checked screen to use as the before state.",
  }),
  targetScreen: Schema.optional(ApplicationScreenReference).annotate({
    description: "Qualified checked screen to use as the after state.",
  }),
});
export type ApplicationAwarenessInput = typeof ApplicationAwarenessInput.Type;

export const ApplicationAwarenessSource = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("git-tag"), ref: TrimmedNonEmptyString }),
  Schema.Struct({ kind: Schema.Literal("release-url"), url: TrimmedNonEmptyString }),
  Schema.Struct({ kind: Schema.Literal("file"), path: TrimmedNonEmptyString }),
]);
export type ApplicationAwarenessSource = typeof ApplicationAwarenessSource.Type;

export const ApplicationAwarenessReleasedState = Schema.Struct({
  version: TrimmedNonEmptyString,
  summary: BoundedText,
  product: Schema.Array(BoundedText),
  gtm: Schema.Array(BoundedText),
  learnings: Schema.Array(BoundedText),
  sources: Schema.Array(ApplicationAwarenessSource),
});

export const ApplicationAwarenessBuildingState = Schema.Struct({
  version: TrimmedNonEmptyString,
  intent: BoundedText,
  product: Schema.Array(BoundedText),
  gtm: Schema.Array(BoundedText),
  successSignals: Schema.Array(BoundedText),
});

export const ApplicationAwarenessCanon = Schema.Struct({
  authority: Schema.Literal("project-declared"),
  approval: Schema.Literal("unverified"),
  path: Schema.Union([
    Schema.Literal(".croki/application.croki"),
    Schema.Literal(".croki/application.json"),
  ]),
  sha256: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  released: Schema.NullOr(ApplicationAwarenessReleasedState),
  building: Schema.NullOr(ApplicationAwarenessBuildingState),
});
export type ApplicationAwarenessCanon = typeof ApplicationAwarenessCanon.Type;

export const ApplicationAwarenessEvidence = Schema.Struct({
  authority: Schema.Literal("observed"),
  id: TrimmedNonEmptyString,
  type: TrimmedNonEmptyString,
  title: BoundedText,
  summary: Schema.optional(BoundedText),
  state: Schema.optional(BoundedText),
  source: CrokiPerceptionSource,
  frame: Schema.optional(CrokiPerceptionFrameReference),
});
export type ApplicationAwarenessEvidence = typeof ApplicationAwarenessEvidence.Type;

export const ApplicationAwarenessCheckedScreen = Schema.Struct({
  ref: ApplicationScreenReference,
  entry: UiHistoryEntry,
  sourceThreadId: TrimmedNonEmptyString,
  sourceThreadTitle: TrimmedNonEmptyString,
  turnId: Schema.NullOr(TrimmedNonEmptyString),
  sourceThreadBranchAtRead: Schema.NullOr(Schema.String),
  sourceThreadWorktreeAtRead: Schema.NullOr(Schema.String),
  codeRevision: Schema.Union([
    Schema.Struct({ kind: Schema.Literal("checkpoint"), ref: TrimmedNonEmptyString }),
    Schema.Struct({
      kind: Schema.Literal("unresolved"),
      reason: Schema.Literal("no-checkpoint-for-source-turn"),
    }),
  ]),
  frame: CrokiPerceptionFrameReference,
});
export type ApplicationAwarenessCheckedScreen = typeof ApplicationAwarenessCheckedScreen.Type;

export const ApplicationAwarenessChangeFile = Schema.Struct({
  path: TrimmedNonEmptyString,
  kind: TrimmedNonEmptyString,
  additions: NonNegativeInt,
  deletions: NonNegativeInt,
});

export const ApplicationAwarenessChange = Schema.Struct({
  scope: Schema.Literal("invoking-thread"),
  sourceThreadId: TrimmedNonEmptyString,
  branch: Schema.NullOr(Schema.String),
  worktreePath: Schema.NullOr(Schema.String),
  baselineVersion: Schema.NullOr(TrimmedNonEmptyString),
  targetVersion: Schema.NullOr(TrimmedNonEmptyString),
  declaredIntent: Schema.NullOr(BoundedText),
  declaredProductChanges: Schema.Array(BoundedText),
  declaredMarketChanges: Schema.Array(BoundedText),
  declaredSuccessSignals: Schema.Array(BoundedText),
  latestCheckpoint: Schema.NullOr(
    Schema.Struct({
      ref: TrimmedNonEmptyString,
      completedAt: IsoDateTime,
      files: Schema.Array(ApplicationAwarenessChangeFile),
    }),
  ),
});
export type ApplicationAwarenessChange = typeof ApplicationAwarenessChange.Type;

export const ApplicationAwarenessExperienceComparison = Schema.Struct({
  baseline: ApplicationAwarenessCheckedScreen,
  target: ApplicationAwarenessCheckedScreen,
  sameUrl: Schema.Boolean,
  widthDelta: Schema.Number,
  heightDelta: Schema.Number,
  interactiveElementCountDelta: Schema.Number,
  consoleErrorCountDelta: Schema.Number,
  networkFailureCountDelta: Schema.Number,
  actionCountDelta: Schema.Number,
});
export type ApplicationAwarenessExperienceComparison =
  typeof ApplicationAwarenessExperienceComparison.Type;

export const ApplicationAwarenessCoverage = Schema.Struct({
  projectEvidenceStatus: Schema.Literals(["ready", "stale", "rebuilding", "unavailable"]),
  projectEvidenceTruncated: Schema.Boolean,
  checkedScreensTruncated: Schema.Boolean,
  checkedScreenScope: Schema.Literal("project"),
  limitations: Schema.Array(BoundedText),
});
export type ApplicationAwarenessCoverage = typeof ApplicationAwarenessCoverage.Type;

export const ApplicationAwarenessResult = Schema.Struct({
  version: Schema.Literal(1),
  threadId: TrimmedNonEmptyString,
  projectId: TrimmedNonEmptyString,
  generatedAt: IsoDateTime,
  canonStatus: Schema.Literals(["loaded", "absent", "invalid", "oversized"]),
  canon: Schema.NullOr(ApplicationAwarenessCanon),
  change: ApplicationAwarenessChange,
  checkedScreens: Schema.Array(ApplicationAwarenessCheckedScreen),
  experienceComparison: Schema.NullOr(ApplicationAwarenessExperienceComparison),
  projectEvidence: Schema.Array(ApplicationAwarenessEvidence),
  evidenceRevision: NonNegativeInt,
  coverage: ApplicationAwarenessCoverage,
});
export type ApplicationAwarenessResult = typeof ApplicationAwarenessResult.Type;

export const ApplicationScreenInput = Schema.Struct({
  sourceThreadId: TrimmedNonEmptyString.annotate({
    description: "Source Thread id returned in the checked-screen reference.",
  }),
  id: TrimmedNonEmptyString.check(Schema.isMaxLength(256)).annotate({
    description: "Checked-screen id returned in the qualified reference.",
  }),
});
export type ApplicationScreenInput = typeof ApplicationScreenInput.Type;

export const ApplicationScreenResult = Schema.Struct({
  screen: ApplicationAwarenessCheckedScreen,
});
export type ApplicationScreenResult = typeof ApplicationScreenResult.Type;

export class ApplicationAwarenessError extends Schema.TaggedErrorClass<ApplicationAwarenessError>()(
  "ApplicationAwarenessError",
  {
    code: Schema.Literals([
      "thread-not-found",
      "project-not-found",
      "evidence-not-found",
      "observation-failed",
    ]),
    message: Schema.String,
  },
) {}
