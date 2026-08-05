import {
  buildCrokiConceptPrompt,
  CROKI_CONCEPT_LIMITS,
  crokiConceptIdFromBranch,
  crokiConceptRelativePath,
  parseCrokiConceptFile,
} from "@croki/shared/crokiConcepts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

/** Concept scope is optional project data and must never block a provider turn. */
export function loadCrokiConceptContext(cwd: string | undefined, branch: string | null) {
  if (!cwd || !branch) return Effect.succeed<string | null>(null);
  const conceptId = crokiConceptIdFromBranch(branch);
  if (!conceptId) return Effect.succeed<string | null>(null);
  return Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const pending = [conceptId];
    const visited = new Set<string>();
    const prompts: string[] = [];
    while (pending.length > 0 && visited.size < 4) {
      const id = pending.shift();
      if (!id || visited.has(id)) continue;
      visited.add(id);
      const conceptPath = path.join(cwd, crokiConceptRelativePath(id));
      if (!(yield* fileSystem.exists(conceptPath))) continue;
      const fileInfo = yield* fileSystem.stat(conceptPath);
      if (fileInfo.size > CROKI_CONCEPT_LIMITS.sourceBytes) continue;
      const contents = yield* fileSystem.readFileString(conceptPath);
      if (Buffer.byteLength(contents, "utf8") > CROKI_CONCEPT_LIMITS.sourceBytes) continue;
      const concept = yield* Effect.try(() => parseCrokiConceptFile(contents)).pipe(
        Effect.orElseSucceed(() => null),
      );
      if (!concept) continue;
      const prompt = buildCrokiConceptPrompt(concept);
      if (prompt && prompts.join("\n\n").length + prompt.length <= 16_000) prompts.push(prompt);
      if (concept.parent.concept) pending.push(concept.parent.concept);
      for (const relationship of concept.relationships) pending.push(relationship.target);
    }
    return prompts.join("\n\n") || null;
  }).pipe(Effect.orElseSucceed(() => null));
}
