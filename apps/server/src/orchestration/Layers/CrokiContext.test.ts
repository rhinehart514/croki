import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { serializeCrokiContext } from "@t3tools/shared/crokiContext";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { loadCrokiAgentContext } from "./ProviderCommandReactor.ts";

it.layer(NodeServices.layer)("Croki provider context", (it) => {
  it.effect("loads a repository snapshot for the generic provider turn boundary", () =>
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
            },
          ],
          edges: [],
        }),
      );

      const context = yield* loadCrokiAgentContext(cwd);
      assert.include(context ?? "", "Use one generic provider seam");
    }),
  );

  it.effect("treats missing or malformed context as optional", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const cwd = yield* fileSystem.makeTempDirectoryScoped({ prefix: "croki-context-" });
      assert.isNull(yield* loadCrokiAgentContext(cwd));
      yield* fileSystem.makeDirectory(path.join(cwd, ".croki"));
      yield* fileSystem.writeFileString(path.join(cwd, ".croki", "context.json"), "not json");
      assert.isNull(yield* loadCrokiAgentContext(cwd));
    }),
  );
});
