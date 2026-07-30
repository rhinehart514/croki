import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { CROKI_CONTEXT_LIMITS, serializeCrokiContext } from "@t3tools/shared/crokiContext";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { isCrokiContextAppliedActivityPayload, loadCrokiAgentContext } from "./CrokiContext.ts";

it.layer(NodeServices.layer)("Croki provider context", (it) => {
  it.effect("loads a bounded repository snapshot and content-free receipt", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const cwd = yield* fileSystem.makeTempDirectoryScoped({ prefix: "croki-context-" });
      const contextDirectory = path.join(cwd, ".croki");
      yield* fileSystem.makeDirectory(contextDirectory);
      yield* fileSystem.writeFileString(
        path.join(contextDirectory, "context.json"),
        serializeCrokiContext({
          version: 1,
          product: "Croki",
          updatedAt: "2026-07-29T00:00:00.000Z",
          nodes: [
            {
              id: "decision-1",
              kind: "decision",
              status: "current",
              title: "Use one generic provider seam",
              body: "All built-in adapters receive the same context.",
              updatedAt: "2026-07-29T00:00:00.000Z",
              references: [
                {
                  kind: "file",
                  path: "apps/server/src/orchestration/Layers/CrokiContext.ts",
                  line: 1,
                },
                { kind: "url", url: "https://example.com/context-evidence" },
              ],
            },
            {
              id: "work-1",
              kind: "work",
              status: "provisional",
              title: "Make the receipt legible",
              body: "",
              updatedAt: "2026-07-29T00:00:00.000Z",
            },
          ],
          edges: [],
        }),
      );

      const context = yield* loadCrokiAgentContext(cwd);
      assert.include(context.prompt ?? "", "Use one generic provider seam");
      assert.include(context.prompt ?? "", "apps/server/src/orchestration/Layers/CrokiContext.ts");
      assert.include(context.prompt ?? "", "https://example.com/context-evidence");
      assert.deepInclude(context.receipt, {
        status: "loaded",
        relativePath: ".croki/context.json",
        version: 1,
        updatedAt: "2026-07-29T00:00:00.000Z",
        activeCount: 2,
        currentCount: 1,
        provisionalCount: 1,
        truncated: false,
      });
      assert.match(context.receipt.sha256 ?? "", /^[a-f0-9]{64}$/);
      assert.equal(context.receipt.renderedChars, context.prompt?.length);
    }),
  );

  it.effect("distinguishes absent, invalid, and oversized context without failing", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const cwd = yield* fileSystem.makeTempDirectoryScoped({ prefix: "croki-context-" });
      const contextDirectory = path.join(cwd, ".croki");

      assert.equal((yield* loadCrokiAgentContext(cwd)).receipt.status, "absent");

      yield* fileSystem.makeDirectory(contextDirectory);
      yield* fileSystem.writeFileString(path.join(contextDirectory, "context.json"), "not json");
      const invalid = yield* loadCrokiAgentContext(cwd);
      assert.equal(invalid.receipt.status, "invalid");
      assert.equal(invalid.receipt.errorCode, "invalid-json");
      assert.isNull(invalid.prompt);

      yield* fileSystem.writeFileString(
        path.join(contextDirectory, "context.json"),
        "x".repeat(CROKI_CONTEXT_LIMITS.sourceBytes + 1),
      );
      const oversized = yield* loadCrokiAgentContext(cwd);
      assert.equal(oversized.receipt.status, "oversized");
      assert.isNull(oversized.prompt);
    }),
  );
});

it("accepts only bounded, internally consistent persisted activity payloads", () => {
  const prompt =
    '<croki_product_context version="1">\n<current_canon>\n</current_canon>\n' +
    "<provisional_suggestions>\n</provisional_suggestions>\n</croki_product_context>";
  const payload = {
    sourceEventId: "event-1",
    messageId: "message-1",
    prompt,
    receipt: {
      status: "loaded",
      relativePath: ".croki/context.json",
      version: 1,
      sha256: "a".repeat(64),
      updatedAt: "2026-07-29T00:00:00.000Z",
      activeCount: 0,
      currentCount: 0,
      provisionalCount: 0,
      renderedChars: prompt.length,
      truncated: false,
    },
  };

  assert.isTrue(isCrokiContextAppliedActivityPayload(payload));
  assert.isFalse(
    isCrokiContextAppliedActivityPayload({
      sourceEventId: "event-1",
      messageId: "message-1",
      prompt: null,
      receipt: {},
    }),
  );
  assert.isFalse(
    isCrokiContextAppliedActivityPayload({
      ...payload,
      prompt: `${prompt}${"x".repeat(CROKI_CONTEXT_LIMITS.renderChars)}`,
    }),
  );
  assert.isFalse(
    isCrokiContextAppliedActivityPayload({
      ...payload,
      receipt: { ...payload.receipt, renderedChars: prompt.length - 1 },
    }),
  );
});
