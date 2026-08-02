import type { OpenClawSettings } from "@t3tools/contracts";
import { tokenizeCliArgs } from "@t3tools/shared/cliArgs";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Scope from "effect/Scope";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";
import type * as EffectAcpErrors from "effect-acp/errors";

import * as AcpSessionRuntime from "./AcpSessionRuntime.ts";

type OpenClawAcpRuntimeSettings = Pick<OpenClawSettings, "binaryPath" | "launchArgs">;

export interface OpenClawAcpRuntimeInput extends Omit<
  AcpSessionRuntime.AcpSessionRuntimeOptions,
  "authMethodId" | "spawn"
> {
  readonly childProcessSpawner: ChildProcessSpawner.ChildProcessSpawner["Service"];
  readonly openClawSettings: OpenClawAcpRuntimeSettings | null | undefined;
  readonly environment?: NodeJS.ProcessEnv;
  readonly sessionKey?: string;
}

export function buildOpenClawAcpSpawnInput(
  settings: OpenClawAcpRuntimeSettings | null | undefined,
  cwd: string,
  environment?: NodeJS.ProcessEnv,
  sessionKey?: string,
): AcpSessionRuntime.AcpSpawnInput {
  const launchArgs = tokenizeCliArgs(settings?.launchArgs ?? "");
  const hasExplicitSession = launchArgs.some(
    (argument) => argument === "--session" || argument.startsWith("--session="),
  );
  return {
    command: settings?.binaryPath || "openclaw",
    args: [
      "acp",
      ...launchArgs,
      ...(!hasExplicitSession && sessionKey ? ["--session", sessionKey] : []),
    ],
    cwd,
    ...(environment ? { env: environment } : {}),
  };
}

export const makeOpenClawAcpRuntime = (
  input: OpenClawAcpRuntimeInput,
): Effect.Effect<
  AcpSessionRuntime.AcpSessionRuntime["Service"],
  EffectAcpErrors.AcpError,
  Crypto.Crypto | Scope.Scope
> =>
  Effect.gen(function* () {
    const context = yield* Layer.build(
      AcpSessionRuntime.layer({
        ...input,
        spawn: buildOpenClawAcpSpawnInput(
          input.openClawSettings,
          input.cwd,
          input.environment,
          input.sessionKey,
        ),
        // OpenClaw advertises no auth methods and accepts this as a no-op.
        authMethodId: "openclaw",
      }).pipe(
        Layer.provide(
          Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, input.childProcessSpawner),
        ),
      ),
    );
    return yield* Effect.service(AcpSessionRuntime.AcpSessionRuntime).pipe(Effect.provide(context));
  });

export function resolveOpenClawAcpBaseModelId(model: string | null | undefined): string {
  return model?.trim() || "sol-medium-luna-max";
}
