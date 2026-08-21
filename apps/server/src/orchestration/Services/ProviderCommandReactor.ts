/**
 * ProviderCommandReactor - Provider command reaction service interface.
 *
 * Owns background workers that react to orchestration intent events and
 * dispatch provider-side command execution.
 *
 * @module ProviderCommandReactor
 */
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as PlatformError from "effect/PlatformError";
import type * as Scope from "effect/Scope";
import type { ThreadId } from "@croki/contracts";

import type { ProjectionRepositoryError } from "../../persistence/Errors.ts";
import type { ProviderServiceError } from "../../provider/Errors.ts";
import type { OrchestrationDispatchError } from "../Errors.ts";

export type ProviderSessionPreparationError =
  | OrchestrationDispatchError
  | PlatformError.PlatformError
  | ProjectionRepositoryError
  | ProviderServiceError;

/**
 * ProviderCommandReactorShape - Service API for provider command reactors.
 */
export interface ProviderCommandReactorShape {
  /**
   * Make the Thread's selected provider session active and synchronize its
   * durable orchestration state. Direct provider features such as native voice
   * use this before they address a session outside the normal turn-start path.
   */
  readonly prepareSession: (
    threadId: ThreadId,
    createdAt: string,
  ) => Effect.Effect<ThreadId, ProviderSessionPreparationError>;

  /**
   * Start reacting to provider-intent orchestration domain events.
   *
   * The returned effect must be run in a scope so all worker fibers can be
   * finalized on shutdown.
   *
   * Filters orchestration domain events to provider-intent types before
   * processing.
   */
  readonly start: () => Effect.Effect<void, never, Scope.Scope>;

  /**
   * Resolves when the internal processing queue is empty and idle.
   * Intended for test use to replace timing-sensitive sleeps.
   */
  readonly drain: Effect.Effect<void>;
}

/**
 * ProviderCommandReactor - Service tag for provider command reaction workers.
 */
export class ProviderCommandReactor extends Context.Service<
  ProviderCommandReactor,
  ProviderCommandReactorShape
>()("croki-server/orchestration/Services/ProviderCommandReactor") {}
