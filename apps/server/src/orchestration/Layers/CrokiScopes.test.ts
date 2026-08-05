import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { serializeCrokiScopeObject } from "@croki/shared/crokiScopes";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { loadCrokiParentScopes } from "./CrokiScopes.ts";

it.layer(NodeServices.layer)("Croki parent scopes", (it) => {
  it.effect("loads validated Release and Venture perception from application references", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const cwd = yield* fileSystem.makeTempDirectoryScoped({ prefix: "croki-scopes-" });
      yield* fileSystem.makeDirectory(path.join(cwd, ".croki", "releases"), { recursive: true });
      yield* fileSystem.writeFileString(
        path.join(cwd, ".croki", "venture.croki"),
        serializeCrokiScopeObject({
          version: 1,
          kind: "venture",
          venture: { id: "jacob", name: "Jacob's venture", thesis: "Build coherent products." },
          audience: ["Founders"],
          distribution: [],
          businessModel: [],
          applications: [{ id: "croki", name: "Croki" }],
          capabilities: [],
          constraints: [],
          opportunities: [],
          conflicts: [],
          evidence: [],
        }),
      );
      yield* fileSystem.writeFileString(
        path.join(cwd, ".croki", "releases", "0.4.7.croki"),
        serializeCrokiScopeObject({
          version: 1,
          kind: "release",
          release: {
            id: "croki-0.4.7",
            name: "Croki 0.4.7",
            version: "0.4.7",
            status: "integrating",
          },
          parent: { application: "Croki", applicationId: "croki" },
          previous: { version: "0.4.5", reality: "Native Threads remain authoritative." },
          intent: "Give repositories product awareness.",
          concepts: [],
          product: { before: [], after: [], changes: [], removed: [] },
          gtm: { expression: [], demoMoments: [] },
          proof: [],
          successSignals: [],
          learnings: [],
          evidence: [],
        }),
      );

      const loaded = yield* loadCrokiParentScopes(cwd, {
        venture: ".croki/venture.croki",
        activeRelease: ".croki/releases/0.4.7.croki",
      });
      assert.include(loaded.venturePrompt ?? "", "Build coherent products");
      assert.include(loaded.releasePrompt ?? "", "Give repositories product awareness");
    }),
  );

  it.effect("fails open for unsafe or invalid references", () =>
    Effect.gen(function* () {
      const loaded = yield* loadCrokiParentScopes("/tmp", {
        venture: "../venture.croki",
        activeRelease: "../release.croki",
      });
      assert.isNull(loaded.venturePrompt);
      assert.isNull(loaded.releasePrompt);
    }),
  );
});
