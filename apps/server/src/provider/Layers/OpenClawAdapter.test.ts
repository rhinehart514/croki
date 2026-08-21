// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import {
  OpenClawSettings,
  ProviderDriverKind,
  ProviderInstanceId,
  RuntimeTaskId,
  ThreadId,
  TurnId,
} from "@croki/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { ServerConfig } from "../../config.ts";
import type { OpenClawAdapterShape } from "../Services/OpenClawAdapter.ts";
import {
  makeOpenClawAdapter,
  parseOpenClawResume,
  parseOpenClawDelegatedTask,
  presentOpenClawToolCall,
} from "./OpenClawAdapter.ts";

class OpenClawAdapter extends Context.Service<OpenClawAdapter, OpenClawAdapterShape>()(
  "croki-server/provider/Layers/OpenClawAdapter.test/OpenClawAdapter",
) {}

const dirname = NodePath.dirname(NodeURL.fileURLToPath(import.meta.url));
const mockAgentPath = NodePath.join(dirname, "../../../scripts/acp-mock-agent.ts");
const defaultSettings = Schema.decodeSync(OpenClawSettings)({});

it("recognizes OpenClaw's generic ACP payload as delegated work", () => {
  assert.equal(
    presentOpenClawToolCall({
      toolCallId: "spawn-1",
      title: "Tool",
      status: "completed",
      data: {
        rawInput: {
          runtime: "subagent",
          mode: "run",
          taskName: "inspect-version",
        },
      },
    }).title,
    "Delegated work",
  );
});

it("normalizes OpenClaw subagent spawns into stable runtime tasks", () => {
  const task = parseOpenClawDelegatedTask(
    {
      toolCallId: "spawn-1",
      title: "Tool",
      status: "inProgress",
      data: {
        rawInput: {
          runtime: "subagent",
          mode: "run",
          taskName: "Inspect the provider boundary",
        },
      },
    },
    TurnId.make("turn-1"),
  );

  assert.deepEqual(task, {
    taskId: RuntimeTaskId.make("openclaw:turn-1:spawn-1"),
    description: "Inspect the provider boundary",
    taskType: "run",
  });
});

it("rejects resume cursors that are missing or pinned to another OpenClaw agent", () => {
  const cursor = {
    schemaVersion: 2,
    sessionId: "session-main",
    agentId: "main",
  };
  assert.deepEqual(parseOpenClawResume(cursor), {
    sessionId: "session-main",
    agentId: "main",
  });
  assert.isUndefined(parseOpenClawResume({ ...cursor, agentId: "" }));
  assert.isUndefined(
    parseOpenClawResume({ schemaVersion: 1, sessionId: "legacy", agentId: "main" }),
  );
});

async function makeWrapper(requestLogPath: string, argvLogPath: string): Promise<string> {
  const directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "croki-openclaw-acp-"));
  const wrapperPath = NodePath.join(directory, "openclaw");
  const script = `#!/bin/sh
if [ "$1" = "agents" ]; then
  printf '%s\\n' '[{"id":"main","workspace":"/work/main","model":"openai/gpt-5.6-sol","isDefault":true}]'
  exit 0
fi
printf '%s\\t' "$@" >> ${JSON.stringify(argvLogPath)}
printf '\\n' >> ${JSON.stringify(argvLogPath)}
export CROKI_ACP_REQUEST_LOG_PATH=${JSON.stringify(requestLogPath)}
exec node ${JSON.stringify(mockAgentPath)} "$@"
`;
  await NodeFSP.writeFile(wrapperPath, script, "utf8");
  await NodeFSP.chmod(wrapperPath, 0o755);
  return wrapperPath;
}

const testLayer = it.layer(
  Layer.effect(
    OpenClawAdapter,
    Effect.gen(function* () {
      return yield* makeOpenClawAdapter(defaultSettings);
    }),
  ).pipe(
    Layer.provideMerge(
      ServerConfig.layerTest(process.cwd(), { prefix: "croki-openclaw-adapter-test-" }),
    ),
    Layer.provideMerge(NodeServices.layer),
  ),
);

testLayer("OpenClawAdapter", (it) => {
  it.effect("routes a thread through OpenClaw without changing the agent's behavior", () =>
    Effect.gen(function* () {
      const requestLogPath = NodePath.join(
        yield* Effect.promise(() =>
          NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "openclaw-log-")),
        ),
        "requests.jsonl",
      );
      const argvLogPath = `${requestLogPath}.argv`;
      const wrapperPath = yield* Effect.promise(() => makeWrapper(requestLogPath, argvLogPath));
      const adapter = yield* makeOpenClawAdapter({
        ...defaultSettings,
        binaryPath: wrapperPath,
        agentId: "croki",
      });
      const threadId = ThreadId.make("openclaw-thread-1");
      const session = yield* adapter.startSession({
        threadId,
        provider: ProviderDriverKind.make("openclaw"),
        cwd: process.cwd(),
        runtimeMode: "full-access",
        modelSelection: {
          instanceId: ProviderInstanceId.make("openclaw"),
          model: "agent-default",
        },
      });
      assert.equal(session.provider, "openclaw");

      yield* adapter.sendTurn({ threadId, input: "Implement the feature", attachments: [] });

      const requestLog = yield* Effect.promise(() => NodeFSP.readFile(requestLogPath, "utf8"));
      assert.include(requestLog, "Implement the feature");
      assert.notInclude(requestLog, "croki_multi_agent");
      assert.notInclude(requestLog, "do not silently substitute");

      const argvLog = yield* Effect.promise(() => NodeFSP.readFile(argvLogPath, "utf8"));
      assert.include(argvLog, "acp");
      assert.include(argvLog, "--session");
      assert.include(argvLog, "agent:croki:croki:openclaw-thread-1");

      yield* adapter.stopSession(threadId);
    }),
  );

  it.effect("scopes a blank agent setting to OpenClaw's discovered native default", () =>
    Effect.gen(function* () {
      const requestLogPath = NodePath.join(
        yield* Effect.promise(() =>
          NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "openclaw-default-log-")),
        ),
        "requests.jsonl",
      );
      const argvLogPath = `${requestLogPath}.argv`;
      const wrapperPath = yield* Effect.promise(() => makeWrapper(requestLogPath, argvLogPath));
      const adapter = yield* makeOpenClawAdapter({
        ...defaultSettings,
        binaryPath: wrapperPath,
      });
      const threadId = ThreadId.make("openclaw-default-thread");
      yield* adapter.startSession({
        threadId,
        provider: ProviderDriverKind.make("openclaw"),
        cwd: process.cwd(),
        runtimeMode: "full-access",
        modelSelection: {
          instanceId: ProviderInstanceId.make("openclaw"),
          model: "agent-default",
        },
      });

      const argvLog = yield* Effect.promise(() => NodeFSP.readFile(argvLogPath, "utf8"));
      assert.include(argvLog, "--session");
      assert.include(argvLog, "agent:main:croki:openclaw-default-thread");
      assert.notInclude(argvLog, "agent:croki:croki:openclaw-default-thread");
      yield* adapter.stopSession(threadId);
    }),
  );
});
