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
  ThreadId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { ServerConfig } from "../../config.ts";
import type { OpenClawAdapterShape } from "../Services/OpenClawAdapter.ts";
import { makeOpenClawAdapter } from "./OpenClawAdapter.ts";

class OpenClawAdapter extends Context.Service<OpenClawAdapter, OpenClawAdapterShape>()(
  "t3/provider/Layers/OpenClawAdapter.test/OpenClawAdapter",
) {}

const dirname = NodePath.dirname(NodeURL.fileURLToPath(import.meta.url));
const mockAgentPath = NodePath.join(dirname, "../../../scripts/acp-mock-agent.ts");
const defaultSettings = Schema.decodeSync(OpenClawSettings)({});

async function makeWrapper(requestLogPath: string, argvLogPath: string): Promise<string> {
  const directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "croki-openclaw-acp-"));
  const wrapperPath = NodePath.join(directory, "openclaw");
  const script = `#!/bin/sh
printf '%s\\t' "$@" >> ${JSON.stringify(argvLogPath)}
printf '\\n' >> ${JSON.stringify(argvLogPath)}
export T3_ACP_REQUEST_LOG_PATH=${JSON.stringify(requestLogPath)}
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
});
