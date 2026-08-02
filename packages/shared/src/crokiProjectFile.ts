import * as Schema from "effect/Schema";

import { CrokiProjectFile, CROKI_PROJECT_FILE_SCHEMA_URL } from "@croki/contracts";

import { fromLenientJson } from "./schemaJson.ts";

/**
 * Codec between the raw `croki.json` file contents (lenient JSONC string) and the
 * decoded {@link CrokiProjectFile}.
 */
export const CrokiProjectFileFromJson = fromLenientJson(CrokiProjectFile);

/**
 * Build the publishable JSON Schema document for `croki.json` (draft 2020-12).
 *
 * Served from the marketing site at {@link CROKI_PROJECT_FILE_SCHEMA_URL} so
 * editors get LSP support via a `$schema` reference.
 */
export function buildCrokiProjectFileJsonSchema(): Record<string, unknown> {
  const document = Schema.toJsonSchemaDocument(CrokiProjectFile);
  const jsonSchema: Record<string, unknown> = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: CROKI_PROJECT_FILE_SCHEMA_URL,
    ...document.schema,
  };
  if (document.definitions && Object.keys(document.definitions).length > 0) {
    jsonSchema.$defs = document.definitions;
  }
  return jsonSchema;
}
