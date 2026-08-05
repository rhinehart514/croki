import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { loadCrokiApplication } from "./CrokiApplication.ts";

it.effect("loads bounded application context and fails open", () =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const cwd = yield* fileSystem.makeTempDirectoryScoped({ prefix: "croki-application-" });
    const absent = yield* loadCrokiApplication(cwd);
    assert.equal(absent.status, "absent");
    assert.isNull(absent.prompt);

    const crokiDirectory = path.join(cwd, ".croki");
    const applicationPath = path.join(crokiDirectory, "application.croki");
    yield* fileSystem.makeDirectory(crokiDirectory);
    const legacyApplicationPath = path.join(crokiDirectory, "application.json");
    yield* fileSystem.writeFileString(
      legacyApplicationPath,
      `{
        "version": 1,
        "application": { "name": "Legacy Croki" },
        "released": {
          "version": "0.4.5", "summary": "Legacy input remains readable.",
          "product": [], "gtm": [], "learnings": [], "sources": []
        }
      }`,
    );
    const legacy = yield* loadCrokiApplication(cwd);
    assert.equal(legacy.status, "loaded");
    assert.equal(legacy.sourcePath, ".croki/application.json");
    assert.include(legacy.prompt ?? "", 'source=".croki/application.json"');
    yield* fileSystem.remove(legacyApplicationPath);

    yield* fileSystem.writeFileString(
      applicationPath,
      `{
        "version": 1,
        "application": { "name": "Croki" },
        "released": {
          "version": "0.4.5",
          "summary": "Croki preserves native provider work.",
          "product": [], "gtm": [], "learnings": [],
          "sources": [{ "kind": "git-tag", "ref": "v0.4.5" }]
        },
        "building": {
          "version": "0.4.6",
          "intent": "Carry application reality into the next version.",
          "product": [], "gtm": [], "successSignals": []
        }
      }`,
    );
    const loaded = yield* loadCrokiApplication(cwd);
    assert.equal(loaded.status, "loaded");
    assert.include(loaded.prompt ?? "", '"version":"0.4.5"');
    assert.include(loaded.prompt ?? "", '"version":"0.4.6"');
    assert.include(loaded.prompt ?? "", 'source=".croki/application.croki"');
    assert.equal(loaded.sourcePath, ".croki/application.croki");

    yield* fileSystem.writeFileString(applicationPath, "not json");
    const invalid = yield* loadCrokiApplication(cwd);
    assert.equal(invalid.status, "invalid");
    assert.isNull(invalid.prompt);
    assert.equal(invalid.errorCode, "malformed");

    yield* fileSystem.writeFileString(applicationPath, "x".repeat(64 * 1024 + 1));
    const oversized = yield* loadCrokiApplication(cwd);
    assert.equal(oversized.status, "oversized");
    assert.isNull(oversized.prompt);
    assert.isNull(oversized.sha256);
  }).pipe(Effect.provide(NodeServices.layer)),
);
