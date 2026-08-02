import { createRelayEnvironmentDiscoveryAtoms } from "@croki/client-runtime/state/relay";

import { connectionAtomRuntime } from "../connection/runtime";

export const relayEnvironmentDiscovery =
  createRelayEnvironmentDiscoveryAtoms(connectionAtomRuntime);
