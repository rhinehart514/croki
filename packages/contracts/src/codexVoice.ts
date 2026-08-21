import * as Schema from "effect/Schema";

import { ThreadId } from "./baseSchemas.ts";

export const CodexVoice = Schema.Literals([
  "alloy",
  "arbor",
  "ash",
  "ballad",
  "breeze",
  "cedar",
  "coral",
  "cove",
  "echo",
  "ember",
  "juniper",
  "maple",
  "marin",
  "sage",
  "shimmer",
  "sol",
  "spruce",
  "vale",
  "verse",
]);
export type CodexVoice = typeof CodexVoice.Type;

export const CodexVoiceStartInput = Schema.Struct({
  threadId: ThreadId,
  sdp: Schema.String,
  voice: Schema.optional(CodexVoice),
});
export type CodexVoiceStartInput = typeof CodexVoiceStartInput.Type;

export const CodexVoiceThreadInput = Schema.Struct({ threadId: ThreadId });
export type CodexVoiceThreadInput = typeof CodexVoiceThreadInput.Type;

export const CodexVoiceEvent = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("started"),
    realtimeSessionId: Schema.optional(Schema.String),
  }),
  Schema.Struct({ type: Schema.Literal("sdp"), sdp: Schema.String }),
  Schema.Struct({
    type: Schema.Literal("transcript.delta"),
    role: Schema.String,
    delta: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("transcript.done"),
    role: Schema.String,
    text: Schema.String,
  }),
  Schema.Struct({ type: Schema.Literal("error"), message: Schema.String }),
  Schema.Struct({ type: Schema.Literal("closed"), reason: Schema.optional(Schema.String) }),
]);
export type CodexVoiceEvent = typeof CodexVoiceEvent.Type;

export class CodexVoiceError extends Schema.TaggedErrorClass<CodexVoiceError>()("CodexVoiceError", {
  kind: Schema.Literals(["unsupported", "session-not-found", "invalid-request", "provider-error"]),
  message: Schema.String,
  fallback: Schema.Literal("dictation"),
}) {}
