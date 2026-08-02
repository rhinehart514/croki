import type { ModelCapabilities, OpenClawSettings, ServerProviderModel } from "@t3tools/contracts";
import { createModelCapabilities } from "@t3tools/shared/model";
import { resolveSpawnCommand } from "@t3tools/shared/shell";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import {
  buildServerProvider,
  isCommandMissingCause,
  parseGenericCliVersion,
  spawnAndCollect,
  type ServerProviderDraft,
} from "../providerSnapshot.ts";
import { makeOpenClawAcpRuntime } from "../acp/OpenClawAcpSupport.ts";

const OPENCLAW_PRESENTATION = {
  displayName: "OpenClaw",
  badgeLabel: "ACP",
  showInteractionModeToggle: false,
  requiresNewThreadForModelChange: true,
} as const;

const EMPTY_CAPABILITIES: ModelCapabilities = createModelCapabilities({ optionDescriptors: [] });

export const OPENCLAW_NATIVE_MODEL = "agent-default";

const OPENCLAW_MODELS: ReadonlyArray<ServerProviderModel> = [
  {
    slug: OPENCLAW_NATIVE_MODEL,
    name: "Agent default",
    shortName: "Default",
    isCustom: false,
    capabilities: EMPTY_CAPABILITIES,
  },
];

const VERSION_PROBE_TIMEOUT_MS = 4_000;
const ACP_PROBE_TIMEOUT_MS = 15_000;

function snapshot(input: {
  readonly settings: OpenClawSettings;
  readonly checkedAt: string;
  readonly installed: boolean;
  readonly version: string | null;
  readonly status: "ready" | "warning" | "error";
  readonly message: string;
}): ServerProviderDraft {
  return buildServerProvider({
    presentation: OPENCLAW_PRESENTATION,
    enabled: input.settings.enabled,
    checkedAt: input.checkedAt,
    models: OPENCLAW_MODELS,
    probe: {
      installed: input.installed,
      version: input.version,
      status: input.status,
      auth: { status: "unknown" },
      message: input.message,
    },
  });
}

export function buildInitialOpenClawProviderSnapshot(
  settings: OpenClawSettings,
): Effect.Effect<ServerProviderDraft> {
  return Effect.map(DateTime.now, (now) =>
    snapshot({
      settings,
      checkedAt: DateTime.formatIso(now),
      installed: settings.enabled,
      version: null,
      status: "warning",
      message: settings.enabled
        ? "Checking OpenClaw and its Gateway connection..."
        : "OpenClaw is disabled in Croki settings.",
    }),
  );
}

const runCli = (
  settings: OpenClawSettings,
  environment: NodeJS.ProcessEnv,
  args: ReadonlyArray<string>,
) =>
  Effect.gen(function* () {
    const command = settings.binaryPath || "openclaw";
    const spawnCommand = yield* resolveSpawnCommand(command, args, { env: environment });
    return yield* spawnAndCollect(
      command,
      ChildProcess.make(spawnCommand.command, spawnCommand.args, {
        env: environment,
        shell: spawnCommand.shell,
      }),
    );
  });

const decodeUnknownJson = Schema.decodeUnknownExit(Schema.UnknownFromJsonString);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function configuredOpenClawAgentModel(json: string, agentId: string): string | undefined {
  const agent = configuredOpenClawAgent(json, agentId);
  if (!agent) return undefined;
  if (typeof agent.model === "string") return agent.model;
  if (isRecord(agent.model) && typeof agent.model.primary === "string") {
    return agent.model.primary;
  }
  return undefined;
}

export function hasConfiguredOpenClawAgent(json: string, agentId: string): boolean {
  return configuredOpenClawAgent(json, agentId) !== undefined;
}

function configuredOpenClawAgent(
  json: string,
  agentId: string,
): Record<string, unknown> | undefined {
  const decoded = decodeUnknownJson(json);
  if (Exit.isFailure(decoded)) return undefined;
  const root = decoded.value;
  const agents = Array.isArray(root)
    ? root
    : isRecord(root) && Array.isArray(root.agents)
      ? root.agents
      : [];
  const agent = agents.find((entry) => isRecord(entry) && entry.id === agentId);
  return isRecord(agent) ? agent : undefined;
}

const probeAcp = (settings: OpenClawSettings, environment: NodeJS.ProcessEnv) =>
  Effect.gen(function* () {
    const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const runtime = yield* makeOpenClawAcpRuntime({
      openClawSettings: settings,
      sessionKey: `agent:${settings.agentId || "croki"}:croki:provider-probe`,
      environment,
      childProcessSpawner,
      cwd: process.cwd(),
      clientInfo: { name: "croki-openclaw-probe", version: "0.4.1" },
    });
    yield* runtime.start();
  }).pipe(Effect.scoped);

export const checkOpenClawProviderStatus = Effect.fn("checkOpenClawProviderStatus")(function* (
  settings: OpenClawSettings,
  environment: NodeJS.ProcessEnv = process.env,
): Effect.fn.Return<
  ServerProviderDraft,
  never,
  ChildProcessSpawner.ChildProcessSpawner | Crypto.Crypto
> {
  const checkedAt = DateTime.formatIso(yield* DateTime.now);
  if (!settings.enabled) {
    return snapshot({
      settings,
      checkedAt,
      installed: false,
      version: null,
      status: "warning",
      message: "OpenClaw is disabled in Croki settings.",
    });
  }

  const versionResult = yield* runCli(settings, environment, ["--version"]).pipe(
    Effect.timeoutOption(VERSION_PROBE_TIMEOUT_MS),
    Effect.result,
  );
  if (Result.isFailure(versionResult)) {
    const missing = isCommandMissingCause(versionResult.failure);
    return snapshot({
      settings,
      checkedAt,
      installed: !missing,
      version: null,
      status: "error",
      message: missing
        ? "OpenClaw CLI (`openclaw`) is not installed or not on PATH."
        : "Failed to execute the OpenClaw CLI health check.",
    });
  }
  if (Option.isNone(versionResult.success)) {
    return snapshot({
      settings,
      checkedAt,
      installed: true,
      version: null,
      status: "error",
      message: "OpenClaw is installed but timed out while checking its version.",
    });
  }

  const versionOutput = versionResult.success.value;
  const version = parseGenericCliVersion(`${versionOutput.stdout}\n${versionOutput.stderr}`);
  if (versionOutput.code !== 0) {
    return snapshot({
      settings,
      checkedAt,
      installed: true,
      version,
      status: "error",
      message: "OpenClaw is installed but failed to run.",
    });
  }

  const agentId = settings.agentId || "croki";
  const agentsResult = yield* runCli(settings, environment, ["agents", "list", "--json"]).pipe(
    Effect.timeoutOption(VERSION_PROBE_TIMEOUT_MS),
    Effect.result,
  );
  if (Result.isFailure(agentsResult) || Option.isNone(agentsResult.success)) {
    return snapshot({
      settings,
      checkedAt,
      installed: true,
      version,
      status: "error",
      message: "OpenClaw is installed, but Croki could not inspect its configured agents.",
    });
  }
  const agentsJson = agentsResult.success.value.stdout;
  if (!hasConfiguredOpenClawAgent(agentsJson, agentId)) {
    return snapshot({
      settings,
      checkedAt,
      installed: true,
      version,
      status: "error",
      message: `OpenClaw agent '${agentId}' was not found.`,
    });
  }

  const acpResult = yield* probeAcp(settings, environment).pipe(
    Effect.timeoutOption(ACP_PROBE_TIMEOUT_MS),
    Effect.result,
  );
  if (Result.isFailure(acpResult) || Option.isNone(acpResult.success)) {
    return snapshot({
      settings,
      checkedAt,
      installed: true,
      version,
      status: "error",
      message: "OpenClaw is installed, but its ACP Gateway connection is not ready.",
    });
  }

  return snapshot({
    settings,
    checkedAt,
    installed: true,
    version,
    status: "ready",
    message: `OpenClaw is ready using agent '${agentId}' with its native configuration.`,
  });
});
