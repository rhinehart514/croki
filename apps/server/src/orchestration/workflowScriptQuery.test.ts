// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { ProjectId, ProviderInstanceId, ServerSettings, ThreadId } from "@croki/contracts";
import { it as effectIt } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { afterAll, assert, describe } from "vite-plus/test";
import { readWorkflowScript, type WorkflowScriptLookup } from "./workflowScriptQuery.ts";

const tempRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "croki-wf-script-"));
const claudeConfigDir = NodePath.join(tempRoot, "claude-work");
const root = NodePath.join(claudeConfigDir, "projects", "project");
NodeFS.mkdirSync(root, { recursive: true });
const scriptPath = NodePath.join(root, "run.js");
NodeFS.writeFileSync(scriptPath, "export const meta = {};\n");
const outside = NodePath.join(tempRoot, "outside.js");
NodeFS.writeFileSync(outside, "evil\n");
const link = NodePath.join(root, "sneaky.js");
NodeFS.symlinkSync(outside, link);

const threadId = ThreadId.make("thread-workflow-script");
const projectId = ProjectId.make("project-workflow-script");
const instanceId = ProviderInstanceId.make("claude_work");

function makeLookup(input?: {
  readonly homePath?: string;
  readonly environmentConfigDir?: string;
  readonly modelInstanceId?: ProviderInstanceId;
  readonly sessionInstanceId?: ProviderInstanceId;
}): WorkflowScriptLookup {
  const selectedInstanceId = input?.sessionInstanceId ?? instanceId;
  const settings = Schema.decodeSync(ServerSettings)({
    providerInstances: {
      [selectedInstanceId]: {
        driver: "claudeAgent",
        ...(input?.environmentConfigDir
          ? {
              environment: [
                {
                  name: "CLAUDE_CONFIG_DIR",
                  value: input.environmentConfigDir,
                  sensitive: false,
                },
              ],
            }
          : {}),
        config: { homePath: input?.homePath ?? claudeConfigDir },
      },
    },
  });
  return {
    getThread: () =>
      Effect.succeed(
        Option.some({
          projectId,
          worktreePath: null,
          modelSelection: { instanceId: input?.modelInstanceId ?? selectedInstanceId },
          session: input?.sessionInstanceId
            ? { providerInstanceId: input.sessionInstanceId }
            : null,
        }),
      ),
    getProject: () => Effect.succeed(Option.some({ workspaceRoot: tempRoot })),
    getSettings: Effect.succeed(settings),
  };
}

afterAll(() => {
  NodeFS.rmSync(tempRoot, { recursive: true, force: true });
});

describe("readWorkflowScript containment", () => {
  effectIt.effect("serves a real script from the originating Claude instance home", () =>
    Effect.gen(function* () {
      const result = yield* readWorkflowScript(
        { threadId, scriptPath },
        makeLookup({ homePath: claudeConfigDir }),
      );
      assert.include(result.contents, "export const meta");
      assert.equal(result.truncated, false);
    }),
  );

  effectIt.effect("uses the originating session's provider instance", () =>
    Effect.gen(function* () {
      const result = yield* readWorkflowScript(
        { threadId, scriptPath },
        makeLookup({
          homePath: claudeConfigDir,
          modelInstanceId: ProviderInstanceId.make("codex"),
          sessionInstanceId: instanceId,
        }),
      );
      assert.include(result.contents, "export const meta");
    }),
  );

  effectIt.effect("honors the instance CLAUDE_CONFIG_DIR when homePath is unset", () =>
    Effect.gen(function* () {
      const result = yield* readWorkflowScript(
        { threadId, scriptPath },
        makeLookup({ homePath: "", environmentConfigDir: claudeConfigDir }),
      );
      assert.include(result.contents, "export const meta");
    }),
  );

  effectIt.effect("rejects relative and non-js paths", () =>
    Effect.gen(function* () {
      const lookup = makeLookup();
      const relative = yield* Effect.exit(
        readWorkflowScript({ threadId, scriptPath: "run.js" }, lookup),
      );
      assert.equal(relative._tag, "Failure");
      const nonJs = yield* Effect.exit(
        readWorkflowScript({ threadId, scriptPath: scriptPath.replace(".js", ".ts") }, lookup),
      );
      assert.equal(nonJs._tag, "Failure");
    }),
  );

  effectIt.effect("rejects paths outside the instance root and symlink escapes", () =>
    Effect.gen(function* () {
      const lookup = makeLookup();
      const escaped = yield* Effect.exit(
        readWorkflowScript({ threadId, scriptPath: outside }, lookup),
      );
      assert.equal(escaped._tag, "Failure");
      // A symlink INSIDE the root pointing outside must fail specifically on
      // realpath re-containment — a "not-found" would mean the link was
      // never exercised and the assertion proves nothing.
      const sneaky = yield* Effect.exit(
        readWorkflowScript({ threadId, scriptPath: link }, lookup).pipe(
          Effect.flip,
          Effect.map((error) => error.reason),
        ),
      );
      assert.equal(sneaky._tag, "Success");
      if (sneaky._tag === "Success") {
        assert.equal(sneaky.value, "outside-root");
      }
    }),
  );
});
