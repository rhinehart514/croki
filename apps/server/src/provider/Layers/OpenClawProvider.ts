import type {
  ModelCapabilities,
  OpenClawAgent,
  OpenClawSettings,
  ServerProviderModel,
} from "@croki/contracts";
import { createModelCapabilities } from "@croki/shared/model";
import { resolveSpawnCommand } from "@croki/shared/shell";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import packageJson from "../../../package.json" with { type: "json" };

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
  readonly openClawAgents?: ReadonlyArray<OpenClawAgent>;
}): ServerProviderDraft {
  return buildServerProvider({
    presentation: OPENCLAW_PRESENTATION,
    enabled: input.settings.enabled,
    checkedAt: input.checkedAt,
    models: OPENCLAW_MODELS,
    ...(input.openClawAgents ? { openClawAgents: input.openClawAgents } : {}),
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

const hasRemoteOpenClawTarget = (settings: OpenClawSettings): boolean => {
  const args = settings.launchArgs.trim();
  return /(?:^|\s)--(?:url|gateway|host|port)(?:=|\s|$)/.test(args);
};

/**
 * Read OpenClaw's native agent inventory without making discovery a hard
 * dependency for custom/remote ACP configurations. A failed or timed-out
 * inventory is represented as an empty list and the ACP handshake remains
 * authoritative for the configured remote target.
 */
export const discoverOpenClawAgents = Effect.fn("discoverOpenClawAgents")(function* (
  settings: OpenClawSettings,
  environment: NodeJS.ProcessEnv = process.env,
): Effect.fn.Return<ReadonlyArray<OpenClawAgent>, never, ChildProcessSpawner.ChildProcessSpawner> {
  if (!settings.enabled || hasRemoteOpenClawTarget(settings)) return [];
  const result = yield* runCli(settings, environment, ["agents", "list", "--json"]).pipe(
    Effect.timeoutOption(VERSION_PROBE_TIMEOUT_MS),
    Effect.result,
  );
  if (Result.isFailure(result) || Option.isNone(result.success)) return [];
  const output = result.success.value;
  if (output.code !== 0) return [];
  return parseOpenClawAgents(output.stdout);
});

const decodeUnknownJson = Schema.decodeUnknownExit(Schema.UnknownFromJsonString);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function configuredOpenClawAgentModel(json: string, agentId: string): string | undefined {
  const agent = configuredOpenClawAgent(json, agentId);
  if (!agent) return undefined;
  return openClawAgentModel(agent);
}

export function hasConfiguredOpenClawAgent(json: string, agentId: string): boolean {
  return configuredOpenClawAgent(json, agentId) !== undefined;
}

function openClawAgentModel(agent: Record<string, unknown>): string | undefined {
  if (typeof agent.model === "string" && agent.model.trim()) return agent.model.trim();
  if (isRecord(agent.model) && typeof agent.model.primary === "string") {
    const primary = agent.model.primary.trim();
    return primary.length > 0 ? primary : undefined;
  }
  return undefined;
}

/** Parse the stable subset of OpenClaw's native `agents list --json` output. */
export function parseOpenClawAgents(json: string): ReadonlyArray<OpenClawAgent> {
  const decoded = decodeUnknownJson(json);
  if (Exit.isFailure(decoded)) return [];
  const root = decoded.value;
  const entries = Array.isArray(root)
    ? root
    : isRecord(root) && Array.isArray(root.agents)
      ? root.agents
      : [];
  const rootDefaultAgentId =
    isRecord(root) && typeof root.defaultAgentId === "string"
      ? root.defaultAgentId.trim()
      : isRecord(root) && typeof root.defaultAgent === "string"
        ? root.defaultAgent.trim()
        : isRecord(root) && isRecord(root.defaultAgent) && typeof root.defaultAgent.id === "string"
          ? root.defaultAgent.id.trim()
          : undefined;
  const seen = new Set<string>();
  let agents: Array<OpenClawAgent> = [];
  for (const entry of entries) {
    if (!isRecord(entry) || typeof entry.id !== "string") continue;
    const id = entry.id.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const name = typeof entry.name === "string" && entry.name.trim() ? entry.name.trim() : id;
    const model = openClawAgentModel(entry);
    const workspace =
      typeof entry.workspace === "string" && entry.workspace.trim()
        ? entry.workspace.trim()
        : undefined;
    agents.push({
      id,
      name,
      ...(model ? { model } : {}),
      ...(workspace ? { workspace } : {}),
      isDefault: entry.isDefault === true || entry.default === true || id === rootDefaultAgentId,
    });
  }

  // Some OpenClaw versions omit `isDefault` and put the default id on the
  // object instead. Preserve a deterministic default for clients in that
  // case: the first listed agent is the native fallback.
  if (agents.length > 0 && !agents.some((agent) => agent.isDefault)) {
    const first = agents[0];
    if (!first) return agents;
    const rest = agents.slice(1);
    agents = [{ ...first, isDefault: true }, ...rest];
  }
  return agents;
}

export function resolveOpenClawAgentId(
  agents: ReadonlyArray<OpenClawAgent>,
  configuredAgentId: string | undefined,
): string | undefined {
  const configured = configuredAgentId?.trim();
  if (configured) return configured;
  return agents.find((agent) => agent.isDefault)?.id ?? agents[0]?.id;
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
  const normalizedId = agentId.trim();
  const agent = agents.find((entry) => isRecord(entry) && entry.id === normalizedId);
  return isRecord(agent) ? agent : undefined;
}

const probeAcp = (settings: OpenClawSettings, environment: NodeJS.ProcessEnv) =>
  Effect.gen(function* () {
    const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const runtime = yield* makeOpenClawAcpRuntime({
      openClawSettings: settings,
      ...(settings.agentId.trim()
        ? { sessionKey: `agent:${settings.agentId.trim()}:croki:provider-probe` }
        : {}),
      environment,
      childProcessSpawner,
      cwd: process.cwd(),
      clientInfo: { name: "croki-openclaw-probe", version: packageJson.version },
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

  const configuredAgentId = settings.agentId.trim();
  const remoteTarget = hasRemoteOpenClawTarget(settings);
  if (remoteTarget && !configuredAgentId) {
    return snapshot({
      settings,
      checkedAt,
      installed: true,
      version,
      status: "error",
      message:
        "OpenClaw ACP targets a remote Gateway. Set an explicit agent id so Croki can keep sessions scoped to the correct agent.",
    });
  }
  let agents: ReadonlyArray<OpenClawAgent> = [];
  let agentId = configuredAgentId;

  if (!remoteTarget) {
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
    const agentsOutput = agentsResult.success.value;
    if (agentsOutput.code !== 0) {
      return snapshot({
        settings,
        checkedAt,
        installed: true,
        version,
        status: "error",
        message: "OpenClaw is installed, but its agent inventory command failed.",
      });
    }
    agents = parseOpenClawAgents(agentsOutput.stdout);
    if (configuredAgentId && !hasConfiguredOpenClawAgent(agentsOutput.stdout, configuredAgentId)) {
      return snapshot({
        settings,
        checkedAt,
        installed: true,
        version,
        status: "error",
        openClawAgents: agents,
        message: `OpenClaw agent '${configuredAgentId}' was not found.`,
      });
    }
    agentId = resolveOpenClawAgentId(agents, configuredAgentId) ?? "";
    if (!agentId) {
      return snapshot({
        settings,
        checkedAt,
        installed: true,
        version,
        status: "error",
        openClawAgents: agents,
        message: "OpenClaw is installed, but no configured agents were found.",
      });
    }
  }

  const probeSettings = agentId ? { ...settings, agentId } : settings;
  const acpResult = yield* probeAcp(probeSettings, environment).pipe(
    Effect.timeoutOption(ACP_PROBE_TIMEOUT_MS),
    Effect.result,
  );
  if (Result.isFailure(acpResult) || Option.isNone(acpResult.success)) {
    return snapshot({
      settings,
      checkedAt,
      installed: true,
      version,
      ...(agents.length > 0 ? { openClawAgents: agents } : {}),
      status: "error",
      message: "OpenClaw is installed, but its ACP Gateway connection is not ready.",
    });
  }

  return snapshot({
    settings,
    checkedAt,
    installed: true,
    version,
    ...(agents.length > 0 ? { openClawAgents: agents } : {}),
    status: "ready",
    message: remoteTarget
      ? agentId
        ? `OpenClaw is ready using agent '${agentId}' through the configured ACP Gateway.`
        : "OpenClaw is ready using its native default agent through the configured ACP Gateway."
      : `OpenClaw is ready using agent '${agentId}' with its native configuration.`,
  });
});
