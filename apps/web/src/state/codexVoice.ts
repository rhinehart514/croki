import { WS_METHODS } from "@croki/contracts";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "@croki/client-runtime/state/runtime";

import { connectionAtomRuntime } from "../connection/runtime";

export const codexVoice = {
  start: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "codexVoice.start",
    tag: WS_METHODS.codexVoiceStart,
  }),
  stop: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "codexVoice.stop",
    tag: WS_METHODS.codexVoiceStop,
  }),
  eventsAtom: createEnvironmentRpcSubscriptionAtomFamily(connectionAtomRuntime, {
    label: "codexVoice.events",
    tag: WS_METHODS.codexVoiceSubscribe,
    idleTtlMs: 0,
  }),
};
