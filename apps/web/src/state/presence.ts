import { createThreadPresenceAtoms } from "@croki/client-runtime/state/presence";

import { connectionAtomRuntime } from "../connection/runtime";

/** Thread presence is shared client-runtime state, scoped to this app's
 * authenticated environment connections. It contains no draft or transcript
 * data and is only mounted by multiplayer thread surfaces. */
export const threadPresence = createThreadPresenceAtoms(connectionAtomRuntime);
