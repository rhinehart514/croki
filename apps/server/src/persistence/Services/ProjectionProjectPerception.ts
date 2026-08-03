/**
 * Durable project-scoped perception projection.
 *
 * The row is a recoverable cache of the semantic model derived from durable
 * Thread activities. Source activity payloads are never copied here; the
 * projector stores only the bounded, content-safe perception packet.
 */
import { CrokiProjectPerceptionSnapshot, IsoDateTime, ProjectId } from "@croki/contracts";
import * as Context from "effect/Context";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type * as Effect from "effect/Effect";

import type { ProjectionRepositoryError } from "../Errors.ts";

export const ProjectionProjectPerception = Schema.Struct({
  projectId: ProjectId,
  revision: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  snapshot: CrokiProjectPerceptionSnapshot,
  updatedAt: IsoDateTime,
});
export type ProjectionProjectPerception = typeof ProjectionProjectPerception.Type;

export const GetProjectionProjectPerceptionInput = Schema.Struct({
  projectId: ProjectId,
});
export type GetProjectionProjectPerceptionInput = typeof GetProjectionProjectPerceptionInput.Type;

export const DeleteProjectionProjectPerceptionInput = GetProjectionProjectPerceptionInput;
export type DeleteProjectionProjectPerceptionInput =
  typeof DeleteProjectionProjectPerceptionInput.Type;

export interface ProjectionProjectPerceptionRepositoryShape {
  readonly upsert: (
    row: ProjectionProjectPerception,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
  readonly getByProjectId: (
    input: GetProjectionProjectPerceptionInput,
  ) => Effect.Effect<Option.Option<ProjectionProjectPerception>, ProjectionRepositoryError>;
  readonly deleteByProjectId: (
    input: DeleteProjectionProjectPerceptionInput,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
}

export class ProjectionProjectPerceptionRepository extends Context.Service<
  ProjectionProjectPerceptionRepository,
  ProjectionProjectPerceptionRepositoryShape
>()(
  "croki-server/persistence/Services/ProjectionProjectPerception/ProjectionProjectPerceptionRepository",
) {}
