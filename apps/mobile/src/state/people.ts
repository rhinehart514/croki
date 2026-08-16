import { createPeopleEnvironmentAtoms } from "@croki/client-runtime/state/people";

import { connectionAtomRuntime } from "../connection/runtime";

export const peopleEnvironment = createPeopleEnvironmentAtoms(connectionAtomRuntime);
