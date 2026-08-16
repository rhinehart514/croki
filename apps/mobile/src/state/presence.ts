import { createThreadPresenceAtoms } from "@croki/client-runtime/state/presence";

import { connectionAtomRuntime } from "../connection/runtime";

/**
 * Ephemeral Thread presence is shared client-runtime state scoped to the
 * authenticated mobile environment connections. It carries no draft,
 * transcript, or durable membership data.
 */
export const threadPresence = createThreadPresenceAtoms(connectionAtomRuntime);
