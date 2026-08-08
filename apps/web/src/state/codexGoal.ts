import { WS_METHODS } from "@croki/contracts";
import { createEnvironmentRpcCommand } from "@croki/client-runtime/state/runtime";

import { connectionAtomRuntime } from "../connection/runtime";

export const codexGoal = {
  get: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "codexGoal.get",
    tag: WS_METHODS.codexGoalGet,
  }),
  set: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "codexGoal.set",
    tag: WS_METHODS.codexGoalSet,
  }),
  setStatus: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "codexGoal.setStatus",
    tag: WS_METHODS.codexGoalSetStatus,
  }),
  clear: createEnvironmentRpcCommand(connectionAtomRuntime, {
    label: "codexGoal.clear",
    tag: WS_METHODS.codexGoalClear,
  }),
};
