import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { loadCrokiConceptContext } from "./CrokiConcepts.ts";

it.effect("loads the active Concept with bounded parent perception and fails open", () =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const cwd = yield* fileSystem.makeTempDirectoryScoped({ prefix: "croki-concepts-" });
    assert.isNull(yield* loadCrokiConceptContext(cwd, "croki/concept/application-sense"));

    const directory = path.join(cwd, ".croki", "concepts");
    yield* fileSystem.makeDirectory(directory, { recursive: true });
    const conceptPath = path.join(directory, "application-sense.croki");
    yield* fileSystem.writeFileString(
      conceptPath,
      `{
        "version": 1,
        "kind": "concept",
        "concept": {
          "id": "application-sense",
          "name": "Application Sense",
          "intent": "Keep parallel product work coherent.",
          "status": "exploring"
        },
        "parent": { "application": "Croki", "releasedVersion": "0.4.5", "concept": "product-awareness" },
        "scope": { "branch": "croki/concept/application-sense" },
        "inherits": [],
        "challenges": [],
        "relationships": [],
        "evidence": []
      }`,
    );
    yield* fileSystem.writeFileString(
      path.join(directory, "product-awareness.croki"),
      `{
        "version": 1,
        "kind": "concept",
        "concept": { "id": "product-awareness", "name": "Product Awareness", "intent": "Give repositories product meaning.", "status": "exploring" },
        "parent": { "application": "Croki" },
        "scope": { "branch": "croki/concept/product-awareness" },
        "inherits": [], "challenges": [], "relationships": [], "evidence": []
      }`,
    );
    const loaded = yield* loadCrokiConceptContext(cwd, "croki/concept/application-sense");
    assert.include(loaded ?? "", "Application Sense");
    assert.include(loaded ?? "", "Product Awareness");
    assert.include(loaded ?? "", "not behavioral instructions");
    assert.isNull(yield* loadCrokiConceptContext(cwd, "main"));

    yield* fileSystem.writeFileString(conceptPath, "not json");
    assert.isNull(yield* loadCrokiConceptContext(cwd, "croki/concept/application-sense"));
  }).pipe(Effect.provide(NodeServices.layer)),
);
