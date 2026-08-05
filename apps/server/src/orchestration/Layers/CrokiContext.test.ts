import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { CROKI_CONTEXT_LIMITS, serializeCrokiContext } from "@croki/shared/crokiContext";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import {
  CROKI_PARALLEL_THREADS_INSTRUCTION,
  compileCrokiTurnInput,
  CROKI_GTM_HARNESS_INSTRUCTION,
  CROKI_PRODUCT_HARNESS_INSTRUCTION,
  CROKI_VENTURE_HARNESS_INSTRUCTION,
  isCrokiContextAppliedActivityPayload,
  loadCrokiAgentContext,
} from "./CrokiContext.ts";

it("adds the reversible Parallel Threads beta contract only when enabled", () => {
  const native = compileCrokiTurnInput({
    harnessId: "native",
    agentContext: null,
    userInput: "Investigate the startup regression",
    parallelThreadsEnabled: true,
  });
  assert.include(native ?? "", CROKI_PARALLEL_THREADS_INSTRUCTION);
  assert.include(native ?? "", "Investigate the startup regression");

  const disabled = compileCrokiTurnInput({
    harnessId: "native",
    agentContext: null,
    userInput: "Investigate the startup regression",
    parallelThreadsEnabled: false,
  });
  assert.equal(disabled, "Investigate the startup regression");
});

it("joins product and market reality in one explicit Venture turn", () => {
  const compiled = compileCrokiTurnInput({
    harnessId: "venture-v1",
    agentContext: "<croki_venture_context>founder truth</croki_venture_context>",
    userInput: "Make this direction true",
  });

  assert.isAtMost(CROKI_VENTURE_HARNESS_INSTRUCTION.length, 2_500);
  assert.equal(compiled?.match(/<croki_venture_harness version="1">/g)?.length, 1);
  assert.include(compiled ?? "", "develop the product and its market as one reality");
  assert.include(compiled ?? "", "Never promote observations or agent inferences");
  assert.include(compiled ?? "", "founder truth");
  assert.isTrue(compiled?.endsWith("Make this direction true"));
});

it("keeps native provider turns free of a Croki behavior prompt", () => {
  const agentContext = "<croki_product_context>canon</croki_product_context>";
  const userInput = "Keep this exact request";

  assert.equal(
    compileCrokiTurnInput({ harnessId: "native", agentContext, userInput }),
    `${agentContext}\n\n${userInput}`,
  );
  assert.notInclude(
    compileCrokiTurnInput({ harnessId: "native", agentContext, userInput }) ?? "",
    "croki_product_harness",
  );
  assert.notInclude(
    compileCrokiTurnInput({ harnessId: "native", agentContext, userInput }) ?? "",
    "croki_gtm_harness",
  );
  assert.equal(
    compileCrokiTurnInput({ harnessId: "native", agentContext: null, userInput }),
    userInput,
  );
  assert.isUndefined(
    compileCrokiTurnInput({
      harnessId: "native",
      agentContext: null,
      userInput: undefined,
    }),
  );
});

it("joins product and market ideation without weakening founder authority", () => {
  const agentContext = '<croki_product_context version="1">canon</croki_product_context>';
  const userInput = "Reconsider the project surface";
  const compiled = compileCrokiTurnInput({
    harnessId: "product-v1",
    agentContext,
    userInput,
  });

  assert.isAtMost(CROKI_PRODUCT_HARNESS_INSTRUCTION.length, 2_000);
  assert.equal(compiled?.match(/<croki_product_harness version="1">/g)?.length, 1);
  assert.include(compiled ?? "", "leave consequential judgment to the founder");
  assert.include(compiled ?? "", "Croki Senses");
  assert.include(compiled ?? "", "product, customer, market, positioning, and release direction");
  assert.include(compiled ?? "", "never create or rewrite .croki/application.croki");
  assert.include(compiled ?? "", "automatic visual projection of sensed state");
  assert.notInclude(compiled ?? "", "canvas_present");
  assert.include(compiled ?? "", "not project memory");
  assert.include(compiled ?? "", agentContext);
  assert.isTrue(compiled?.endsWith(userInput));
});

it("adds one bounded GTM harness without weakening founder authority", () => {
  const agentContext = "<croki_product_context>canon</croki_product_context>";
  const userInput = "Explore the first customer";
  const compiled = compileCrokiTurnInput({
    harnessId: "gtm-v1",
    agentContext,
    userInput,
  });

  assert.isAtMost(CROKI_GTM_HARNESS_INSTRUCTION.length, 1_500);
  assert.equal(compiled?.match(/<croki_gtm_harness version="1">/g)?.length, 1);
  assert.include(compiled ?? "", "leave consequential judgment to the founder");
  assert.include(compiled ?? "", "Do not ask the user to author or connect nodes");
  assert.include(compiled ?? "", "maintain a Canvas");
  assert.include(compiled ?? "", "automatic visual projection of sensed state");
  assert.include(compiled ?? "", agentContext);
  assert.isTrue(compiled?.endsWith(userInput));
});

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
          release: {
            version: "0.4.2",
            baseline: "0.4.1",
            goal: "Make the next release legible.",
            status: "active",
            items: [
              {
                id: "release-canvas",
                title: "Introduce Release Canvas",
                kind: "feature",
                status: "working",
                outcome: "See the candidate beside the Thread.",
                acceptanceCriteria: [],
                sourceThreads: [],
              },
            ],
          },
        }),
      );

      const context = yield* loadCrokiAgentContext(cwd);
      assert.include(context.prompt ?? "", "Use one generic provider seam");
      assert.include(context.prompt ?? "", "apps/server/src/orchestration/Layers/CrokiContext.ts");
      assert.include(context.prompt ?? "", "https://example.com/context-evidence");
      assert.include(context.prompt ?? "", "Introduce Release Canvas");
      assert.deepInclude(context.receipt, {
        status: "loaded",
        relativePath: ".croki/context.json",
        version: 1,
        updatedAt: "2026-07-29T00:00:00.000Z",
        activeCount: 1,
        currentCount: 1,
        provisionalCount: 1,
        truncated: false,
        releaseVersion: "0.4.2",
        releaseItemCount: 1,
      });
      assert.match(context.receipt.sha256 ?? "", /^[a-f0-9]{64}$/);
      assert.equal(context.receipt.renderedChars, context.prompt?.length);
      assert.notInclude(context.prompt ?? "", "Make the receipt legible");
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

  it.effect("applies valid canon when an individual proposal is malformed", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const cwd = yield* fileSystem.makeTempDirectoryScoped({ prefix: "croki-context-" });
      const contextDirectory = path.join(cwd, ".croki");
      yield* fileSystem.makeDirectory(contextDirectory);
      yield* fileSystem.writeFileString(
        path.join(contextDirectory, "context.json"),
        `{
          "version": 1,
          "product": "Croki",
          "updatedAt": "2026-07-29T00:00:00.000Z",
          "nodes": [
            {
              "id": "founder-canon",
              "kind": "decision",
              "status": "current",
              "title": "Threads remain the spine",
              "body": "Canvas is contextual.",
              "updatedAt": "2026-07-29T00:00:00.000Z"
            },
            {
              "id": "broken-proposal",
              "kind": "unknown",
              "status": "provisional",
              "title": "Malformed agent proposal",
              "body": "",
              "updatedAt": "2026-07-29T00:00:00.000Z"
            }
          ],
          "edges": []
        }`,
      );

      const context = yield* loadCrokiAgentContext(cwd);
      assert.equal(context.receipt.status, "partial");
      assert.equal(context.receipt.issueCount, 1);
      assert.equal(context.receipt.activeCount, 1);
      assert.include(context.prompt ?? "", "Threads remain the spine");
      assert.notInclude(context.prompt ?? "", "Malformed agent proposal");
    }),
  );
});

it("accepts only bounded, internally consistent persisted activity payloads", () => {
  const prompt =
    '<croki_product_context version="1">\n<current_canon>\n</current_canon>\n' +
    "</croki_product_context>";
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
  assert.isFalse(
    isCrokiContextAppliedActivityPayload({
      ...payload,
      receipt: { ...payload.receipt, status: "partial" },
    }),
  );
  assert.isTrue(
    isCrokiContextAppliedActivityPayload({
      ...payload,
      receipt: {
        ...payload.receipt,
        harnessId: "product-v1",
      },
    }),
  );
  assert.isFalse(
    isCrokiContextAppliedActivityPayload({
      ...payload,
      receipt: {
        ...payload.receipt,
        releaseVersion: "x".repeat(81),
        releaseItemCount: 61,
      },
    }),
  );
  assert.isTrue(
    isCrokiContextAppliedActivityPayload({
      ...payload,
      receipt: {
        ...payload.receipt,
        releaseVersion: "0.4.2",
        releaseItemCount: 3,
      },
    }),
  );
  assert.isFalse(
    isCrokiContextAppliedActivityPayload({
      ...payload,
      receipt: {
        ...payload.receipt,
        releaseVersion: "0.4.2",
      },
    }),
  );
  assert.isTrue(
    isCrokiContextAppliedActivityPayload({
      ...payload,
      receipt: {
        ...payload.receipt,
        status: "partial",
        errorCode: "malformed",
        issueCount: 1,
      },
    }),
  );
});
